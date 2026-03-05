import Header from "@/components/Header";
import Footer from "@/components/Footer";

const ProviderAddendum = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">
            Servfix Provider Addendum
          </h1>
          <p className="text-sm text-muted-foreground">Effective Date: February 24, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <p>
            This Provider Addendum supplements the Servfix Terms and Conditions and applies to all
            service providers ("Providers") using the Servfix Platform.
          </p>
          <p>
            By offering or delivering services on Servfix, you agree to this Addendum and all
            related platform policies.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. Independent Contractor Status</h2>
            <p>
              You acknowledge that you act as an independent contractor and not as an employee,
              partner, or agent of Servfix or OPTEDO COMPANY LIMITED.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Eligibility and Verification</h2>
            <p>To provide services, you may be required to submit:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Valid government-issued identification.</li>
              <li>Accurate legal name and contact details.</li>
              <li>Business registration records where operating as a registered entity.</li>
              <li>Any additional documents required for compliance, risk, or fraud checks.</li>
            </ul>
            <p>
              You must keep all submitted information current and accurate at all times.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Provider Responsibilities</h2>
            <p>
              You are solely responsible for the services you list and deliver, including quality,
              timeliness, lawful conduct, safety, and compliance with applicable professional and
              regulatory requirements.
            </p>
            <p>You agree to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide truthful service descriptions and pricing.</li>
              <li>Communicate professionally with buyers.</li>
              <li>Perform booked services in a competent and safe manner.</li>
              <li>Respect customer property, privacy, and safety.</li>
              <li>Comply with all applicable laws and licensing obligations.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">4. Bookings and Fulfillment</h2>
            <p>
              You may accept or decline service requests at your discretion unless otherwise agreed
              through a program-specific arrangement. Once accepted, you are expected to fulfill
              the booking as agreed.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">5. Payments, Fees, and Payouts</h2>
            <p>
              Buyer payments are processed by licensed third-party PSPs. Servfix does not hold
              funds as a payment institution.
            </p>
            <p>
              Provider payouts are subject to service completion, buyer confirmation (or expiry of
              confirmation window), and any active dispute or risk controls.
            </p>
            <p>
              Servfix may deduct platform commissions, applicable charges, reserves, reversals, or
              chargeback-related adjustments in accordance with platform rules.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              6. Cancellations, Disputes, and Evidence
            </h2>
            <p>
              Providers must cooperate in good faith during dispute reviews, including timely
              responses and submission of relevant evidence when requested.
            </p>
            <p>
              Where a dispute is active, Servfix may temporarily withhold payout until a decision
              is made.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. Compliance and Safety</h2>
            <p>
              You are responsible for using appropriate tools, materials, and methods, and for
              maintaining any required insurance, permits, or licenses for your service category.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">8. Prohibited Conduct</h2>
            <p>Providers must not:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Engage in fraud, deception, abuse, harassment, or unsafe practices.</li>
              <li>Manipulate ratings, reviews, disputes, or platform metrics.</li>
              <li>Circumvent the Platform to avoid payment or fees for Platform-originated jobs.</li>
              <li>Use another person&apos;s identity or account.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">9. Tax and Recordkeeping</h2>
            <p>
              You are solely responsible for your tax filings, statutory remittances, and
              maintenance of records related to your earnings and operations.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">10. Suspension and Termination</h2>
            <p>
              Servfix may suspend, restrict, or terminate provider access for policy breaches,
              repeated low performance, fraud indicators, safety concerns, or legal/regulatory
              requirements.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">11. Indemnity</h2>
            <p>
              You agree to indemnify and hold harmless OPTEDO COMPANY LIMITED (Servfix), its
              directors, employees, and affiliates from claims, losses, liabilities, damages, or
              expenses arising from your services, conduct, legal non-compliance, or breach of
              platform terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">12. Changes</h2>
            <p>
              Servfix may update this Addendum from time to time. Continued use of the Platform as
              a Provider constitutes acceptance of the revised version.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">13. Contact Information</h2>
            <p>Servfix (Operated by OPTEDO COMPANY LIMITED)</p>
            <p>Email: support@servfixgh.com</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Version Note</h2>
            <p>This Addendum was last reviewed on February 24, 2026.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProviderAddendum;
