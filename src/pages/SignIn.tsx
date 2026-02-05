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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { AuthResponse, getIdentifierPayload, identifierSchema, mapAuthErrorMessage } from "@/lib/auth";
import { useAuth } from "@/contexts/AuthContext";

const signInSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignInFormValues = z.infer<typeof signInSchema>;

const SignIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { signIn, user, isAuthenticated, isHydrated } = useAuth();

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
    mode: "onSubmit",
  });

  const onSubmit = async (values: SignInFormValues) => {
    setSubmitError(null);

    try {
      const payload = {
        ...getIdentifierPayload(values.identifier),
        password: values.password,
      };

      const response = await apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      signIn(response);
      toast.success("Welcome back!");

      const next = new URLSearchParams(location.search).get("next");
      if (next && next.startsWith("/")) {
        navigate(next);
        return;
      }

      navigate(response.user.role === "provider" ? "/dashboard" : "/browse");
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      setSubmitError(message);
      toast.error(message);
    }
  };

  const isSubmitting = form.formState.isSubmitting;

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

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email or phone</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com or 0240000000" autoComplete="username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter your password" autoComplete="current-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" variant="gold" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </Form>

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
