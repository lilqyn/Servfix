import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="max-w-3xl space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">Cookie Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated February 6, 2026</p>
          <p className="text-base text-muted-foreground">
            This Cookie Policy explains how SERVFIX uses cookies and similar technologies
            to keep the platform secure, remember your preferences, and improve your
            experience.
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">What are cookies?</h2>
              <p className="text-sm text-muted-foreground">
                Cookies are small text files stored on your device by your browser. Similar
                technologies include local storage and pixels. These help a site remember
                information about your visit.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground">How we use cookies</h2>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Keep the platform secure and prevent fraud.</li>
                <li>Remember your preferences and settings.</li>
                <li>Understand how the site is used so we can improve it.</li>
                <li>Support essential features like log-in and account access.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Types of cookies we use</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Essential:</span>{" "}
                  Required for security, authentication, and core site functions.
                </p>
                <p>
                  <span className="font-medium text-foreground">Preferences:</span>{" "}
                  Remember choices like region, interface settings, and saved filters.
                </p>
                <p>
                  <span className="font-medium text-foreground">Analytics:</span>{" "}
                  Help us understand usage and improve performance. These may be enabled
                  through trusted third-party services.
                </p>
                <p>
                  <span className="font-medium text-foreground">Marketing:</span>{" "}
                  Used to measure campaigns or show relevant updates when enabled.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Your choices</h2>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                <li>Adjust your browser settings to block or delete cookies.</li>
                <li>Disabling some cookies may limit certain features.</li>
                <li>You can clear stored data in your browser at any time.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Contact us</h2>
              <p className="text-sm text-muted-foreground">
                If you have questions about this policy, contact us at{" "}
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

export default Cookies;
