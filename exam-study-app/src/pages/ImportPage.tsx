import { useId, useState } from "react";
import { validateQuestionPack } from "../lib/validatePack";
import { importPack } from "../lib/db";
import { newId } from "../lib/id";
import type { UserState } from "../types/models";
import { readFileText } from "./importHelpers";

export function ImportPage({
  user,
  onImported,
  patchUser,
}: {
  user: UserState;
  onImported: (summary: { label: string; added: number; skipped: number; updated: number; total: number }) => void;
  patchUser: (p: (u: UserState) => UserState) => void;
}) {
  const [log, setLog] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const fileId = useId();

  async function onFile(f: File | null) {
    if (!f) return;
    setBusy(true);
    setLog("읽는 중…");
    try {
      const text = await readFileText(f);
      const raw = JSON.parse(text) as unknown;
      const v = validateQuestionPack(raw);
      if (!v.ok || !v.data) {
        setLog("유효성 실패:\n" + v.errors.join("\n"));
        return;
      }
      const packId = newId();
      const fromFile = f.name.replace(/\.json$/i, "") || f.name;
      const packName = fromFile;
      const { added, skipped, updated } = await importPack(
        v.data.questions,
        user.settings.duplicateIdStrategy,
        { packId, packName }
      );
      setLog(
        `「${fromFile}」\n추가 ${added} / 건너뛴 ${skipped} (동일 id) / 덮어쓰기 ${updated}\n` +
          `총 ${v.data.questions.length}문항(파일 내) 처리.`
      );
      onImported({
        label: packName,
        added,
        skipped,
        updated,
        total: v.data.questions.length,
      });
    } catch (e) {
      setLog("오류: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2 className="card-title">JSON 파일</h2>
        <p className="muted">
          다른 도구에게 붙여 넣어 생성할 때 쓸 <code>questions</code> 형식 예시:{" "}
          <a href="/examples/question-pack.example.json" target="_blank" rel="noreferrer">
            question-pack.example.json
          </a>
        </p>
        <div className="row option-row" style={{ margin: "8px 0" }}>
          <span className="tiny">중복 id:</span>
          <label className="option-chip">
            <input
              type="radio"
              name="dup"
              checked={user.settings.duplicateIdStrategy === "skip"}
              onChange={() => {
                patchUser((u) => ({
                  ...u,
                  settings: { ...u.settings, duplicateIdStrategy: "skip" },
                }));
              }}
            />
            건너뛰기
          </label>
          <label className="option-chip">
            <input
              type="radio"
              name="dup"
              checked={user.settings.duplicateIdStrategy === "overwrite"}
              onChange={() => {
                patchUser((u) => ({
                  ...u,
                  settings: { ...u.settings, duplicateIdStrategy: "overwrite" },
                }));
              }}
            />
            덮어쓰기
          </label>
        </div>
        <label className="field" htmlFor={fileId}>
          .json 파일 선택
        </label>
        <input
          id={fileId}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.currentTarget.value = "";
          }}
        />
        {log && (
          <pre className="feedback-card" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
            {log}
          </pre>
        )}
      </div>
    </div>
  );
}
