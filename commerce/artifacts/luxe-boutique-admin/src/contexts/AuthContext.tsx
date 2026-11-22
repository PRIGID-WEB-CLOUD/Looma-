import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type User = {
  id: string;
  name: string;
  email: string;
  role?: string;
};

const SELLER_TOKEN_KEY = "looma_seller_session_token";

function readSellerSessionToken(): string {
  try {
    return typeof window !== "undefined" ? window.sessionStorage.getItem(SELLER_TOKEN_KEY) || "" : "";
  } catch {
    return "";
  }
}

export function setSellerSessionToken(token: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (token) {
      window.sessionStorage.setItem(SELLER_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(SELLER_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in sandboxed iframes
  }
}

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  quickLogin: (email?: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<{ error?: string }>;
  refetch: () => Promise<User | null>;
  completeSsoSession: (user: User, sessionToken?: string) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function getAdminAuthHeaders(): Record<string, string> {
  const token = readSellerSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (retries = 2): Promise<User | null> => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        headers: getAdminAuthHeaders(),
      });
      if (res.status === 503 && retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return fetchUser(retries - 1);
      }
      if (res.ok) {
        const data = (await res.json()) as User;
        setUser(data);
        setLoading(false);
        return data;
      }
      if (res.status === 401) {
        setSellerSessionToken(null);
      }
      setUser(null);
      setLoading(false);
      return null;
    } catch {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return fetchUser(retries - 1);
      }
      setUser(null);
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const completeSsoSession = useCallback((nextUser: User, sessionToken?: string) => {
    if (sessionToken) {
      setSellerSessionToken(sessionToken);
    }
    setUser(nextUser);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data);
      return {};
    }
    const data = await res.json();
    return { error: data.error || "Invalid email or password" };
  };

  const quickLogin = async (email?: string) => {
    try {
      const res = await fetch("/api/auth/admin/quick-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        return {};
      }
      const data = await res.json();
      return { error: data.error || "Quick login failed" };
    } catch {
      return { error: "Network error during quick login." };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: getAdminAuthHeaders(),
    }).catch(() => {});
    setSellerSessionToken(null);
    setUser(null);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data);
      return {};
    }
    const data = await res.json();
    return { error: data.error || "Registration failed" };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        quickLogin,
        logout,
        register,
        refetch: fetchUser,
        completeSsoSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
