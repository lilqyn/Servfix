import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">PRIVACY POLICY</p>
          <p className="text-sm text-muted-foreground">SERVFIX / SERVFIX-GH</p>
          <p className="text-sm text-muted-foreground">Last updated: February 8, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. Data Controller</h2>
            <p>
              THE ADDO&apos;S PRIVATE LIMITED LIABILITY COMPANY (PLLC), operator of SERVFIX /
              SERVFIX-GH.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Data We Collect</h2>
            <p>
              We collect: name, email, phone number; login credentials (securely hashed); profile
              information; messages exchanged on the Platform; transaction and payment metadata;
              and usage data via Google Analytics.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Purpose of Processing</h2>
            <p>
              We process data to operate the Platform, authenticate users, facilitate payments and
              escrow, resolve disputes, improve security and performance, and comply with legal
              obligations.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">4. Cookies &amp; Analytics</h2>
            <p>
              We use essential cookies for login and security and Google Analytics cookies to
              analyze usage patterns. Analytics data is aggregated and non-identifying.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">5. Data Sharing</h2>
            <p>
              We may share data with payment processors, hosting and infrastructure providers, and
              regulators where legally required. We do not sell personal data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">6. Data Retention</h2>
            <p>
              Data is retained only as long as necessary for platform operation, legal compliance,
              and dispute resolution.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. Data Security</h2>
            <p>
              We implement reasonable technical and organizational safeguards to protect data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">8. User Rights</h2>
            <p>
              Users may request access, correction, deletion, and withdrawal of consent (where
              applicable). Requests: support@servfixgh.com
            </p>
            <p>Contact: support@servfixgh.com &bull; https://www.servfixgh.com</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
