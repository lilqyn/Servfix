import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">
            Servfix Cookie Policy
          </h1>
          <p className="text-sm text-muted-foreground">Effective Date: February 24, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <section className="space-y-2">
            <p>
              This Cookie Policy explains how OPTEDO COMPANY LIMITED ("Servfix", "we", "us",
              "our") uses cookies and similar technologies on the Servfix Platform.
            </p>
            <p>
              By continuing to use the Platform, you agree to the use of cookies as described in
              this policy, subject to your browser settings.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. What Are Cookies?</h2>
            <p>
              Cookies are small text files stored on your device when you visit a website or use a
              web-enabled app. They help the Platform recognize your device and remember key
              preferences or session information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Cookies We Use</h2>
            <p>We use the following categories of cookies:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Strictly necessary cookies: required for authentication, security, session
                continuity, and core functionality.
              </li>
              <li>
                Performance and analytics cookies: used to understand usage trends, diagnose
                technical issues, and improve Platform reliability.
              </li>
              <li>
                Preference cookies: used to remember choices such as language or interface
                preferences, where enabled.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Why We Use Cookies</h2>
            <p>We use cookies and similar technologies to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Keep you signed in and protect your account.</li>
              <li>Prevent abuse, fraud, and unauthorized access attempts.</li>
              <li>Measure and improve platform speed, stability, and performance.</li>
              <li>Remember your settings and improve user experience.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">4. Third-Party Cookies</h2>
            <p>
              Some cookies may be set by third-party service providers we use for analytics,
              security, or infrastructure support. These providers process data according to their
              own policies.
            </p>
            <p>
              When payment flows are handled by licensed PSPs, their pages or components may also
              use cookies subject to their own policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">5. Managing Cookies</h2>
            <p>
              You can manage or disable cookies using your browser settings. If you disable
              strictly necessary cookies, parts of the Platform may not function properly.
            </p>
            <p>
              You can also clear existing cookies from your browser at any time through your
              browser controls.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">6. Policy Updates</h2>
            <p>
              We may update this Cookie Policy from time to time. Continued use of the Platform
              after updates constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. Contact Information</h2>
            <p>Servfix (Operated by OPTEDO COMPANY LIMITED)</p>
            <p>Email: support@servfixgh.com</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Version Note</h2>
            <p>This Cookie Policy was last reviewed on February 24, 2026.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Cookies;
