import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  type AdminMfaChallengeResponse,
  type AuthResponse,
  isAdminMfaChallengeResponse,
  mapAuthErrorMessage,
} from "@/lib/auth";
import { getRoleLabel, type UserRole } from "@/lib/roles";
import { useAuth } from "@/contexts/useAuth";

type StaffInvitePreviewResponse = {
  invitation: {
    email: string;
    role: UserRole;
    expiresAt: string;
    requiresAccountSetup: boolean;
  };
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const StaffInviteAccept = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const token = searchParams.get("token")?.trim() ?? "";

  const [invitation, setInvitation] = useState<StaffInvitePreviewResponse["invitation"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [mfaChallenge, setMfaChallenge] = useState<AdminMfaChallengeResponse | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadInvitation = async () => {
      if (!token) {
        if (!isMounted) return;
        setLoadError("Missing invitation token.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await apiFetch<StaffInvitePreviewResponse>(
          `/api/auth/staff-invite?token=${encodeURIComponent(token)}`,
          { skipAuthRefresh: true },
        );
        if (!isMounted) return;
        setInvitation(response.invitation);
      } catch (error) {
        if (!isMounted) return;
        const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadInvitation();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleAuthSuccess = (response: AuthResponse) => {
    signIn(response);
    toast.success("Invitation accepted.");
    navigate("/admin");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!invitation) {
      setSubmitError("Invitation is invalid or expired.");
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const normalizedConfirmPassword = confirmPassword.trim();

    if (normalizedUsername && !USERNAME_PATTERN.test(normalizedUsername)) {
      setSubmitError("Username must be 3-20 characters and use letters, numbers, or underscores.");
      return;
    }

    if (invitation.requiresAccountSetup && normalizedPassword.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }

    if (normalizedPassword || normalizedConfirmPassword) {
      if (normalizedPassword.length < 8) {
        setSubmitError("Password must be at least 8 characters.");
        return;
      }
      if (normalizedPassword !== normalizedConfirmPassword) {
        setSubmitError("Passwords do not match.");
        return;
      }
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const response = await apiFetch<AuthResponse | AdminMfaChallengeResponse>(
        "/api/auth/staff-invite/accept",
        {
          method: "POST",
          body: JSON.stringify({
            token,
            ...(normalizedUsername ? { username: normalizedUsername } : {}),
            ...(normalizedPassword ? { password: normalizedPassword } : {}),
          }),
        },
      );

      if (isAdminMfaChallengeResponse(response)) {
        setMfaChallenge(response);
        setMfaCode("");
        toast.info(`Verification code sent to ${response.delivery.destination}`);
        return;
      }

      handleAuthSuccess(response);
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onVerifyMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mfaChallenge) {
      return;
    }

    const code = mfaCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setSubmitError("Enter the 6-digit verification code.");
      return;
    }

    setSubmitError(null);
    setIsVerifyingMfa(true);

    try {
      const response = await apiFetch<AuthResponse>("/api/auth/admin-mfa/verify", {
        method: "POST",
        body: JSON.stringify({
          mfaToken: mfaChallenge.mfaToken,
          code,
        }),
      });
      setMfaChallenge(null);
      setMfaCode("");
      handleAuthSuccess(response);
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 pt-28 pb-16">
        <div className="mx-auto max-w-lg">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Staff Invitation</CardTitle>
              <CardDescription>Accept your Servfix staff access invitation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading invitation...</p>
              ) : loadError ? (
                <Alert variant="destructive">
                  <AlertDescription>{loadError}</AlertDescription>
                </Alert>
              ) : invitation ? (
                <>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm space-y-1">
                    <p>
                      <span className="font-medium text-foreground">Email:</span> {invitation.email}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Role:</span> {getRoleLabel(invitation.role)}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Expires:</span>{" "}
                      {new Date(invitation.expiresAt).toLocaleString()}
                    </p>
                  </div>

                  {submitError && (
                    <Alert variant="destructive">
                      <AlertDescription>{submitError}</AlertDescription>
                    </Alert>
                  )}

                  {!mfaChallenge ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground" htmlFor="invite-username">
                          Username (optional)
                        </label>
                        <Input
                          id="invite-username"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          placeholder="yourname"
                          autoComplete="username"
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground" htmlFor="invite-password">
                          {invitation.requiresAccountSetup ? "Create password" : "Set new password (optional)"}
                        </label>
                        <Input
                          id="invite-password"
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground" htmlFor="invite-confirm-password">
                          Confirm password
                        </label>
                        <Input
                          id="invite-confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Re-enter password"
                          autoComplete="new-password"
                          disabled={isSubmitting}
                        />
                      </div>

                      <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? "Accepting..." : "Accept invitation"}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={onVerifyMfa} className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Enter the 6-digit verification code sent to {mfaChallenge.delivery.destination}.
                      </p>
                      <Input
                        value={mfaCode}
                        onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="123456"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        disabled={isVerifyingMfa}
                      />
                      <Button type="submit" className="w-full" disabled={isVerifyingMfa}>
                        {isVerifyingMfa ? "Verifying..." : "Verify and continue"}
                      </Button>
                    </form>
                  )}
                </>
              ) : null}

              <p className="text-xs text-muted-foreground">
                Need a fresh invitation? Ask your administrator, or <Link to="/sign-in" className="underline">sign in</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default StaffInviteAccept;
