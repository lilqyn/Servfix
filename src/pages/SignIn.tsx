import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  type AdminMfaChallengeResponse,
  AuthResponse,
  isAdminMfaChallengeResponse,
  isPhoneOtpChallengeResponse,
  mapAuthErrorMessage,
  type PhoneOtpChallengeResponse,
} from "@/lib/auth";
import { useAuth } from "@/contexts/useAuth";
import GoogleAuthButton from "@/components/auth/GoogleAuthButton";

const signInSchema = z
  .object({
    method: z.enum(["email", "phone"]),
    identifier: z.string().trim().min(1, "Email or phone is required"),
    password: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const identifier = values.identifier.trim();

    if (values.method === "email") {
      const isValidEmail = z.string().email().safeParse(identifier).success;
      if (!isValidEmail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid email address",
          path: ["identifier"],
        });
      }

      const password = values.password?.trim() ?? "";
      if (password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password must be at least 8 characters",
          path: ["password"],
        });
      }
      return;
    }

    const phoneDigits = identifier.replace(/\D/g, "");
    if (identifier.includes("@") || phoneDigits.length < 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid phone number",
        path: ["identifier"],
      });
    }
  });

type SignInFormValues = z.infer<typeof signInSchema>;

const SignIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phoneChallenge, setPhoneChallenge] = useState<PhoneOtpChallengeResponse | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [isPhoneRequesting, setIsPhoneRequesting] = useState(false);
  const [isPhoneVerifying, setIsPhoneVerifying] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<AdminMfaChallengeResponse | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const { signIn, user, isAuthenticated, isHydrated } = useAuth();
  const googleEnabled =
    import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true" &&
    Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      method: "email",
      identifier: "",
      password: "",
    },
    mode: "onSubmit",
  });
  const authMethod = form.watch("method");

  const handleAuthSuccess = (response: AuthResponse) => {
    signIn(response);
    toast.success("Welcome back!");

    const next = new URLSearchParams(location.search).get("next");
    if (next && next.startsWith("/")) {
      navigate(next);
      return;
    }

    navigate(response.user.role === "provider" ? "/dashboard" : "/browse");
  };

  const handleAuthError = (message: string) => {
    setSubmitError(message);
    toast.error(message);
  };

  const handleMfaChallenge = (challenge: AdminMfaChallengeResponse) => {
    setSubmitError(null);
    setMfaChallenge(challenge);
    setMfaCode("");
    toast.info(`Verification code sent to ${challenge.delivery.destination}`);
  };

  const handlePhoneChallenge = (challenge: PhoneOtpChallengeResponse) => {
    setSubmitError(null);
    setPhoneChallenge(challenge);
    setPhoneCode("");
    toast.info(`Verification code sent to ${challenge.delivery.destination}`);
  };

  const requestPhoneOtp = async (phone: string) => {
    setIsPhoneRequesting(true);
    try {
      const response = await apiFetch<AuthResponse | PhoneOtpChallengeResponse>(
        "/api/auth/phone/request-otp",
        {
          method: "POST",
          body: JSON.stringify({ phone, mode: "login" }),
        },
      );
      if (isPhoneOtpChallengeResponse(response)) {
        handlePhoneChallenge(response);
      }
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      handleAuthError(message);
    } finally {
      setIsPhoneRequesting(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (!phoneChallenge) {
      return;
    }
    const code = phoneCode.trim();
    if (!/^\d{6}$/.test(code)) {
      handleAuthError("Enter the 6-digit verification code.");
      return;
    }

    setIsPhoneVerifying(true);
    setSubmitError(null);
    try {
      const response = await apiFetch<AuthResponse>("/api/auth/phone/verify", {
        method: "POST",
        body: JSON.stringify({
          mode: "login",
          challengeToken: phoneChallenge.challengeToken,
          code,
        }),
      });
      setPhoneChallenge(null);
      setPhoneCode("");
      handleAuthSuccess(response);
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      handleAuthError(message);
    } finally {
      setIsPhoneVerifying(false);
    }
  };

  const onSubmit = async (values: SignInFormValues) => {
    setSubmitError(null);
    setMfaChallenge(null);
    setMfaCode("");
    const identifier = values.identifier.trim();

    if (values.method === "phone") {
      if (phoneChallenge) {
        await verifyPhoneOtp();
      } else {
        await requestPhoneOtp(identifier);
      }
      return;
    }

    setPhoneChallenge(null);
    setPhoneCode("");

    try {
      const response = await apiFetch<AuthResponse | AdminMfaChallengeResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: identifier,
          password: values.password,
        }),
      });

      if (isAdminMfaChallengeResponse(response)) {
        handleMfaChallenge(response);
        return;
      }

      handleAuthSuccess(response);
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      handleAuthError(message);
    }
  };

  const onVerifyMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mfaChallenge) {
      return;
    }

    const code = mfaCode.trim();
    if (!/^\d{6}$/.test(code)) {
      handleAuthError("Enter the 6-digit verification code.");
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
      handleAuthError(message);
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  const isSubmitting = form.formState.isSubmitting;
  const isPhoneFlow = !mfaChallenge && authMethod === "phone";
  const showPasswordField = !mfaChallenge && !isPhoneFlow;
  const isBusy = isSubmitting || isPhoneRequesting || isPhoneVerifying || isVerifyingMfa;

  if (isHydrated && isAuthenticated) {
    const destination = user?.role === "provider" ? "/dashboard" : "/browse";
    return <Navigate to={destination} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 pt-28 pb-16">
        <div className="mx-auto grid w-full max-w-4xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-primary">Welcome Back</p>
            <h1 className="text-3xl font-display font-bold text-foreground sm:text-4xl">
              Sign in to keep work moving.
            </h1>
            <p className="text-muted-foreground">
              Manage bookings, chat with clients, and track your services in one place.
            </p>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              New here?{" "}
              <Link to="/sign-up" className="font-semibold text-primary hover:underline">
                Create an account
              </Link>{" "}
              to start selling or booking trusted services across Ghana.
            </div>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Use your email or phone number to access your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              {!mfaChallenge && !phoneChallenge && !isPhoneFlow && googleEnabled && (
                <div className="space-y-4">
                  <GoogleAuthButton mode="login" onAuth={handleAuthSuccess} onError={handleAuthError} />
                  <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
                    <span className="h-px flex-1 bg-border/60" />
                    <span>or sign in with email</span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                </div>
              )}

              {!mfaChallenge ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="method"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sign in with</FormLabel>
                          <FormControl>
                            <Tabs
                              value={field.value}
                              onValueChange={(value) => {
                                if (value !== "email" && value !== "phone") {
                                  return;
                                }
                                field.onChange(value);
                                setSubmitError(null);
                                setPhoneChallenge(null);
                                setPhoneCode("");
                              }}
                            >
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="email" disabled={isBusy}>
                                  Email
                                </TabsTrigger>
                                <TabsTrigger value="phone" disabled={isBusy}>
                                  Phone
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="identifier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isPhoneFlow ? "Phone number" : "Email address"}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={isPhoneFlow ? "0240000000" : "you@example.com"}
                              autoComplete={isPhoneFlow ? "tel" : "email"}
                              {...field}
                              disabled={Boolean(phoneChallenge) || isBusy}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {showPasswordField && (
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Enter your password"
                                autoComplete="current-password"
                                {...field}
                                disabled={isBusy}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {isPhoneFlow && (
                      <div className="space-y-2">
                        {!phoneChallenge ? (
                          <p className="text-sm text-muted-foreground">
                            We will send a one-time verification code to your phone number.
                          </p>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground">
                              Enter the 6-digit code sent to {phoneChallenge.delivery.destination}.
                            </p>
                            <Input
                              value={phoneCode}
                              onChange={(event) =>
                                setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                              }
                              placeholder="123456"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              disabled={isBusy}
                            />
                          </>
                        )}
                      </div>
                    )}

                    {showPasswordField && (
                      <div className="flex items-center justify-between text-sm">
                        <Link to="/forgot-password" className="font-semibold text-primary hover:underline">
                          Forgot password?
                        </Link>
                      </div>
                    )}

                    <Button type="submit" variant="gold" className="w-full" disabled={isBusy}>
                      {isPhoneFlow
                        ? phoneChallenge
                          ? isPhoneVerifying
                            ? "Verifying..."
                            : "Verify and sign in"
                          : isPhoneRequesting
                            ? "Sending code..."
                            : "Send code"
                        : isSubmitting
                          ? "Signing in..."
                          : "Sign In"}
                    </Button>

                    {isPhoneFlow && phoneChallenge && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => {
                            const phone = form.getValues("identifier").trim();
                            if (phone) {
                              void requestPhoneOtp(phone);
                            }
                          }}
                        >
                          Resend code
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => {
                            setPhoneChallenge(null);
                            setPhoneCode("");
                          }}
                        >
                          Use different number
                        </Button>
                      </div>
                    )}
                  </form>
                </Form>
              ) : (
                <form onSubmit={onVerifyMfa} className="space-y-4">
                  <Alert>
                    <AlertDescription>
                      Enter the 6-digit verification code sent to {mfaChallenge.delivery.destination}.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <label htmlFor="admin-mfa-code" className="text-sm font-medium leading-none">
                      Verification code
                    </label>
                    <Input
                      id="admin-mfa-code"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <Button type="submit" variant="gold" className="w-full" disabled={isVerifyingMfa}>
                    {isVerifyingMfa ? "Verifying..." : "Verify code"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setMfaChallenge(null);
                      setMfaCode("");
                    }}
                    disabled={isVerifyingMfa}
                  >
                    Use a different account
                  </Button>
                </form>
              )}

              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/sign-up" className="font-semibold text-primary hover:underline">
                  Sign up
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SignIn;
