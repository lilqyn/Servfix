import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">TERMS OF SERVICE</p>
          <p className="text-sm text-muted-foreground">SERVFIX / SERVFIX-GH</p>
          <p className="text-sm text-muted-foreground">Last updated: February 8, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. Platform Operator</h2>
            <p>
              The platform SERVFIX (also referred to as SERVFIX-GH) is operated by THE ADDO&apos;S
              PRIVATE LIMITED LIABILITY COMPANY (PLLC), a company incorporated in Ghana
              (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
            </p>
            <p>Website: https://www.servfixgh.com</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Nature of the Platform</h2>
            <p>
              SERVFIX is an online service marketplace that enables users (&ldquo;Buyers&rdquo; and
              &ldquo;Service Providers&rdquo;) to list and discover services, communicate with one
              another, and make and receive payments through third-party payment providers.
            </p>
            <p>
              SERVFIX is not a service provider. We do not perform, supervise, or guarantee any
              services listed on the Platform.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. User Accounts &amp; Eligibility</h2>
            <p>
              You must create an account to use core features. You agree to provide accurate
              information, keep your credentials secure, and use the Platform lawfully. We may
              suspend or terminate accounts for violations of these Terms or applicable law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Payments, Fees &amp; Escrow</h2>
            <p>
              4.1 Payments All payments are processed through licensed third-party payment
              service providers. SERVFIX does not operate as a bank or financial institution.
            </p>
            <p>
              4.2 Escrow-style Holding Payments may be temporarily held after a Buyer places an
              order. Funds are released to the Service Provider after service completion and Buyer
              confirmation, or following dispute resolution.
            </p>
            <p>
              4.3 Platform Fees SERVFIX may charge transaction commissions, subscription fees,
              and promotional or visibility fees. Fees and applicable taxes will be disclosed before
              payment.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              5. Disputes, Cancellations &amp; Refunds
            </h2>
            <p>
              Buyers and Providers should first attempt to resolve disputes directly. Where
              unresolved, SERVFIX may review communications and evidence. SERVFIX may delay
              fund release and may issue refunds, partial refunds, or release funds to the Provider.
              All decisions are final within the Platform&apos;s dispute system. SERVFIX is not
              responsible for service quality, delays, or outcomes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">6. Provider Obligations</h2>
            <p>
              Service Providers act as independent contractors and are solely responsible for their
              services and compliance, including taxes on earnings. SERVFIX does not employ or
              endorse Providers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. Prohibited Conduct</h2>
            <p>
              Users must not provide false information, upload illegal or infringing content, misuse
              payments or escrow mechanisms, or attempt to bypass platform safeguards.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law: SERVFIX is not liable for indirect or
              consequential damages; does not guarantee uninterrupted access or outcomes; and
              liability is limited to fees paid to SERVFIX in the preceding three (3) months.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">9. Termination</h2>
            <p>
              We may suspend or terminate access at any time for violations or risk to the Platform.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">10. Governing Law</h2>
            <p>These Terms are governed by the laws of the Republic of Ghana.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">11. Contact</h2>
            <p>For questions, contact: support@servfixgh.com</p>
            <p>Contact: support@servfixgh.com &bull; https://www.servfixgh.com</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
