import Header from "@/components/Header";
import Footer from "@/components/Footer";

const RefundPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">
            Servfix Refund Policy
          </h1>
          <p className="text-sm text-muted-foreground">Effective Date: 9 April 2026</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground">
          <section className="space-y-2">
            <p>
              This Refund Policy explains when and how refunds are issued on the Servfix Platform.
              By using Servfix, you agree to the terms outlined below.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              1. Pre-Service Cancellation by Buyer
            </h2>
            <p>
              If a Buyer cancels an order before the Service Provider begins work, a full refund
              is issued automatically to the Buyer&apos;s original payment method.
            </p>
            <p>This applies when the order status is:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>&quot;Created&quot; — order placed but not yet paid.</li>
              <li>&quot;Payment Secured&quot; — payment received but Provider has not accepted or started work.</li>
            </ul>
            <p>No platform fee is charged on cancelled orders.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              2. Provider Cancellation or No-Show
            </h2>
            <p>
              If a Service Provider fails to accept an order within a reasonable timeframe, cancels
              after accepting, or fails to show up for a scheduled service, the Buyer is entitled to
              a full refund.
            </p>
            <p>
              The Buyer may cancel the order and the refund will be processed automatically.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              3. Post-Delivery Disputes
            </h2>
            <p>
              If the Buyer is unsatisfied with the completed service, they may open a dispute
              within the review window:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Orders under GHS 500: 24-hour review window.</li>
              <li>Orders between GHS 500 and GHS 2,000: 48-hour review window.</li>
              <li>Orders over GHS 2,000: 72-hour review window.</li>
            </ul>
            <p>
              To open a dispute, the Buyer must go to the order, select &quot;Report Issue,&quot;
              describe the problem, and upload any supporting evidence (photos, screenshots, or
              messages).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              4. Dispute Resolution and Outcomes
            </h2>
            <p>
              When a dispute is opened, the Provider&apos;s payout eligibility is paused while our
              support team investigates. Both sides are given an opportunity to present evidence.
            </p>
            <p>Possible outcomes include:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Full refund to Buyer</strong> — the entire payment is returned to the
                Buyer&apos;s original payment method.
              </li>
              <li>
                <strong>Partial refund</strong> — a portion of the payment is refunded to the Buyer
                and the remainder is released to the Provider.
              </li>
              <li>
                <strong>Full release to Provider</strong> — if the dispute is not upheld, the full
                payment (minus platform commission) is released to the Provider.
              </li>
            </ul>
            <p>
              All dispute decisions are final within the Platform&apos;s dispute system. Most
              disputes are resolved within 3 to 5 business days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              5. Auto-Release of Funds
            </h2>
            <p>
              If the Buyer does not approve delivery or open a dispute within the review window,
              funds are automatically released to the Service Provider. Once auto-released, the
              transaction is considered complete and refunds are no longer available through the
              Platform.
            </p>
            <p>
              Buyers are encouraged to review deliveries promptly within the review window.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              6. How Refunds Are Processed
            </h2>
            <p>
              All refunds are processed through the original payment method used at checkout:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Mobile Money</strong> (MTN, Vodafone, AirtelTigo) — refund is credited back
                to the same mobile money account.
              </li>
              <li>
                <strong>Debit/Credit Card</strong> — refund is credited back to the same card.
              </li>
              <li>
                <strong>Bank Transfer</strong> — refund is credited back to the originating bank
                account.
              </li>
            </ul>
            <p>
              Refund processing times depend on the payment provider but are typically completed
              within 1 to 5 business days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              7. Non-Refundable Situations
            </h2>
            <p>Refunds are generally not available in the following situations:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>The Buyer approved the completed work and released payment.</li>
              <li>
                The review window expired without a dispute being opened (auto-release applied).
              </li>
              <li>
                The Buyer&apos;s complaint does not relate to the service agreed upon in the
                original booking.
              </li>
              <li>The dispute was reviewed and not upheld by the Servfix support team.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              8. Platform Commission on Refunds
            </h2>
            <p>
              When a full refund is issued, the entire amount paid by the Buyer is returned. No
              platform commission is charged on refunded orders. For partial refunds, the platform
              commission applies only to the portion released to the Provider.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              9. Contact and Support
            </h2>
            <p>
              If you have questions about a refund or need assistance with a dispute, please
              contact our support team:
            </p>
            <p>Email: support@servfixgh.com</p>
            <p>
              You can also open a support ticket directly in the Servfix app under the Support
              section.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Version Note</h2>
            <p>This Refund Policy was last reviewed on 9 April 2026.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default RefundPolicy;
