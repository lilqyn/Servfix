import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/policies");

const sharedStyle = `
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 13px;
    line-height: 1.7;
    margin: 0;
    padding: 60px 65px;
  }
  h1.page-title {
    text-align: center;
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid #ddd;
  }
  .meta { font-size: 13px; margin-bottom: 6px; }
  .meta strong { font-weight: 700; }
  h2 {
    font-size: 14px;
    font-weight: 700;
    margin-top: 22px;
    margin-bottom: 6px;
  }
  p, li { margin: 0 0 8px 0; }
  .sub { font-weight: 700; }
  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    font-size: 11px;
    color: #888;
  }
`;

const policies = [
  {
    filename: "servfix-terms-of-service.pdf",
    html: `
      <h1 class="page-title">Terms of Service</h1>
      <p class="meta"><strong>TERMS OF SERVICE</strong></p>
      <p class="meta">SERVFIX / SERVFIX-GH</p>
      <p class="meta"><strong>Last updated:</strong> 9 April 2026</p>

      <h2>1. Platform Operator</h2>
      <p>The platform SERVFIX (also referred to as SERVFIX-GH) is operated by <strong>THE ADDO'S PRIVATE LIMITED LIABILITY COMPANY (PLLC)</strong>, a company incorporated in Ghana ("Company", "we", "us").</p>
      <p>Website: https://www.servfixgh.com</p>

      <h2>2. Nature of the Platform</h2>
      <p>SERVFIX is an online service marketplace that enables users ("Buyers" and "Service Providers") to list and discover services, communicate with one another, and make and receive payments through third-party payment providers.</p>
      <p>SERVFIX is not a service provider. We do not perform, supervise, or guarantee any services listed on the Platform.</p>

      <h2>3. User Accounts &amp; Eligibility</h2>
      <p>You must create an account to use core features. You agree to provide accurate information, keep your credentials secure, and use the Platform lawfully. We may suspend or terminate accounts for violations of these Terms or applicable law.</p>

      <h2>4. Payments, Fees &amp; Payment Protection</h2>
      <p><span class="sub">4.1 Payments</span> All payments are processed through licensed third-party payment service providers. SERVFIX does not operate as a bank or financial institution.</p>
      <p><span class="sub">4.2 Payment Protection</span> When a Buyer places an order, the payment is processed by our third-party payment provider and recorded as secured in our system. Funds become eligible for release to the Service Provider after service completion and Buyer confirmation, or following dispute resolution. This process ensures that Buyers only pay for completed work and Providers are paid fairly for services rendered.</p>
      <p><span class="sub">4.3 Platform Fees</span> SERVFIX may charge transaction commissions, subscription fees, and promotional or visibility fees. Fees and applicable taxes will be disclosed before payment.</p>

      <h2>5. Disputes, Cancellations &amp; Refunds</h2>
      <p>Buyers and Providers should first attempt to resolve disputes directly. Where unresolved, SERVFIX may review communications and evidence. SERVFIX may delay fund release and may issue refunds, partial refunds, or release funds to the Provider. All decisions are final within the Platform's dispute system. SERVFIX is not responsible for service quality, delays, or outcomes.</p>

      <h2>6. Provider Obligations</h2>
      <p>Service Providers act as independent contractors and are solely responsible for their services and compliance, including taxes on earnings. SERVFIX does not employ or endorse Providers.</p>

      <h2>7. Prohibited Conduct</h2>
      <p>Users must not provide false information, upload illegal or infringing content, misuse payments or platform safeguards, or attempt to circumvent the payment protection process.</p>

      <h2>8. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law: SERVFIX is not liable for indirect or consequential damages; does not guarantee uninterrupted access or outcomes; and liability is limited to fees paid to SERVFIX in the preceding three (3) months.</p>

      <h2>9. Termination</h2>
      <p>We may suspend or terminate access at any time for violations or risk to the Platform.</p>

      <h2>10. Governing Law</h2>
      <p>These Terms are governed by the laws of the Republic of Ghana.</p>

      <h2>11. Contact</h2>
      <p>For questions, contact: support@servfixgh.com</p>

      <div class="footer">Contact: support@servfixgh.com &bull; https://www.servfixgh.com</div>
    `,
  },
  {
    filename: "servfix-privacy-policy.pdf",
    html: `
      <h1 class="page-title">Privacy Policy</h1>
      <p class="meta"><strong>PRIVACY POLICY</strong></p>
      <p class="meta">SERVFIX / SERVFIX-GH</p>
      <p class="meta"><strong>Last updated:</strong> 9 April 2026</p>

      <h2>1. Data Controller</h2>
      <p><strong>THE ADDO'S PRIVATE LIMITED LIABILITY COMPANY (PLLC)</strong>, operator of SERVFIX / SERVFIX-GH.</p>

      <h2>2. Data We Collect</h2>
      <p>We collect: name, email, phone number; login credentials (securely hashed); profile information; messages exchanged on the Platform; transaction and payment metadata; and usage data via Google Analytics.</p>

      <h2>3. Purpose of Processing</h2>
      <p>We process data to operate the Platform, authenticate users, facilitate payments and payment protection, resolve disputes, improve security and performance, and comply with legal obligations.</p>

      <h2>4. Cookies &amp; Analytics</h2>
      <p>We use essential cookies for login and security and Google Analytics cookies to analyze usage patterns. Analytics data is aggregated and non-identifying.</p>

      <h2>5. Data Sharing</h2>
      <p>We may share data with payment processors, hosting and infrastructure providers, and regulators where legally required. We do not sell personal data.</p>

      <h2>6. Data Retention</h2>
      <p>Data is retained only as long as necessary for platform operation, legal compliance, and dispute resolution.</p>

      <h2>7. Data Security</h2>
      <p>We implement reasonable technical and organizational safeguards to protect data.</p>

      <h2>8. User Rights</h2>
      <p>Users may request access, correction, deletion, and withdrawal of consent (where applicable).</p>
      <p>Requests: support@servfixgh.com</p>

      <div class="footer">Contact: support@servfixgh.com &bull; https://www.servfixgh.com</div>
    `,
  },
  {
    filename: "servfix-provider-addendum.pdf",
    html: `
      <h1 class="page-title">Provider Addendum</h1>
      <p class="meta"><strong>PROVIDER ADDENDUM</strong></p>
      <p class="meta">SERVFIX / SERVFIX-GH</p>
      <p class="meta"><strong>Last updated:</strong> 9 April 2026</p>

      <p>This Provider Addendum supplements the Terms of Service and applies to all Service Providers on SERVFIX.</p>

      <h2>1. Independent Contractor Status</h2>
      <p>You acknowledge and agree that you are an independent contractor and not an employee, agent, or partner of SERVFIX or <strong>THE ADDO'S PRIVATE LIMITED LIABILITY COMPANY (PLLC)</strong>.</p>

      <h2>2. Provider Responsibilities</h2>
      <p>You are solely responsible for the services you offer, including service quality, lawful operation, and compliance with applicable regulations and taxes on earnings.</p>

      <h2>3. Payouts</h2>
      <p>Payouts are subject to order completion, buyer confirmation, and dispute outcomes. The Platform may delay release of funds where a dispute is opened or risk is detected.</p>

      <h2>4. Suspension</h2>
      <p>SERVFIX may suspend or remove provider listings or accounts for fraud, repeated poor performance, policy violations, or risk to users and the Platform.</p>

      <div class="footer">Contact: support@servfixgh.com &bull; https://www.servfixgh.com</div>
    `,
  },
  {
    filename: "servfix-cookie-policy.pdf",
    html: `
      <h1 class="page-title">Cookie Policy</h1>
      <p class="meta"><strong>COOKIE POLICY</strong></p>
      <p class="meta">SERVFIX / SERVFIX-GH</p>
      <p class="meta"><strong>Last updated:</strong> 9 April 2026</p>

      <h2>1. Cookies We Use</h2>
      <p><strong>Essential cookies</strong> are required for authentication, session management, and security. Disabling these may limit platform functionality.</p>
      <p><strong>Analytics cookies</strong> are used by Google Analytics to understand usage and improve performance. These cookies collect aggregated, non-identifying information.</p>

      <h2>2. Managing Cookies</h2>
      <p>You can manage cookies via your browser settings. Disabling essential cookies may affect functionality.</p>

      <h2>3. Changes</h2>
      <p>We may update this Cookie Policy from time to time.</p>

      <div class="footer">Contact: support@servfixgh.com &bull; https://www.servfixgh.com</div>
    `,
  },
];

async function generate() {
  const browser = await puppeteer.launch({ headless: true });

  for (const policy of policies) {
    const page = await browser.newPage();
    const fullHtml = `<!DOCTYPE html><html><head><style>${sharedStyle}</style></head><body>${policy.html}</body></html>`;
    await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    const outPath = path.join(outDir, policy.filename);
    writeFileSync(outPath, pdfBuffer);
    console.log(`Generated: ${outPath}`);
    await page.close();
  }

  await browser.close();
  console.log("All PDFs generated.");
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
