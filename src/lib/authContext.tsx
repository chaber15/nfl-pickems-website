import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiMe, apiLogin, apiLogout, isDemoMode, type AuthUser } from "./api";
import { getStoredUsername, setStoredUsername } from "./localStorage";

interface AuthContextValue {
  user: AuthUser | null;
  username: string | null;
  loading: boolean;
  useBackend: boolean;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  setLocalUsername: (username: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState<string | null>(getStoredUsername());
  const [loading, setLoading] = useState(true);
  const [useBackend, setUseBackend] = useState(false);

  useEffect(() => {
    if (isDemoMode()) {
      setUseBackend(false);
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
          setUseBackend(false);
        }
      } catch {
        setUseBackend(false);
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
      setUser(null);
      setUseBackend(false);
      return;
    }
    try {
      const { user: u } = await apiLogin(display);
      setUser(u);
      setUsername(u.username);
      setStoredUsername(u.username);
      setUseBackend(true);
    } catch {
      setStoredUsername(display);
      setUsername(display);
      setUser(null);
      setUseBackend(false);
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

  const setLocalUsername = useCallback((name: string) => {
    const display = name.trim();
    setStoredUsername(display);
    setUsername(display);
  }, []);

  return (
    <AuthContext.Provider value={{ user, username, loading, useBackend, login, logout, setLocalUsername }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
