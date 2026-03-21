import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/providers/AuthProvider";
import { PushProvider } from "./src/providers/PushProvider";
import { ThemeProvider, useTheme } from "./src/providers/ThemeProvider";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { ErrorBoundary } from "./src/components/ErrorBoundary";

function ThemedApp() {
  const { isDark } = useTheme();
  return (
    <AuthProvider>
      <PushProvider>
        <StatusBar style={isDark ? "light" : "dark"} />
        <AppNavigator />
      </PushProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
