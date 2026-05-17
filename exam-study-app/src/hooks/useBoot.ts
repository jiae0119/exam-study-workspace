import { useCallback, useEffect, useState } from "react";
import type { Question, UserState } from "../types/models";
import { getAllQuestions, getUserState, saveUserState } from "../lib/db";
import { defaultSettings } from "../types/models";
import { syncLocalFolderPacksFromGlob } from "../lib/syncLocalFolderPacks";

function defaultUser(): UserState {
  return {
    bookmarkedQuestionIds: [],
    wrongQuestionIds: [],
    settings: { ...defaultSettings },
  };
}

export type RefreshOptions = { silent?: boolean };

export function useBoot() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [user, setUser] = useState<UserState>(defaultUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: RefreshOptions) => {
    const silent = opts?.silent ?? false;
    setError(null);
    if (!silent) setLoading(true);
    try {
      await syncLocalFolderPacksFromGlob();
      const [q, u] = await Promise.all([getAllQuestions(), getUserState()]);
      setQuestions(q);
      setUser(u);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (silent && import.meta.env.DEV) {
        console.warn("[exam] 로컬 문제 새로고침 실패(무시):", msg);
      } else {
        setError(msg);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let interval = 0 as unknown as ReturnType<typeof setInterval>;
    let cancelled = false;
    let running = false;
    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        await refresh({ silent: true });
      } finally {
        running = false;
      }
    };
    interval = setInterval(() => {
      void poll();
    }, 2000);
    const onVisibility = () => {
      void poll();
    };
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const patchUser = useCallback((p: (prev: UserState) => UserState) => {
    setUser((prev) => {
      const n = p(prev);
      void saveUserState(n);
      return n;
    });
  }, []);

  return {
    questions,
    user,
    patchUser,
    loading,
    error,
    refresh,
  };
}
