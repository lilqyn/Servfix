import Header from "@/components/Header";
import Footer from "@/components/Footer";

const ProviderAddendum = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">Provider Addendum</h1>
          <p className="text-sm text-muted-foreground">PROVIDER ADDENDUM</p>
          <p className="text-sm text-muted-foreground">SERVFIX / SERVFIX-GH</p>
          <p className="text-sm text-muted-foreground">Last updated: February 8, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <p>
            This Provider Addendum supplements the Terms of Service and applies to all Service
            Providers on SERVFIX.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              1. Independent Contractor Status
            </h2>
            <p>
              You acknowledge and agree that you are an independent contractor and not an
              employee, agent, or partner of SERVFIX or THE ADDO&apos;S PRIVATE LIMITED
              LIABILITY COMPANY (PLLC).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Provider Responsibilities</h2>
            <p>
              You are solely responsible for the services you offer, including service quality,
              lawful operation, and compliance with applicable regulations and taxes on earnings.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Payouts</h2>
            <p>
              Payouts are subject to order completion, buyer confirmation, and dispute outcomes.
              The Platform may delay release of funds where a dispute is opened or risk is
              detected.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">4. Suspension</h2>
            <p>
              SERVFIX may suspend or remove provider listings or accounts for fraud, repeated poor
              performance, policy violations, or risk to users and the Platform.
            </p>
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

export default ProviderAddendum;
