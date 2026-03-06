import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/providers/AuthProvider";
import { PushProvider } from "./src/providers/PushProvider";
import { AppNavigator } from "./src/navigation/AppNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </PushProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
