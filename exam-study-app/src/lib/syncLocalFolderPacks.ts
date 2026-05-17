import { deleteQuestionsByPackId, getAllQuestions, importPack } from "./db";
import { validateQuestionPack } from "./validatePack";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * `시험 공부/문제/*.json` (exam-study-app의 부모에 있는 "문제" 폴더)를 Vite가
 * import.meta.glob으로 읽어 IndexedDB에 넣습니다.
 * 브라우저는 보안상 폴더를 임의로 읽을 수 없어, 이 방식(번들/개발서버)만 가능합니다.
 * 각 JSON 파일은 해당 pack 전체를 대표합니다 — 파일에서 빠진 문항은 DB에서도 제거됩니다.
 * 배포 뒤엔 `npm run build`로 다시 빌드하면 새 json이 반영됩니다.
 */
const localPacks = import.meta.glob("../../../문제/*.json", { eager: true });

function fileNameFromGlobKey(globKey: string): string {
  const s = globKey.replace(/\\/g, "/");
  return s.split("/").pop() ?? "unknown.json";
}

export type LocalFolderSyncResult = {
  fileCount: number;
  applied: number;
  /** 파일별 검증/저장 실패 (파일 없으면 0) */
  errors: string[];
};

/**
 * 앱이 데이터를 읽을 때마다 동기: 로컬 `문제` 폴더 → IndexedDB
 */
export async function syncLocalFolderPacksFromGlob(): Promise<LocalFolderSyncResult> {
  const errors: string[] = [];

  const entries = Object.entries(localPacks);
  if (entries.length === 0) {
    return { fileCount: 0, applied: 0, errors: [] };
  }

  const packIdsPresent = new Set<string>();

  let applied = 0;
  for (const [globKey, mod] of entries) {
    const name = fileNameFromGlobKey(globKey);
    const packId = `localfile:${name}`;
    packIdsPresent.add(packId);

    const data =
      mod && typeof mod === "object" && "default" in (mod as object)
        ? (mod as { default: unknown }).default
        : mod;
    if (data == null || (typeof data === "object" && (data as object) === null)) {
      errors.push(`${name}: JSON 비어 있음`);
      continue;
    }

    const baseName = name.replace(/\.json$/i, "");
    const packName = baseName || "local";

    if (isRecord(data) && Array.isArray(data.questions) && data.questions.length === 0) {
      try {
        await deleteQuestionsByPackId(packId);
        applied += 1;
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    const v = validateQuestionPack(data);
    if (!v.ok || !v.data) {
      errors.push(`${name}: ${v.errors.slice(0, 3).join(" · ")}${v.errors.length > 3 ? " …" : ""}`);
      continue;
    }
    try {
      await deleteQuestionsByPackId(packId);
      const r = await importPack(v.data.questions, "overwrite", { packId, packName });
      if (r.added + r.skipped + r.updated > 0) applied += 1;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const all = await getAllQuestions();
    const orphanPackIds = new Set<string>();
    for (const q of all) {
      const pid = q.packId;
      if (pid?.startsWith("localfile:") && !packIdsPresent.has(pid)) {
        orphanPackIds.add(pid);
      }
    }
    for (const pid of orphanPackIds) {
      await deleteQuestionsByPackId(pid);
    }
  } catch (e) {
    errors.push(`로컬 시험지 정리: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (import.meta.env.DEV && errors.length) {
    console.warn("[local 문제/]", errors);
  }
  return { fileCount: entries.length, applied, errors };
}
