import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">
            Servfix Terms and Conditions
          </h1>
          <p className="text-sm text-muted-foreground">Effective Date: February 24, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <section className="space-y-2">
            <p>
              Welcome to Servfix, a service marketplace operated by OPTEDO COMPANY LIMITED, a
              company incorporated under the laws of Ghana.
            </p>
            <p>
              These Terms and Conditions ("Terms") govern your access to and use of the Servfix
              mobile application, website, and related services (collectively, the "Platform").
            </p>
            <p>
              By accessing or using Servfix, you agree to be legally bound by these Terms. If you
              do not agree, please do not use our Platform.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
            <p>
              Servfix provides a digital marketplace that connects customers ("Users") with
              independent service providers ("Providers") for home, repair, maintenance, and
              related services.
            </p>
            <p>Servfix acts solely as a technology intermediary and does not directly provide services.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">2. Eligibility</h2>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">2.1 Age Requirement</h3>
              <p>You must be at least 18 years old to use Servfix.</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">2.2 Account Registration</h3>
              <p>
                To access certain features, you must register an account and provide accurate,
                complete, and current information.
              </p>
              <p>You are responsible for maintaining the confidentiality of your login credentials.</p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Nature of the Platform</h2>
            <p>Servfix is a marketplace facilitator.</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>We do not employ service providers.</li>
              <li>We do not supervise or control the execution of services.</li>
              <li>Providers operate as independent contractors.</li>
              <li>There is no employer-employee relationship between Servfix and Providers.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">4. Bookings and Payments</h2>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">4.1 Booking Services</h3>
              <p>
                Users may request services through the Platform. Providers may accept or decline
                service requests at their discretion.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">4.2 Payment Processing</h3>
              <p>All payments are processed through licensed third-party Payment Service Providers (PSPs).</p>
              <p>Servfix:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Does not hold customer funds.</li>
                <li>Does not operate as a Payment Service Provider.</li>
                <li>Does not issue electronic money.</li>
              </ul>
              <p>Payments are held by the PSP until service confirmation.</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">4.3 Payout Model</h3>
              <p>Funds are released to Providers only after:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Service completion, and</li>
                <li>Customer confirmation (or expiry of confirmation window).</li>
              </ul>
              <p>
                Servfix may apply a temporary reserve for new Providers to manage chargeback risk.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">4.4 Platform Commission</h3>
              <p>
                Servfix charges a commission on completed transactions. This commission is
                automatically deducted before Provider payout.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">5. Cancellations and Refunds</h2>
            <p>
              Users may raise disputes within the defined dispute window (for example, 24 to 72
              hours after service completion).
            </p>
            <p>Refunds may be issued if:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provider failed to show up.</li>
              <li>Service was materially incomplete.</li>
              <li>Provider violated Servfix&apos;s code of conduct.</li>
            </ul>
            <p>Refunds are processed through the payment provider.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">6. User Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Violate any laws or regulations.</li>
              <li>Engage in fraud or misrepresentation.</li>
              <li>Harass or threaten Providers or Users.</li>
              <li>Circumvent the Platform to avoid payment.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. Provider Obligations</h2>
            <p>Providers agree to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Complete services professionally.</li>
              <li>Maintain required licenses (if applicable).</li>
              <li>Provide accurate profile information.</li>
              <li>Avoid fraudulent or unsafe conduct.</li>
            </ul>
            <p>Providers are fully responsible for their services and outcomes.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">8. KYC and Identity Verification</h2>
            <p>To promote trust and safety:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Providers must submit valid government-issued identification.</li>
              <li>
                Names on profiles must match submitted identification (unless registered as a
                business).
              </li>
              <li>
                Servfix reserves the right to suspend accounts with inconsistent identity details.
              </li>
              <li>Registered businesses must upload business registration documents.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">9. Indemnity</h2>
            <p>
              By using Servfix, Users and Providers agree to indemnify and hold harmless OPTEDO
              COMPANY LIMITED (Servfix), its directors, employees, and affiliates from any claims,
              losses, damages, liabilities, legal fees, or expenses arising from:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Service-related disputes.</li>
              <li>Negligence or misconduct.</li>
              <li>Injury or property damage.</li>
              <li>Fraudulent actions.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">10. Limitation of Liability</h2>
            <p>Servfix shall not be liable for:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Poor-quality services.</li>
              <li>Personal injury.</li>
              <li>Property damage.</li>
              <li>Theft or misconduct by Providers or Users.</li>
              <li>Force majeure events.</li>
            </ul>
            <p>
              Servfix&apos;s total liability shall not exceed the platform fee paid in connection with
              the transaction.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">11. Safety Disclaimer</h2>
            <p>
              Users acknowledge risks associated with allowing Providers onto their premises.
            </p>
            <p>
              Providers acknowledge risks associated with performing services at User locations.
            </p>
            <p>In emergencies, contact local authorities.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">12. Dispute Resolution</h2>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">12.1 Complaint Filing</h3>
              <p>
                Complaints must be submitted within the stated dispute window via the app or
                support email.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">12.2 Mediation</h3>
              <p>Servfix may mediate disputes but does not guarantee resolution.</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">12.3 Account Enforcement</h3>
              <p>Repeated verified misconduct may result in:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Account suspension.</li>
                <li>Permanent banning.</li>
                <li>Reporting to law enforcement.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">13. Intellectual Property</h2>
            <p>
              All Servfix branding, software, and content are the property of OPTEDO COMPANY
              LIMITED.
            </p>
            <p>
              You are granted a limited, non-exclusive license to use the Platform for personal,
              non-commercial purposes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">14. Privacy</h2>
            <p>
              Our handling of personal data is governed by the Servfix Privacy Policy and applicable
              Ghana data protection laws.
            </p>
            <p>By using Servfix, you consent to our data practices.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">15. Promotions and Rewards</h2>
            <p>Servfix may offer:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Referral bonuses.</li>
              <li>Discount campaigns.</li>
              <li>Wallet credits.</li>
              <li>Loyalty incentives.</li>
            </ul>
            <p>Promotions:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Are subject to change without notice.</li>
              <li>May be funded by Servfix and/or Providers.</li>
              <li>May be revoked in cases of abuse.</li>
            </ul>
            <p>
              Referral and wallet bonuses are non-withdrawable unless explicitly stated.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">16. Termination</h2>
            <p>
              Servfix may suspend or terminate accounts for violation of these Terms, fraudulent
              activity, abusive behavior, or to comply with legal requirements.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">17. Governing Law</h2>
            <p>These Terms are governed by the laws of the Republic of Ghana.</p>
            <p>Any disputes shall first be resolved through mediation before legal proceedings.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">18. Modifications</h2>
            <p>
              Servfix may update these Terms at any time. Continued use of the Platform constitutes
              acceptance of the revised Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">19. Contact Information</h2>
            <p>Servfix (Operated by OPTEDO COMPANY LIMITED)</p>
            <p>Email: support@servfixgh.com</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Version Note</h2>
            <p>These Terms were last reviewed on February 24, 2026.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
