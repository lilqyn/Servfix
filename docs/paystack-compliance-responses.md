# SERVFIX — Paystack Marketplace Compliance Responses

**Business:** SERVFIX
**Website:** https://www.servfixgh.com
**Date:** 9 April 2026

---

## 1. Kindly describe your full funds flow. Do you hold funds at all or do you use split payment method to deduct your charges and settle the merchants immediately?

SERVFIX uses a pay-and-release model. We do not use split payments.

Paystack collects funds from the buyer and settles them to SERVFIX's Paystack settlement account. SERVFIX then manages the release of provider earnings based on service completion. We do not hold funds as a financial institution — we operate as a marketplace that controls when providers become eligible for payouts based on order fulfilment.

The full funds flow is:

1. Buyer places an order and pays via Paystack (Mobile Money, card, or bank transfer).
2. Paystack processes the payment and settles funds to SERVFIX's settlement account.
3. SERVFIX records the order as "Payment Secured" in our internal ledger.
4. The service provider completes the work and submits delivery.
5. The buyer has a time-limited review window to approve (24 hours for orders under GHS 500, 48 hours for GHS 500–2,000, 72 hours for orders over GHS 2,000).
6. Once the buyer approves — or the review window expires with no dispute — SERVFIX deducts a 10% platform commission and credits the net amount to the provider's wallet balance.
7. The provider requests a payout from their wallet to their Mobile Money account (MTN, Vodafone, or AirtelTigo). Payouts are processed via Paystack Transfers.
8. If a dispute is opened before approval, the provider's payout eligibility is paused until our support team resolves it.

All funds are transaction-tied. We do not accept deposits, store balances indefinitely, or operate as a wallet or financial service. Provider payouts are strictly linked to completed and approved orders.

---

## 2. How does your platform work and how do you onboard vendors?

SERVFIX is a digital marketplace connecting buyers with service providers across Ghana.

**How the platform works:**

- Buyers browse verified service providers by category (plumbing, electrical, beauty, tailoring, cleaning, catering, etc.), compare ratings, pricing, and work photos, then book and pay securely through the app.
- Providers receive orders, complete the work, and submit delivery. Payment is released after the buyer confirms satisfaction.

**Vendor (provider) onboarding process:**

1. The provider downloads the SERVFIX app from Google Play or visits www.servfixgh.com.
2. They register and select the "Provider" role.
3. They complete their profile: full name, profile photo, service description, work samples (photos), pricing, and service categories.
4. They submit KYC documents for identity verification (see question 3).
5. Our team reviews the submission. Verification status moves from "Unverified" to "Pending" to "Verified" or "Rejected."
6. Once verified, the provider's services appear in search results and they can receive orders.
7. Providers must be fully verified before they can request any payouts.

No provider can receive funds without completing verification.

---

## 3. What KYC information do you collect from the third-party sellers on your platform?

We collect the following KYC information from every service provider:

**Identity verification:**

- Full legal name
- Valid government-issued ID (Ghana Card, Passport, or Voter's ID)
- Selfie photo for identity matching

**Contact and profile:**

- Email address
- Phone number
- Physical location / city of operation
- Profile photo

**Payment information:**

- Mobile Money number and network (MTN, Vodafone, or AirtelTigo) for payout

Providers cannot receive any payouts until their identity is verified. Verification status is tracked as: Unverified → Pending → Verified or Rejected.

---

## 4. Kindly confirm what type of Enhanced Due Diligence you carry out on the vendors signing up on your platform.

SERVFIX carries out the following Enhanced Due Diligence on all providers:

**1. Identity Verification:**
Government-issued ID (Ghana Card, Passport, or Voter's ID) matched against a selfie photo.

**2. Sanctions Screening:**
Every provider is screened against sanctions lists before payouts are processed. Re-screening occurs every 30 days.

**3. AML Risk Scoring:**
Each payout request is scored against multiple risk factors:

- Large payout amounts (≥ GHS 5,000): +40 risk points
- Free-plan providers: +20 risk points
- High request frequency (3+ requests in 24 hours): +30 risk points
- High daily cap utilization (≥ 85%): flagged for review

**4. Risk Thresholds:**

- Score ≥ 60: Triggers manual compliance review
- Score ≥ 90: Automatic block — payout is held pending investigation

**5. Compliance Case Management:**
Flagged cases are tracked with severity levels (low, medium, high, critical) and statuses (open, investigating, escalated, reported, cleared, closed).

**6. Disbursement Controls:**

- Unverified providers: Cannot request any payouts
- Verified providers: Daily cap of GHS 5,000
- Maximum single disbursement: GHS 10,000
- Compliance deduplication window: 24 hours

All compliance decisions are logged with timestamps, admin notes, and audit trails.

---

## 5. Do you have an Acceptable Use policy document? Kindly share this if you do.

Yes. Our Terms of Service document covers acceptable use of the SERVFIX platform for both buyers and providers. It outlines prohibited activities, account responsibilities, and grounds for suspension or termination.

The document is publicly available at:
https://www.servfixgh.com/policies/servfix-terms-of-service.pdf

Additionally, providers agree to the Provider Addendum which outlines service standards, payment terms, and compliance requirements:
https://www.servfixgh.com/policies/servfix-provider-addendum.pdf

---

## 6. Is your business a fulfilment centre? Or are products directly shipped from third-party vendors to the customers who place orders?

SERVFIX is not a fulfilment centre and does not sell or ship physical products.

SERVFIX is a service marketplace. Independent service providers deliver their services directly to buyers. For example:

- A plumber visits the buyer's home to fix a pipe
- A hairstylist provides styling at their salon or at the buyer's location
- An electrician performs wiring work at the buyer's property

SERVFIX acts as an intermediary that facilitates discovery, booking, secure payment, and communication between the buyer and the service provider. We do not employ the providers, manage their schedules, or deliver any services ourselves. All services are rendered directly by the independent provider to the buyer.

---

## 7. Do you have a refund policy? If yes, please share it.

Yes, SERVFIX has a clear refund policy:

**Pre-service cancellation:**

- If the buyer cancels before the provider starts work (order status is "Created" or "Payment Secured"), a full refund is issued to the buyer's original payment method automatically.

**Post-delivery disputes:**

- If the buyer is unsatisfied after delivery is submitted, they can open a dispute within the review window (24–72 hours depending on order amount).
- Our support team reviews evidence from both sides.
- Possible outcomes: full refund to buyer, partial refund, or release of funds to the provider.

**Refund processing:**

- Refunds are initiated via Paystack's refund API.
- Refunds are processed back to the buyer's original payment method (Mobile Money or card).
- Refund status, reference IDs, and timestamps are tracked in our system.

**Auto-release:**

- If the buyer does not approve or dispute within the review window, funds are automatically released to the provider.

The full refund policy is part of our Terms of Service:
https://www.servfixgh.com/policies/servfix-terms-of-service.pdf

---

## Supporting Documents

- **Terms of Service:** https://www.servfixgh.com/policies/servfix-terms-of-service.pdf
- **Privacy Policy:** https://www.servfixgh.com/policies/servfix-privacy-policy.pdf
- **Provider Addendum:** https://www.servfixgh.com/policies/servfix-provider-addendum.pdf
- **Cookie Policy:** https://www.servfixgh.com/policies/servfix-cookie-policy.pdf

---

*Prepared by the SERVFIX Team — support@servfixgh.com*
