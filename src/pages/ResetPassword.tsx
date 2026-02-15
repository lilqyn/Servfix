import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { mapAuthErrorMessage } from "@/lib/auth";

const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm your new password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  });

  const onSubmit = async (values: ResetFormValues) => {
    setSubmitError(null);
    if (!token) {
      setSubmitError("Reset token is missing.");
      return;
    }

    try {
      await apiFetch("/api/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password: values.password }),
      });
      setIsComplete(true);
      toast.success("Password updated. You can sign in now.");
    } catch (error) {
      const message = mapAuthErrorMessage(error instanceof Error ? error.message : "");
      setSubmitError(message);
      toast.error(message);
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 pt-28 pb-16">
        <div className="mx-auto grid w-full max-w-3xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-primary">Secure Access</p>
            <h1 className="text-3xl font-display font-bold text-foreground sm:text-4xl">
              Choose a new password.
            </h1>
            <p className="text-muted-foreground">
              Enter a new password for your Servfix account.
            </p>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              Need a new link?{" "}
              <Link to="/forgot-password" className="font-semibold text-primary hover:underline">
                Request another reset email
              </Link>
              .
            </div>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>Set a new password to sign in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              {isComplete ? (
                <Alert>
                  <AlertDescription>
                    Your password has been reset.{" "}
                    <Link to="/sign-in" className="font-semibold text-primary hover:underline">
                      Sign in
                    </Link>{" "}
                    with your new password.
                  </AlertDescription>
                </Alert>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter a new password"
                              autoComplete="new-password"
                              {...field}
                            />
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
                            <Input
                              type="password"
                              placeholder="Re-enter your new password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" variant="gold" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Updating..." : "Reset password"}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ResetPassword;
