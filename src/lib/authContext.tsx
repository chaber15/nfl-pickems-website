import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  apiChangeUsername,
  apiLogin,
  apiLogout,
  apiMe,
  errorMessage,
  setUnauthorizedHandler,
  type AuthUser,
} from "./api";
import { clearCache } from "./cache";
import { storageGet, storageRemove, storageSet } from "./storage";

const USERNAME_KEY = "pickems_username";

interface AuthContextValue {
  user: AuthUser | null;
  /** Signed-in username. Kept from the last good session while the server is unreachable. */
  username: string | null;
  loading: boolean;
  /** Set when the session couldn't be checked (offline / server error). Never logs the user out. */
  sessionError: string | null;
  retrySession: () => Promise<void>;
  /** Throws ApiError (e.g. code USER_NOT_FOUND) — callers decide how to present it. */
  login: (username: string, opts?: { create?: boolean }) => Promise<{ created: boolean }>;
  logout: () => Promise<void>;
  changeUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState<string | null>(() => storageGet(USERNAME_KEY));
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  /** Bumped by login/logout so an older /auth/me answer can't overwrite a newer state. */
  const seqRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);

  const applyUser = useCallback((u: AuthUser) => {
    setUser(u);
    setUsername(u.username);
    setSessionError(null);
    storageSet(USERNAME_KEY, u.username);
  }, []);

  const clearLocal = useCallback(() => {
    setUser(null);
    setUsername(null);
    setSessionError(null);
    storageRemove(USERNAME_KEY);
    clearCache();
  }, []);

  const refreshSession = useCallback((): Promise<void> => {
    if (inflightRef.current) return inflightRef.current;
    const seq = seqRef.current;
    const p = (async () => {
      try {
        const { user: u } = await apiMe();
        if (seq !== seqRef.current) return;
        if (u) applyUser(u);
        else clearLocal();
      } catch (err) {
        if (seq !== seqRef.current) return;
        if (err instanceof ApiError && err.status === 401) {
          clearLocal();
        } else {
          // Offline or server trouble: keep the cached username, offer a retry.
          setSessionError(errorMessage(err, "Can't reach the server right now."));
        }
      } finally {
        if (seq === seqRef.current) setLoading(false);
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, [applyUser, clearLocal]);

  useEffect(() => {
    void refreshSession();

    const onStorage = (e: StorageEvent) => {
      if (e.key === USERNAME_KEY) void refreshSession();
    };
    window.addEventListener("storage", onStorage);
    setUnauthorizedHandler(() => void refreshSession());
    return () => {
      window.removeEventListener("storage", onStorage);
      setUnauthorizedHandler(null);
    };
  }, [refreshSession]);

  const login = useCallback(
    async (name: string, opts?: { create?: boolean }) => {
      const { user: u, created } = await apiLogin(name.trim(), opts?.create ?? false);
      seqRef.current++;
      clearCache();
      applyUser(u);
      setLoading(false);
      return { created: Boolean(created) };
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    seqRef.current++;
    try {
      await apiLogout();
    } catch {
      /* ignore — local sign-out still happens */
    }
    clearLocal();
    setLoading(false);
  }, [clearLocal]);

  const changeUsername = useCallback(
    async (name: string) => {
      const { user: u } = await apiChangeUsername(name);
      applyUser(u);
    },
    [applyUser],
  );

  const retrySession = useCallback(async () => {
    setSessionError(null);
    await refreshSession();
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, username, loading, sessionError, retrySession, login, logout, changeUsername }),
    [user, username, loading, sessionError, retrySession, login, logout, changeUsername],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
