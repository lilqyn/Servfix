import { createContext } from "react";
import type { AuthResponse, AuthUser } from "@/lib/auth";

export type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  signIn: (response: AuthResponse) => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
