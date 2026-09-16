import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiMe, apiLogin, apiLogout, apiChangeUsername, isDemoMode, type AuthUser } from "./api";
import { getStoredUsername, setStoredUsername } from "./localStorage";

interface AuthContextValue {
  user: AuthUser | null;
  username: string | null;
  loading: boolean;
  useBackend: boolean;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  changeUsername: (username: string) => Promise<void>;
  setLocalUsername: (username: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Demo-only: usernames that get the Admin nav + badge catalog. */
function isDemoAdminName(name: string): boolean {
  const key = name.trim().toLowerCase();
  return key === "admin" || key === "demo admin" || key === "demoadmin";
}

function demoUserFor(name: string): AuthUser {
  const username = name.trim();
  return {
    id: "demo-local",
    username,
    displayName: username,
    isAdmin: isDemoAdminName(username),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState<string | null>(getStoredUsername());
  const [loading, setLoading] = useState(true);
  const [useBackend, setUseBackend] = useState(false);

  useEffect(() => {
    if (isDemoMode()) {
      setUseBackend(false);
      const stored = getStoredUsername();
      if (stored) {
        setUsername(stored);
        setUser(demoUserFor(stored));
      }
      setLoading(false);
      return;
    }

    const refreshSession = async () => {
      try {
        const { user: u } = await apiMe();
        if (u) {
          setUser(u);
          setUsername(u.username);
          setStoredUsername(u.username);
          setUseBackend(true);
        } else {
          setUser(null);
          setUsername(null);
          setUseBackend(false);
          localStorage.removeItem("pickems_username");
        }
      } catch {
        setUser(null);
        setUsername(null);
        setUseBackend(false);
        localStorage.removeItem("pickems_username");
      } finally {
        setLoading(false);
      }
    };

    void refreshSession();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "pickems_username") void refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback(async (name: string) => {
    const display = name.trim();
    if (isDemoMode()) {
      setStoredUsername(display);
      setUsername(display);
      setUser(demoUserFor(display));
      setUseBackend(false);
      return;
    }
    try {
      const { user: u } = await apiLogin(display);
      setUser(u);
      setUsername(u.username);
      setStoredUsername(u.username);
      setUseBackend(true);
    } catch (err) {
      setUser(null);
      setUsername(null);
      setUseBackend(false);
      localStorage.removeItem("pickems_username");
      throw err instanceof Error ? err : new Error("Login failed");
    }
  }, []);

  const logout = useCallback(async () => {
    if (!isDemoMode()) {
      try {
        await apiLogout();
      } catch {
        /* ignore */
      }
    }
    setUser(null);
    setUsername(null);
    setUseBackend(false);
    localStorage.removeItem("pickems_username");
  }, []);

  const changeUsername = useCallback(async (name: string) => {
    if (isDemoMode()) {
      const display = name.trim();
      setStoredUsername(display);
      setUsername(display);
      setUser(demoUserFor(display));
      return;
    }
    const { user: u } = await apiChangeUsername(name);
    setUser(u);
    setUsername(u.username);
    setStoredUsername(u.username);
    setUseBackend(true);
  }, []);

  const setLocalUsername = useCallback((name: string) => {
    const display = name.trim();
    setStoredUsername(display);
    setUsername(display);
    if (isDemoMode()) setUser(demoUserFor(display));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, username, loading, useBackend, login, logout, changeUsername, setLocalUsername }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
