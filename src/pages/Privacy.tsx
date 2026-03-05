import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">
            Servfix Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">Effective Date: February 24, 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <section className="space-y-2">
            <p>
              This Privacy Policy explains how OPTEDO COMPANY LIMITED ("Servfix", "we", "us",
              "our") collects, uses, stores, and shares personal data when you use the Servfix
              mobile application, website, and related services (the "Platform").
            </p>
            <p>
              By using Servfix, you acknowledge the practices described in this Privacy Policy.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. Data Controller</h2>
            <p>OPTEDO COMPANY LIMITED is the data controller for personal data processed on Servfix.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Personal Data We Collect</h2>
            <p>We may collect and process the following categories of data:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account data: name, phone number, email address, and login credentials.</li>
              <li>Profile data: profile photo, address/location, and service preferences.</li>
              <li>
                Verification data: government-issued ID and business registration details (where
                required for KYC/compliance).
              </li>
              <li>
                Transaction data: bookings, order history, payout records, platform fees, and
                payment status metadata.
              </li>
              <li>
                Communication data: in-app messages, dispute submissions, and support requests.
              </li>
              <li>
                Technical/usage data: device/browser information, IP address, log events, and app
                analytics.
              </li>
              <li>
                Evidence data: photos or files you upload for disputes, verification, or support.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. How We Use Personal Data</h2>
            <p>We use personal data to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Create and manage user accounts.</li>
              <li>Enable bookings, order fulfillment, and payouts.</li>
              <li>Verify identity and prevent fraud or abuse.</li>
              <li>Process and resolve disputes and complaints.</li>
              <li>Provide customer support and communicate service updates.</li>
              <li>Maintain platform security, reliability, and performance.</li>
              <li>Comply with legal, tax, and regulatory obligations.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">4. Legal Basis for Processing</h2>
            <p>
              Depending on the purpose, we process personal data based on one or more of the
              following: performance of a contract, legal obligation, your consent, and our
              legitimate interests in operating a safe and effective marketplace.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">5. Payments and Financial Data</h2>
            <p>
              Payments on Servfix are processed by licensed third-party Payment Service Providers
              (PSPs). Servfix does not store full card details and does not operate as a payment
              institution or electronic money issuer.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">6. Data Sharing</h2>
            <p>We may share data only when necessary with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Payment processors and financial service partners.</li>
              <li>Cloud hosting, storage, analytics, and security providers.</li>
              <li>Professional advisers, auditors, or insurers.</li>
              <li>Regulators, law enforcement, or courts where legally required.</li>
            </ul>
            <p>We do not sell personal data.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. International Transfers</h2>
            <p>
              Where data is transferred across borders, we apply appropriate safeguards to protect
              personal data consistent with applicable law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">8. Data Retention</h2>
            <p>
              We retain personal data only for as long as necessary for account administration,
              transaction records, dispute handling, legal compliance, and fraud prevention. We may
              retain limited records where required by law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">9. Security</h2>
            <p>
              We use reasonable technical and organizational safeguards, including access controls,
              monitoring, and secure infrastructure practices, to protect personal data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">10. Your Rights</h2>
            <p>Subject to applicable law, you may request:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access to your personal data.</li>
              <li>Correction of inaccurate or incomplete data.</li>
              <li>Deletion of data where lawful and applicable.</li>
              <li>Restriction of or objection to certain processing.</li>
              <li>Withdrawal of consent where processing is consent-based.</li>
            </ul>
            <p>To submit a request, contact support@servfixgh.com.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">11. Children&apos;s Privacy</h2>
            <p>
              Servfix is intended for users aged 18 and above. We do not knowingly collect personal
              data from minors.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">12. Third-Party Services</h2>
            <p>
              The Platform may integrate with third-party services. Their privacy practices are
              governed by their own policies, and we are not responsible for external policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">13. Changes to this Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Continued use of the Platform
              after updates constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">14. Contact Information</h2>
            <p>Servfix (Operated by OPTEDO COMPANY LIMITED)</p>
            <p>Email: support@servfixgh.com</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Version Note</h2>
            <p>This Privacy Policy was last reviewed on February 24, 2026.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
