import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
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

const USER_STORAGE_KEY = "servfix-mobile-user";
const LEGACY_STORAGE_KEY = "servfix-mobile-auth";
const ACCESS_TOKEN_STORAGE_KEY = "servfix_mobile_access_token";
const REFRESH_TOKEN_STORAGE_KEY = "servfix_mobile_refresh_token";

type StoredUserState = {
  user: AuthUser;
};

type StoredAuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type LegacyStoredAuthState = {
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
  updateUser: (user: AuthUser) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const parseJson = <T,>(raw: string | null) => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

async function persistUser(user: AuthUser | null) {
  if (!user) {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(
    USER_STORAGE_KEY,
    JSON.stringify({
      user,
    } satisfies StoredUserState),
  );
}

async function persistTokens(tokens: StoredAuthTokens | null = getSessionTokens()) {
  if (!tokens) {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY),
    ]);
    return;
  }

  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken),
  ]);
}

async function loadStoredAuthState(): Promise<{
  user: AuthUser | null;
  tokens: StoredAuthTokens | null;
}> {
  const [storedUserRaw, accessToken, refreshToken, legacyRaw] = await Promise.all([
    AsyncStorage.getItem(USER_STORAGE_KEY),
    SecureStore.getItemAsync(ACCESS_TOKEN_STORAGE_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY),
    AsyncStorage.getItem(LEGACY_STORAGE_KEY),
  ]);

  const storedUser = parseJson<StoredUserState>(storedUserRaw)?.user ?? null;
  const tokens = accessToken && refreshToken ? { accessToken, refreshToken } : null;
  const legacy = parseJson<LegacyStoredAuthState>(legacyRaw);

  let user = storedUser;
  let nextTokens = tokens;

  if (legacy) {
    if (!user) {
      user = legacy.user;
    }
    if (!nextTokens && legacy.accessToken && legacy.refreshToken) {
      nextTokens = {
        accessToken: legacy.accessToken,
        refreshToken: legacy.refreshToken,
      };
    }

    const migrationWrites: Promise<unknown>[] = [AsyncStorage.removeItem(LEGACY_STORAGE_KEY)];

    if (legacy.user) {
      migrationWrites.push(
        AsyncStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify({
            user: legacy.user,
          } satisfies StoredUserState),
        ),
      );
    }

    if (legacy.accessToken && legacy.refreshToken) {
      migrationWrites.push(
        SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, legacy.accessToken),
      );
      migrationWrites.push(
        SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, legacy.refreshToken),
      );
    }

    await Promise.all(migrationWrites);
  }

  return {
    user,
    tokens: nextTokens,
  };
}

async function clearStoredAuthState() {
  await Promise.all([
    persistUser(null),
    persistTokens(null),
    AsyncStorage.removeItem(LEGACY_STORAGE_KEY),
  ]);
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
      void persistTokens(tokens);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const stored = await loadStoredAuthState();
        if (isMounted.current && stored.user) {
          userRef.current = stored.user;
          setUser(stored.user);
        }
        if (stored.tokens) {
          setSessionTokens(stored.tokens);
        }

        const remoteUser = await fetchCurrentUser();
        if (!isMounted.current) {
          return;
        }

        userRef.current = remoteUser;
        setUser(remoteUser);
        await persistUser(remoteUser);
      } catch {
        if (!isMounted.current) {
          return;
        }

        setSessionTokens(null);
        userRef.current = null;
        setUser(null);
        await clearStoredAuthState();
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
      await persistUser(nextUser);
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
      await persistUser(nextUser);
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
    await clearStoredAuthState();
  };

  const updateUser = async (nextUser: AuthUser) => {
    userRef.current = nextUser;
    setUser(nextUser);
    await persistUser(nextUser);
  };

  return (
    <AuthContext.Provider value={{ user, isBooting, isSigningIn, isSigningUp, signIn, signUp, signOut, updateUser }}>
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
