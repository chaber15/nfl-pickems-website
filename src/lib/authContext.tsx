import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiMe, apiLogin, apiLogout, apiChangeUsername, type AuthUser } from "./api";

const USERNAME_KEY = "pickems_username";

interface AuthContextValue {
  user: AuthUser | null;
  username: string | null;
  loading: boolean;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  changeUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USERNAME_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refreshSession = async () => {
      try {
        const { user: u } = await apiMe();
        if (u) {
          setUser(u);
          setUsername(u.username);
          localStorage.setItem(USERNAME_KEY, u.username);
        } else {
          setUser(null);
          setUsername(null);
          localStorage.removeItem(USERNAME_KEY);
        }
      } catch {
        setUser(null);
        setUsername(null);
        localStorage.removeItem(USERNAME_KEY);
      } finally {
        setLoading(false);
      }
    };

    void refreshSession();

    const onStorage = (e: StorageEvent) => {
      if (e.key === USERNAME_KEY) void refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback(async (name: string) => {
    try {
      const { user: u } = await apiLogin(name.trim());
      setUser(u);
      setUsername(u.username);
      localStorage.setItem(USERNAME_KEY, u.username);
    } catch (err) {
      setUser(null);
      setUsername(null);
      localStorage.removeItem(USERNAME_KEY);
      throw err instanceof Error ? err : new Error("Login failed");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* ignore */
    }
    setUser(null);
    setUsername(null);
    localStorage.removeItem(USERNAME_KEY);
  }, []);

  const changeUsername = useCallback(async (name: string) => {
    const { user: u } = await apiChangeUsername(name);
    setUser(u);
    setUsername(u.username);
    localStorage.setItem(USERNAME_KEY, u.username);
  }, []);

  return (
    <AuthContext.Provider value={{ user, username, loading, login, logout, changeUsername }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
