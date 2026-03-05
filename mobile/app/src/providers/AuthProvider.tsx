import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  fetchCurrentUser,
  getSessionTokens,
  subscribeToSessionTokens,
  setSessionTokens,
  signIn as signInRequest,
  signUp as signUpRequest,
  signOut as signOutRequest,
} from "../lib/api";
import type { AuthUser } from "../types";

const STORAGE_KEY = "servfix-mobile-auth";

type StoredAuthState = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isBooting: boolean;
  isSigningIn: boolean;
  isSigningUp: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (input: {
    identifier: string;
    username: string;
    password: string;
    role: "buyer" | "provider";
    displayName?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function persistState(
  user: AuthUser | null,
  tokens: ReturnType<typeof getSessionTokens> = getSessionTokens(),
) {
  if (!user) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }

  if (!tokens) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    } satisfies StoredAuthState),
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const isMounted = useRef(true);
  const userRef = useRef<AuthUser | null>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeToSessionTokens((tokens) => {
      void persistState(userRef.current, tokens);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && isMounted.current) {
          const parsed = JSON.parse(stored) as StoredAuthState;
          userRef.current = parsed.user;
          setUser(parsed.user);
          setSessionTokens({
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
          });
        }

        const remoteUser = await fetchCurrentUser();
        if (!isMounted.current) {
          return;
        }

        userRef.current = remoteUser;
        setUser(remoteUser);
        await persistState(remoteUser);
      } catch {
        if (!isMounted.current) {
          return;
        }

        setSessionTokens(null);
        userRef.current = null;
        setUser(null);
        await persistState(null);
      } finally {
        if (isMounted.current) {
          setIsBooting(false);
        }
      }
    };

    void bootstrap();
  }, []);

  const signIn = async (identifier: string, password: string) => {
    setIsSigningIn(true);
    try {
      const nextUser = await signInRequest({ identifier, password });
      if (!isMounted.current) {
        return;
      }

      userRef.current = nextUser;
      setUser(nextUser);
      await persistState(nextUser);
    } finally {
      if (isMounted.current) {
        setIsSigningIn(false);
      }
    }
  };

  const signUp = async (input: {
    identifier: string;
    username: string;
    password: string;
    role: "buyer" | "provider";
    displayName?: string;
  }) => {
    setIsSigningUp(true);
    try {
      const trimmedIdentifier = input.identifier.trim();
      const payload = trimmedIdentifier.includes("@")
        ? { email: trimmedIdentifier }
        : { phone: trimmedIdentifier };

      const nextUser = await signUpRequest({
        ...payload,
        username: input.username.trim(),
        password: input.password,
        role: input.role,
        displayName: input.displayName?.trim() || undefined,
      });

      if (!isMounted.current) {
        return;
      }

      userRef.current = nextUser;
      setUser(nextUser);
      await persistState(nextUser);
    } finally {
      if (isMounted.current) {
        setIsSigningUp(false);
      }
    }
  };

  const signOut = async () => {
    try {
      await signOutRequest();
    } catch {
      // Keep local state consistent even if the remote session is already gone.
    }

    if (!isMounted.current) {
      return;
    }

    userRef.current = null;
    setUser(null);
    await persistState(null);
  };

  return (
    <AuthContext.Provider value={{ user, isBooting, isSigningIn, isSigningUp, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
