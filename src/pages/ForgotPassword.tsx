import { useState } from "react";
import { Link } from "react-router-dom";
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

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

const ForgotPassword = () => {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: {
      email: "",
    },
    mode: "onSubmit",
  });

  const onSubmit = async (values: ForgotFormValues) => {
    setSubmitError(null);
    try {
      await apiFetch("/api/auth/password-reset", {
        method: "POST",
        body: JSON.stringify({ email: values.email.trim() }),
      });
      setSent(true);
      toast.success("If an account exists, we sent a reset link.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send reset email.";
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
            <p className="text-sm font-semibold text-primary">Account Access</p>
            <h1 className="text-3xl font-display font-bold text-foreground sm:text-4xl">
              Reset your password.
            </h1>
            <p className="text-muted-foreground">
              Enter your account email and we will send a secure reset link.
            </p>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              Remembered your password?{" "}
              <Link to="/sign-in" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>
              .
            </div>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Forgot Password</CardTitle>
              <CardDescription>We will email you a reset link.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              {sent && !submitError && (
                <Alert>
                  <AlertDescription>
                    If an account exists for that email, a reset link is on the way.
                  </AlertDescription>
                </Alert>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email address</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" variant="gold" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Sending..." : "Send reset link"}
                  </Button>
                </form>
              </Form>

              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
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

export default ForgotPassword;
