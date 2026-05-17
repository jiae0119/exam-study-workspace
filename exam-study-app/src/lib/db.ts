import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Attempt, ExamSession, Question, UserState } from "../types/models";
import { defaultSettings } from "../types/models";

interface ExamAppDB extends DBSchema {
  questions: {
    key: string;
    value: Question;
  };
  attempts: {
    key: string;
    value: Attempt;
    indexes: { "by-question": string; "by-session": string };
  };
  sessions: { key: string; value: ExamSession };
  kv: { key: string; value: UserState | string | boolean };
}

const DB_NAME = "exam-study-v1";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<ExamAppDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ExamAppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ExamAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains("questions")) {
          db.createObjectStore("questions", { keyPath: "id" });
        } else if (oldVersion < 2) {
          const store = transaction.objectStore("questions") as unknown as IDBObjectStore;
          if (store.indexNames.contains("by-week")) {
            store.deleteIndex("by-week");
          }
        }
        if (!db.objectStoreNames.contains("attempts")) {
          const a = db.createObjectStore("attempts", { keyPath: "id" });
          a.createIndex("by-question", "questionId");
          a.createIndex("by-session", "examSessionId");
        }
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      },
    });
  }
  return dbPromise;
}

const USER_KEY = "userState";

function defaultUserState(): UserState {
  return {
    bookmarkedQuestionIds: [],
    wrongQuestionIds: [],
    settings: { ...defaultSettings },
  };
}

export async function getUserState(): Promise<UserState> {
  const db = await getDB();
  const v = await db.get("kv", USER_KEY);
  if (v && typeof v === "object" && "bookmarkedQuestionIds" in (v as UserState)) {
    return {
      ...defaultUserState(),
      ...v,
      settings: { ...defaultSettings, ...(v as UserState).settings },
    } as UserState;
  }
  return defaultUserState();
}

export async function saveUserState(s: UserState): Promise<void> {
  const db = await getDB();
  await db.put("kv", s, USER_KEY);
}

export async function putQuestion(q: Question): Promise<void> {
  const db = await getDB();
  await db.put("questions", q);
}

export async function getQuestion(id: string): Promise<Question | undefined> {
  const db = await getDB();
  return db.get("questions", id);
}

export async function getAllQuestions(): Promise<Question[]> {
  const db = await getDB();
  return db.getAll("questions");
}

export async function countQuestions(): Promise<number> {
  const db = await getDB();
  return db.count("questions");
}

export async function deleteAllQuestions(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("questions", "readwrite");
  await tx.store.clear();
  await tx.done;
}

/** 해당 packId 문제만 삭제 (로컬 JSON 동기 시「파일=전체」교체용) */
export async function deleteQuestionsByPackId(packId: string): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("questions");
  const ids = all.filter((q) => q.packId === packId).map((q) => q.id);
  if (ids.length === 0) return 0;
  const tx = db.transaction("questions", "readwrite");
  const store = tx.store;
  for (const id of ids) {
    await store.delete(id);
  }
  await tx.done;
  return ids.length;
}

export async function addAttempt(a: Attempt): Promise<void> {
  const db = await getDB();
  await db.put("attempts", a);
}

export async function getAttemptsBySession(examSessionId: string): Promise<Attempt[]> {
  const db = await getDB();
  return db.getAllFromIndex("attempts", "by-session", examSessionId);
}

export async function saveSession(s: ExamSession): Promise<void> {
  const db = await getDB();
  await db.put("sessions", s);
}

export async function getSession(id: string): Promise<ExamSession | undefined> {
  const db = await getDB();
  return db.get("sessions", id);
}

export async function getAllSessions(): Promise<ExamSession[]> {
  const db = await getDB();
  return db.getAll("sessions");
}

export async function importPack(
  questions: Question[],
  mode: "skip" | "overwrite",
  pack: { packId: string; packName: string }
): Promise<{ added: number; skipped: number; updated: number }> {
  let added = 0;
  let skipped = 0;
  let updated = 0;
  for (const q of questions) {
    const tagged: Question = {
      ...q,
      packId: pack.packId,
      packName: pack.packName,
    };
    const ex = await getQuestion(tagged.id);
    if (ex) {
      if (mode === "skip") {
        skipped++;
        continue;
      }
      await putQuestion(tagged);
      updated++;
    } else {
      await putQuestion(tagged);
      added++;
    }
  }
  return { added, skipped, updated };
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  userState: UserState;
  questions: Question[];
  attempts: Attempt[];
  sessions: ExamSession[];
}

export async function exportBackup(): Promise<BackupPayload> {
  const db = await getDB();
  const [userState, questions, attempts, sessions] = await Promise.all([
    getUserState(),
    db.getAll("questions"),
    db.getAll("attempts"),
    db.getAll("sessions"),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    userState,
    questions,
    attempts,
    sessions,
  };
}

function isValidBackupPayload(x: unknown): x is BackupPayload {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Partial<BackupPayload>;
  if (p.version !== 1) return false;
  if (typeof p.exportedAt !== "string") return false;
  if (!p.userState || typeof p.userState !== "object") return false;
  if (!Array.isArray(p.questions)) return false;
  if (!Array.isArray(p.attempts)) return false;
  if (!Array.isArray(p.sessions)) return false;
  return true;
}

export async function restoreBackup(raw: unknown): Promise<void> {
  if (!isValidBackupPayload(raw)) {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }
  const payload = raw as BackupPayload;
  const db = await getDB();
  const tx = db.transaction(["questions", "attempts", "sessions", "kv"], "readwrite");
  await tx.objectStore("questions").clear();
  await tx.objectStore("attempts").clear();
  await tx.objectStore("sessions").clear();

  for (const q of payload.questions) {
    await tx.objectStore("questions").put(q);
  }
  for (const a of payload.attempts) {
    await tx.objectStore("attempts").put(a);
  }
  for (const s of payload.sessions) {
    await tx.objectStore("sessions").put(s);
  }
  await tx.objectStore("kv").put(payload.userState, USER_KEY);
  await tx.done;
}
