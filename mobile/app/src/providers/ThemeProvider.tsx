import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import type { Palette } from "../theme";
import { darkPalette, lightPalette } from "../theme";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  palette: Palette;
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
};

const STORAGE_KEY = "servfix-theme-mode";

// ─── Context ─────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  // Load stored preference
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setModeState(stored);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode).catch(() => {});
  }, []);

  const resolvedMode: "light" | "dark" =
    mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;

  const pal = resolvedMode === "dark" ? darkPalette : lightPalette;

  const value = useMemo<ThemeContextValue>(
    () => ({
      palette: pal,
      mode,
      resolvedMode,
      setMode,
      isDark: resolvedMode === "dark",
    }),
    [pal, mode, resolvedMode, setMode],
  );

  if (!loaded) return null; // avoid flash of wrong theme

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
