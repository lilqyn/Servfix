import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="max-w-3xl space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated February 6, 2026</p>
          <p className="text-base text-muted-foreground">
            This Privacy Policy explains how SERVFIX collects, uses, and protects your
            information when you use our website and services.
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Information we collect</h2>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Account details like name, email, phone number, and profile data.</li>
                <li>Service activity such as bookings, messages, and reviews.</li>
                <li>Device and usage data, including browser type and IP address.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">How we use information</h2>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Provide, maintain, and improve our services.</li>
                <li>Verify identities and keep the platform secure.</li>
                <li>Communicate updates, support responses, and platform notices.</li>
                <li>Comply with legal requirements.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Sharing and disclosure</h2>
              <p className="text-sm text-muted-foreground">
                We only share data with trusted providers who support our services
                (payments, messaging, analytics) or when required by law. We do not sell
                your personal information.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Your choices</h2>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Access and update your account details in settings.</li>
                <li>Request data deletion or account closure by contacting support.</li>
                <li>Manage cookies and marketing preferences in your browser.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Contact us</h2>
              <p className="text-sm text-muted-foreground">
                Questions about privacy? Email{" "}
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

export default Privacy;
