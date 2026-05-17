import { useId, useState } from "react";
import type { EssayAiProvider, UserState } from "../types/models";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_GEMINI_MODEL, verifyGeminiApiKey } from "../lib/aiGrading";
import { exportBackup, restoreBackup } from "../lib/db";
import { readFileText } from "./importHelpers";

const GEMINI_DOC = "https://ai.google.dev/gemini-api/docs/quickstart?hl=ko";

export function SettingsPage({
  user,
  patchUser,
  onDataRestored,
  onReloadData,
}: {
  user: UserState;
  patchUser: (p: (u: UserState) => UserState) => void;
  onDataRestored: () => void;
  /** 로컬 `문제` 폴더 동기화 + IndexedDB 다시 읽기 */
  onReloadData: () => void;
}) {
  const aId = useId();
  const gId = useId();
  const mGemId = useId();
  const mAntId = useId();
  const backupFileId = useId();
  const [revealA, setRevealA] = useState(false);
  const [revealG, setRevealG] = useState(false);
  const [msg, setMsg] = useState("");
  const [geminiVerifyBusy, setGeminiVerifyBusy] = useState(false);
  const [geminiVerifyText, setGeminiVerifyText] = useState<string | null>(null);

  const prov: EssayAiProvider = user.settings.essayAiProvider ?? "gemini";

  async function handleExportBackup() {
    try {
      const payload = await exportBackup();
      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `exam-study-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("백업 파일을 다운로드했습니다.");
    } catch (e) {
      setMsg(`백업 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleRestoreBackup(file: File | null) {
    if (!file) return;
    try {
      const text = await readFileText(file);
      const raw = JSON.parse(text) as unknown;
      const ok = confirm(
        "복원하면 현재 문제/풀이기록/오답/찜/설정을 백업 파일 내용으로 전체 교체합니다. 계속할까요?"
      );
      if (!ok) return;
      await restoreBackup(raw);
      onDataRestored();
      setMsg("복원이 완료되었습니다.");
    } catch (e) {
      setMsg(`복원 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="page-stack">
      <div className="card">
        <h2 className="card-title">훑기</h2>
        <p className="muted" style={{ margin: "0 0 0.5rem" }}>
          데이터·키는 <strong>이 PC 브라우저(IndexedDB)</strong>에만 머뭅니다. <strong>API 키는 채팅·이메일에 보내지 마세요.</strong>{" "}
          (유출이 의심되면 Google/Anthropic에서 키를 갱신하세요.)
        </p>
        <label className="option-chip" style={{ display: "flex", margin: "0.2rem 0" }}>
          <input
            type="checkbox"
            checked={user.settings.animationOn}
            onChange={() => { patchUser((u) => ({ ...u, settings: { ...u.settings, animationOn: !u.settings.animationOn } })); }}
          />{" "}
          정답 효과(짧은 애니메이션)
        </label>
        <h3 className="settings-h3" style={{ margin: "0.6rem 0 0" }}>가져올 때·중복 id</h3>
        <div className="row option-row" style={{ marginTop: 4 }}>
          <label className="option-chip">
            <input
              type="radio"
              name="d"
              checked={user.settings.duplicateIdStrategy === "skip"}
              onChange={() => { patchUser((u) => ({ ...u, settings: { ...u.settings, duplicateIdStrategy: "skip" } })); }}
            />{" "}
            건너뛰기(안전)
          </label>
          <label className="option-chip">
            <input
              type="radio"
              name="d"
              checked={user.settings.duplicateIdStrategy === "overwrite"}
              onChange={() => { patchUser((u) => ({ ...u, settings: { ...u.settings, duplicateIdStrategy: "overwrite" } })); }}
            />{" "}
            덮어쓰기
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">로컬 문제 폴더 (자동 반영)</h2>
        <p className="tiny muted" style={{ margin: "0 0 0.4rem" }}>
          PC의 <code>시험 공부</code> 폴더 안 <code>문제</code>에 <code>*.json</code>을 두면, 아래 <strong>다시 읽기</strong> 또는 앱 로드 시(새로고침) 그대로
          <strong> 똑같이 import</strong>돼서 IndexedDB에 쌓입니다. 브라우저는 보안상 랜덤한 폴더를 읽을 수 없어, 열릴 수 있는
          <strong> Vite(개발/빌드)</strong>이 파일을 묶는 방식입니다.
        </p>
        <ul className="settings-msg" style={{ listStyle: "disc", margin: "0.35rem 0 0.5rem 1.1rem", padding: 0 }}>
          <li>새 <code>json</code>을 넣은 뒤 <strong>개발 서버</strong>는 보통 HMR/재시작으로 잡힙니다. 배포에선 <code>npm run build</code>로 다시 빌드하세요.</li>
          <li>중복 문항 <code>id</code>는 위 <strong>건너뛰기 / 덮어쓰기</strong> 설정이 그대로 적용됩니다.</li>
        </ul>
        <div className="row">
          <button className="btn" type="button" onClick={onReloadData}>
            다시 읽기 (로컬 폴더 → 저장소)
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">서술형 · AI 보조채점</h2>
        <p className="tiny muted" style={{ margin: "0 0 0.4rem" }}>
          무료로 시작하려면 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>에서 키를 만든 뒤 Gemini를 선택하세요. 사용량·한도는 Google 정책을 따릅니다.{" "}
          <a href={GEMINI_DOC} target="_blank" rel="noreferrer">문서(빠른 시작)</a> 참고.
        </p>
        <label className="option-chip" style={{ display: "flex", margin: "0.25rem 0" }}>
          <input
            type="checkbox"
            checked={user.settings.aiGradingOn}
            onChange={() => { patchUser((u) => ({ ...u, settings: { ...u.settings, aiGradingOn: !u.settings.aiGradingOn } })); }}
          />{" "}
          <strong>서술형·짧은 문장형</strong>에서 <strong>AI로 채점</strong> 버튼 켜기(키·제공자 설정 시)
        </label>
        <p className="field" style={{ margin: "0.5rem 0 0" }}>채점 API</p>
        <div className="row option-row">
          <label className="option-chip">
            <input
              type="radio"
              name="prov"
              checked={prov === "gemini"}
              onChange={() => { patchUser((u) => ({ ...u, settings: { ...u.settings, essayAiProvider: "gemini" } })); }}
            />{" "}
            Google Gemini
          </label>
          <label className="option-chip">
            <input
              type="radio"
              name="prov"
              checked={prov === "anthropic"}
              onChange={() => { patchUser((u) => ({ ...u, settings: { ...u.settings, essayAiProvider: "anthropic" } })); }}
            />{" "}
            Anthropic
          </label>
        </div>
        {prov === "gemini" && (
          <>
            <p className="tiny muted" style={{ margin: "0.4rem 0 0" }}>
              키는 <strong>입력하는 대로</strong> 이 브라우저(IndexedDB)에 저장됩니다. <strong>저장·연결</strong> 전용 버튼은 없습니다(자동 저장). 아래
              <strong> 키 연결 확인</strong>은 Google 서버에 한 번 붙어 볼 때만 씁니다.
            </p>
            <p className="field" style={{ marginTop: "0.4rem" }}>
              Gemini API key
            </p>
            <div className="row" style={{ width: "100%", maxWidth: "32rem", gap: 8, flexWrap: "nowrap" }}>
              <input
                id={gId}
                type={revealG ? "text" : "password"}
                value={user.settings.geminiApiKey ?? ""}
                placeholder="AIza…"
                onChange={(e) => {
                  setGeminiVerifyText(null);
                  patchUser((u) => ({ ...u, settings: { ...u.settings, geminiApiKey: e.target.value } }));
                }}
                autoComplete="off"
                spellCheck={false}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn" type="button" onClick={() => { setRevealG((v) => !v); }}>{revealG ? "가리기" : "보이기"}</button>
            </div>
            <div className="row" style={{ marginTop: 6, flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={geminiVerifyBusy || !user.settings.geminiApiKey?.trim()}
                onClick={() => {
                  setGeminiVerifyText(null);
                  setGeminiVerifyBusy(true);
                  void verifyGeminiApiKey(user.settings.geminiApiKey ?? "")
                    .then((r) => {
                      if (r.ok) {
                        setGeminiVerifyText("연결 OK — 키가 Google에서 인식됐어요. 서술형 시험에서 ‘AI로 채점’을 쓰려면 ‘서술형에서 AI로 채점’도 켜 주세요.");
                      } else {
                        setGeminiVerifyText("실패: " + r.message);
                      }
                    })
                    .catch((e) => {
                      setGeminiVerifyText("실패: " + (e instanceof Error ? e.message : String(e)));
                    })
                    .finally(() => {
                      setGeminiVerifyBusy(false);
                    });
                }}
              >{geminiVerifyBusy ? "확인 중…" : "키 연결 확인"}</button>
            </div>
            {geminiVerifyText && (
              <p className={geminiVerifyText.startsWith("연결 OK") ? "ok tiny" : "bad tiny"} style={{ margin: "6px 0 0", maxWidth: "36rem" }}>
                {geminiVerifyText}
              </p>
            )}
            <p className="field" id={mGemId}>
              모델 ID(비우면 {DEFAULT_GEMINI_MODEL})
            </p>
            <input
              type="text"
              aria-labelledby={mGemId}
              value={user.settings.geminiModel ?? ""}
              placeholder={DEFAULT_GEMINI_MODEL}
              onChange={(e) => { patchUser((u) => ({ ...u, settings: { ...u.settings, geminiModel: e.target.value } })); }}
              style={{ maxWidth: "24rem" }}
              autoComplete="off"
            />
          </>
        )}
        {prov === "anthropic" && (
          <>
            <p className="tiny muted" style={{ margin: "0.4rem 0 0" }}>
              키·모델명은 <strong>입력하는 대로</strong> 이 브라우저에 자동 저장됩니다.
            </p>
            <p className="field" style={{ marginTop: "0.4rem" }}>API 키 (Anthropic)</p>
            <div className="row" style={{ width: "100%", maxWidth: "32rem", gap: 8, flexWrap: "nowrap" }}>
              <input
                id={aId}
                type={revealA ? "text" : "password"}
                value={user.settings.anthropicApiKey ?? ""}
                placeholder="sk-ant-…"
                onChange={(e) => { patchUser((u) => ({ ...u, settings: { ...u.settings, anthropicApiKey: e.target.value } })); }}
                autoComplete="off"
                spellCheck={false}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn" type="button" onClick={() => { setRevealA((v) => !v); }}>{revealA ? "가리기" : "보이기"}</button>
            </div>
            <p className="field" id={mAntId}>
              모델 ID(비우면 {DEFAULT_ANTHROPIC_MODEL})
            </p>
            <input
              type="text"
              aria-labelledby={mAntId}
              value={user.settings.anthropicModel ?? ""}
              placeholder={DEFAULT_ANTHROPIC_MODEL}
              onChange={(e) => { patchUser((u) => ({ ...u, settings: { ...u.settings, anthropicModel: e.target.value } })); }}
              style={{ maxWidth: "24rem" }}
              autoComplete="off"
            />
          </>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">백업 & 복원</h2>
        <p className="tiny muted" style={{ margin: "0 0 0.4rem" }}>전체(키 포함) JSON.</p>
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={() => { void handleExportBackup(); }}>
            전체 백업 내려받기
          </button>
        </div>
        <p className="field" style={{ marginTop: "0.75rem" }}>복원(파일)</p>
        <label className="sr-only" htmlFor={backupFileId}>
          백업 JSON
        </label>
        <input
          id={backupFileId}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleRestoreBackup(f);
            e.currentTarget.value = "";
          }}
        />
        {msg && <p className="settings-msg">{msg}</p>}
      </div>
    </div>
  );
}
