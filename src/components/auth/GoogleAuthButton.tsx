import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthResponse, mapAuthErrorMessage } from "@/lib/auth";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

type GoogleAuthMode = "login" | "register";

type GoogleAuthButtonProps = {
  mode: GoogleAuthMode;
  role?: "buyer" | "provider";
  username?: string;
  displayName?: string;
  onAuth: (response: AuthResponse) => void;
  onError?: (message: string) => void;
};

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsIdClient = {
  initialize: (options: {
    client_id: string;
    callback: (credentialResponse: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme: "outline";
      size: "large";
      type: "standard";
      text: "signin_with" | "signup_with";
      shape: "pill";
      logo_alignment: "left";
    },
  ) => void;
};

type GoogleIdentityNamespace = {
  accounts?: {
    id?: GoogleAccountsIdClient;
  };
};

const getGoogleIdentity = () =>
  (window as Window & { google?: GoogleIdentityNamespace }).google;

const GoogleAuthButton = ({
  mode,
  role,
  username,
  displayName,
  onAuth,
  onError,
}: GoogleAuthButtonProps) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const inFlightRef = useRef(false);
  const payloadRef = useRef({
    mode,
    role,
    username,
    displayName,
  });
  const handlersRef = useRef({ onAuth, onError });
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    googleClientId ? "loading" : "idle",
  );

  useEffect(() => {
    payloadRef.current = { mode, role, username, displayName };
  }, [mode, role, username, displayName]);

  useEffect(() => {
    handlersRef.current = { onAuth, onError };
  }, [onAuth, onError]);

  useEffect(() => {
    if (!googleClientId) {
      return;
    }

    let cancelled = false;
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-auth="gsi"]',
    );

    if (existingScript) {
      if (getGoogleIdentity()?.accounts?.id) {
        setStatus("ready");
        return;
      }

      const handleLoad = () => {
        if (!cancelled) {
          setStatus("ready");
        }
      };
      const handleError = () => {
        if (!cancelled) {
          setStatus("error");
        }
      };
      existingScript.addEventListener("load", handleLoad);
      existingScript.addEventListener("error", handleError);
      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", handleLoad);
        existingScript.removeEventListener("error", handleError);
      };
    }

    setStatus("loading");
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleAuth = "gsi";
    script.onload = () => {
      if (!cancelled) {
        setStatus("ready");
      }
    };
    script.onerror = () => {
      if (!cancelled) {
        setStatus("error");
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }

    if (!buttonRef.current) {
      return;
    }

    if (initializedRef.current) {
      return;
    }

    const google = getGoogleIdentity();
    if (!google?.accounts?.id) {
      setStatus("error");
      return;
    }

    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (credentialResponse: GoogleCredentialResponse) => {
        const token = credentialResponse?.credential;
        if (!token) {
          handlersRef.current.onError?.("Google sign-in failed. Please try again.");
          return;
        }

        if (inFlightRef.current) {
          return;
        }

        inFlightRef.current = true;
        try {
          const payload = payloadRef.current;
          const response = await apiFetch<AuthResponse>("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({
              idToken: token,
              mode: payload.mode,
              role: payload.role,
              username: payload.username?.trim() || undefined,
              displayName: payload.displayName?.trim() || undefined,
            }),
          });
          handlersRef.current.onAuth(response);
        } catch (error) {
          const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
          handlersRef.current.onError?.(message);
        } finally {
          inFlightRef.current = false;
        }
      },
    });

    buttonRef.current.innerHTML = "";
    google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      type: "standard",
      text: mode === "login" ? "signin_with" : "signup_with",
      shape: "pill",
      logo_alignment: "left",
    });

    initializedRef.current = true;
  }, [mode, status]);

  if (!googleClientId) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div ref={buttonRef} className="flex justify-center" />
      {status === "error" && (
        <p className="text-center text-xs text-muted-foreground">
          Google sign-in is unavailable right now.
        </p>
      )}
    </div>
  );
};

export default GoogleAuthButton;
