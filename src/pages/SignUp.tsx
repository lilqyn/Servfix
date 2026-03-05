import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  AuthResponse,
  getIdentifierPayload,
  identifierSchema,
  isPhoneOtpChallengeResponse,
  mapAuthErrorMessage,
  type PhoneOtpChallengeResponse,
} from "@/lib/auth";
import { useAuth } from "@/contexts/useAuth";
import GoogleAuthButton from "@/components/auth/GoogleAuthButton";

const signUpSchema = z
  .object({
    identifier: identifierSchema,
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username cannot exceed 20 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, or underscores"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your password"),
    role: z.enum(["buyer", "provider"]),
    displayName: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }

    if (values.role === "provider") {
      const name = values.displayName?.trim() ?? "";
      if (name.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Business name must be at least 2 characters",
          path: ["displayName"],
        });
      }
    }
  });

type SignUpFormValues = z.infer<typeof signUpSchema>;

const SignUp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phoneChallenge, setPhoneChallenge] = useState<PhoneOtpChallengeResponse | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [isPhoneRequesting, setIsPhoneRequesting] = useState(false);
  const [isPhoneVerifying, setIsPhoneVerifying] = useState(false);
  const { signIn, user, isAuthenticated, isHydrated } = useAuth();
  const googleEnabled =
    import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true" &&
    Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      identifier: "",
      username: "",
      password: "",
      confirmPassword: "",
      role: "buyer",
      displayName: "",
    },
    mode: "onSubmit",
  });

  const role = form.watch("role");
  const username = form.watch("username");
  const displayName = form.watch("displayName");
  const identifier = form.watch("identifier");
  const isPhoneIdentifier = Boolean(identifier) && !identifier.includes("@");

  const handleAuthSuccess = (response: AuthResponse) => {
    signIn(response);
    toast.success("Account created successfully!");

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
          body: JSON.stringify({ phone, mode: "register" }),
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

  const onSubmit = async (values: SignUpFormValues) => {
    setSubmitError(null);
    const trimmedIdentifier = values.identifier.trim();
    const usingPhone = !trimmedIdentifier.includes("@");

    try {
      if (usingPhone) {
        if (!phoneChallenge) {
          await requestPhoneOtp(trimmedIdentifier);
          return;
        }

        const code = phoneCode.trim();
        if (!/^\d{6}$/.test(code)) {
          handleAuthError("Enter the 6-digit verification code.");
          return;
        }

        setIsPhoneVerifying(true);
        const response = await apiFetch<AuthResponse>("/api/auth/phone/verify", {
          method: "POST",
          body: JSON.stringify({
            mode: "register",
            challengeToken: phoneChallenge.challengeToken,
            code,
            register: {
              username: values.username.trim().toLowerCase(),
              password: values.password,
              role: values.role,
              ...(values.role === "provider" ? { displayName: values.displayName?.trim() } : {}),
            },
          }),
        });

        setPhoneChallenge(null);
        setPhoneCode("");
        handleAuthSuccess(response);
        return;
      }

      setPhoneChallenge(null);
      setPhoneCode("");
      const payload = {
        ...getIdentifierPayload(trimmedIdentifier),
        username: values.username.trim().toLowerCase(),
        password: values.password,
        role: values.role,
        ...(values.role === "provider" ? { displayName: values.displayName?.trim() } : {}),
      };

      const response = await apiFetch<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      handleAuthSuccess(response);
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      handleAuthError(message);
    } finally {
      if (usingPhone) {
        setIsPhoneVerifying(false);
      }
    }
  };

  const isSubmitting = form.formState.isSubmitting;
  const isBusy = isSubmitting || isPhoneRequesting || isPhoneVerifying;

  if (isHydrated && isAuthenticated) {
    const destination = user?.role === "provider" ? "/dashboard" : "/browse";
    return <Navigate to={destination} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 pt-28 pb-16">
        <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <Card className="order-2 shadow-lg lg:order-1">
            <CardHeader>
              <CardTitle>Create Your Account</CardTitle>
              <CardDescription>Join as a buyer or provider to access trusted services.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              {googleEnabled && !isPhoneIdentifier && !phoneChallenge && (
                <div className="space-y-4">
                  <GoogleAuthButton
                    mode="register"
                    role={role}
                    username={username}
                    displayName={displayName}
                    onAuth={handleAuthSuccess}
                    onError={handleAuthError}
                  />
                  <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
                    <span className="h-px flex-1 bg-border/60" />
                    <span>or sign up with email</span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                </div>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account type</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid gap-3 sm:grid-cols-2"
                          >
                            <div className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                              <RadioGroupItem value="buyer" id="role-buyer" />
                              <Label htmlFor="role-buyer" className="cursor-pointer">
                                I want to book services
                              </Label>
                            </div>
                            <div className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                              <RadioGroupItem value="provider" id="role-provider" />
                              <Label htmlFor="role-provider" className="cursor-pointer">
                                I provide services
                              </Label>
                            </div>
                          </RadioGroup>
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
                        <FormLabel>Email or phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@example.com or 0240000000"
                            autoComplete="email"
                            {...field}
                            disabled={Boolean(phoneChallenge) || isBusy}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="yourname"
                            autoComplete="username"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          3-20 characters. Letters, numbers, and underscores only.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {role === "provider" && (
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Ama's Catering" autoComplete="organization" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Create a password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Re-enter your password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isPhoneIdentifier && (
                    <div className="space-y-2">
                      {!phoneChallenge ? (
                        <p className="text-sm text-muted-foreground">
                          We will send a one-time verification code to your phone before creating your account.
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

                  <Button type="submit" variant="gold" className="w-full" disabled={isBusy}>
                    {isPhoneIdentifier
                      ? phoneChallenge
                        ? isPhoneVerifying
                          ? "Verifying..."
                          : "Verify phone & create account"
                        : isPhoneRequesting
                          ? "Sending code..."
                          : "Send verification code"
                      : isSubmitting
                        ? "Creating account..."
                        : "Create account"}
                  </Button>

                  {isPhoneIdentifier && phoneChallenge && (
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

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/sign-in" className="font-semibold text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>

          <div className="order-1 space-y-4 lg:order-2">
            <p className="text-sm font-semibold text-primary">Get Started</p>
            <h1 className="text-3xl font-display font-bold text-foreground sm:text-4xl">
              Build trusted connections with clients across Ghana.
            </h1>
            <p className="text-muted-foreground">
              Whether you are looking for professionals or offering a service, SERVFIX keeps projects moving with
              secure messaging, booking management, and clear pricing.
            </p>
            <div className="grid gap-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
                <span className="font-semibold text-foreground">For buyers</span>
                <span>Search verified providers, compare packages, and request services instantly.</span>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
                <span className="font-semibold text-foreground">For providers</span>
                <span>List services, receive bookings, and manage customer chats from your dashboard.</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SignUp;
