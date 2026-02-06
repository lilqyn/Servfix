import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="max-w-3xl space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated February 6, 2026</p>
          <p className="text-base text-muted-foreground">
            By using SERVFIX, you agree to these Terms of Service. Please read them
            carefully before using the platform.
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Accounts</h2>
              <p className="text-sm text-muted-foreground">
                You are responsible for maintaining the confidentiality of your account and
                for all activity that occurs under your account.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Service listings</h2>
              <p className="text-sm text-muted-foreground">
                Providers must ensure service details are accurate and comply with
                applicable laws. We reserve the right to remove listings that violate
                these terms.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Payments</h2>
              <p className="text-sm text-muted-foreground">
                Payments are processed through approved providers. Disputes may be
                handled according to our dispute policy and platform rules.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Prohibited activity</h2>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Fraud, misrepresentation, or abuse of the platform.</li>
                <li>Violations of local laws or regulations.</li>
                <li>Interference with platform security or other users.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Contact us</h2>
              <p className="text-sm text-muted-foreground">
                Questions about these terms? Email{" "}
                <a href="mailto:hello@servfix.com" className="text-primary underline">
                  hello@servfix.com
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
