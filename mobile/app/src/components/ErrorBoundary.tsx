import { Component, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>!</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app ran into an unexpected error. Try again or restart the app.
          </Text>
          {__DEV__ && this.state.error ? (
            <Text style={styles.debug}>{this.state.error.message}</Text>
          ) : null}
          <Pressable onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 32,
  },
  emoji: { fontSize: 48, fontWeight: "800", color: "#ef4444" },
  title: { color: "#1e293b", fontSize: 20, fontWeight: "800" },
  body: { color: "#64748b", fontSize: 14, lineHeight: 20, textAlign: "center" },
  debug: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#7f1d1d",
    fontSize: 12,
    maxHeight: 120,
    padding: 12,
    width: "100%",
  },
  button: {
    backgroundColor: "#0f766e",
    borderRadius: 12,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
});
