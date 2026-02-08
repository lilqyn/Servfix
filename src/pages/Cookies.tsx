import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">Cookie Policy</h1>
          <p className="text-sm text-muted-foreground">COOKIE POLICY</p>
          <p className="text-sm text-muted-foreground">SERVFIX / SERVFIX-GH</p>
          <p className="text-sm text-muted-foreground">Last updated: February 8, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. Cookies We Use</h2>
            <p>
              Essential cookies are required for authentication, session management, and security.
              Disabling these may limit platform functionality.
            </p>
            <p>
              Analytics cookies are used by Google Analytics to understand usage and improve
              performance. These cookies collect aggregated, non-identifying information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Managing Cookies</h2>
            <p>
              You can manage cookies via your browser settings. Disabling essential cookies may
              affect functionality.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Changes</h2>
            <p>We may update this Cookie Policy from time to time.</p>
          </section>

          <section className="space-y-2">
            <p>Contact: support@servfixgh.com &bull; https://www.servfixgh.com</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Cookies;
