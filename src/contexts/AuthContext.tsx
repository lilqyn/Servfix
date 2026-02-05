import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { AuthResponse, AuthUser, clearAuth, persistAuth } from "@/lib/auth";

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  signIn: (response: AuthResponse) => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "servfix-token";
const USER_KEY = "servfix-user";
const LEGACY_TOKEN_KEY = "serveghana-token";
const LEGACY_USER_KEY = "serveghana-user";

function readStoredAuth(): { token: string | null; user: AuthUser | null } {
  let token = localStorage.getItem(TOKEN_KEY);
  let rawUser = localStorage.getItem(USER_KEY);

  if (!token || !rawUser) {
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    const legacyUser = localStorage.getItem(LEGACY_USER_KEY);
    if (legacyToken && legacyUser) {
      token = legacyToken;
      rawUser = legacyUser;
      localStorage.setItem(TOKEN_KEY, legacyToken);
      localStorage.setItem(USER_KEY, legacyUser);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_USER_KEY);
    } else {
      return { token: null, user: null };
    }
  }

  try {
    const parsed = JSON.parse(rawUser) as AuthUser;
    return { token, user: parsed };
  } catch {
    return { token: null, user: null };
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [{ user, token }, setState] = useState(() => {
    const stored = readStoredAuth();
    return { user: stored.user, token: stored.token };
  });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredAuth();
    if (!stored.token || !stored.user) {
      clearAuth();
      setState({ user: null, token: null });
      setIsHydrated(true);
      return;
    }

    setState({ user: stored.user, token: stored.token });

    setIsHydrated(true);
  }, []);

  const signIn = (response: AuthResponse) => {
    persistAuth(response);
    setState({ user: response.user, token: response.token });
  };

  const signOut = () => {
    clearAuth();
    setState({ user: null, token: null });
  };

  const refreshUser = async () => {
    if (!token) {
      return;
    }

    try {
      const response = await apiFetch<{ user: AuthUser }>("/api/auth/me");
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      setState((prev) => ({ ...prev, user: response.user }));
    } catch {
      signOut();
    }
  };

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (token && !user) {
      refreshUser();
    }
  }, [isHydrated, token, user]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isHydrated,
      signIn,
      signOut,
      refreshUser,
    }),
    [user, token, isHydrated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
