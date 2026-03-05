import React, { useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { AuthResponse, AuthUser, clearAuth, persistAuth } from "@/lib/auth";
import { AuthContext } from "@/contexts/auth-context";

const USER_KEY = "servfix-user";
const LEGACY_USER_KEY = "serveghana-user";

function readStoredUser(): AuthUser | null {
  let rawUser = localStorage.getItem(USER_KEY);

  if (!rawUser) {
    const legacyUser = localStorage.getItem(LEGACY_USER_KEY);
    if (!legacyUser) {
      return null;
    }
    rawUser = legacyUser;
    localStorage.setItem(USER_KEY, legacyUser);
    localStorage.removeItem(LEGACY_USER_KEY);
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [isHydrated, setIsHydrated] = useState(false);

  const signOut = useCallback(() => {
    clearAuth();
    setUser(null);

    void apiFetch<{ status: "ok" }>("/api/auth/logout", {
      method: "POST",
    }).catch(() => {
      // client state is already cleared
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await apiFetch<{ user: AuthUser }>("/api/auth/me");
      persistAuth({ user: response.user });
      setUser(response.user);
    } catch {
      clearAuth();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        const response = await apiFetch<{ user: AuthUser }>("/api/auth/me");
        if (!isMounted) {
          return;
        }
        persistAuth({ user: response.user });
        setUser(response.user);
      } catch {
        if (!isMounted) {
          return;
        }
        clearAuth();
        setUser(null);
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = useCallback((response: AuthResponse) => {
    persistAuth(response);
    setUser(response.user);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isHydrated,
      signIn,
      signOut,
      refreshUser,
    }),
    [user, isHydrated, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
