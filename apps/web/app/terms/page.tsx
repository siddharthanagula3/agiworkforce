import Link from 'next/link';
import { Bot } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service',
  description:
    'Terms of service for AGI Workforce. License terms, user responsibilities, and usage policies.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service | AGI Workforce',
    description: 'Terms of service for AGI Workforce.',
    type: 'website',
    url: 'https://agiworkforce.com/terms',
  },
  twitter: {
    card: 'summary' as const,
    title: 'Terms of Service | AGI Workforce',
    description: 'Terms of service for AGI Workforce.',
  },
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1 pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
          <div className="prose prose-invert prose-lg text-zinc-400">
            <p className="lead text-xl text-zinc-300 mb-8">Last updated: May 3, 2026</p>
            <p>
              <strong>Note for legal review:</strong> This document requires sign-off from legal
              counsel before it is published as a binding agreement. The current version reflects
              the intended commercial terms as of the date above.
            </p>

            <h3>1. Acceptance of Terms</h3>
            <p>
              By downloading, installing, or using any AGI Workforce application or service
              (collectively, the &ldquo;Services&rdquo;) provided by AGI Automation LLC (&ldquo;AGI
              Workforce&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;), you agree
              to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do
              not use the Services.
            </p>

            <h3>2. License Grant</h3>
            <p>
              Subject to your ongoing compliance with these Terms, we grant you a limited, personal,
              non-exclusive, non-transferable, non-sublicensable, revocable license to install and
              use the AGI Workforce applications on devices you own or control, solely for your own
              internal business or personal purposes.
            </p>
            <p>
              You may not: (a) reverse-engineer, decompile, or disassemble any part of the Services;
              (b) resell or sublicense access to the Services; (c) use the Services to build a
              competing product; or (d) remove any proprietary notices.
            </p>

            <h3>3. Subscription Plans, Billing, and Auto-Renewal</h3>
            <p>
              Certain tiers of the Services require a paid subscription. By subscribing, you
              authorize AGI Automation LLC to charge the payment method on file through{' '}
              <strong>Stripe</strong> on a recurring basis (monthly or annual, as selected).
            </p>
            <ul>
              <li>
                <strong>Auto-renewal:</strong> Subscriptions renew automatically at the end of each
                billing period unless cancelled before the renewal date. You will receive an email
                reminder at least 7 days before renewal for annual plans.
              </li>
              <li>
                <strong>Cancellation:</strong> Cancel at any time in Settings → Subscription.
                Cancellation takes effect at the end of the current billing period; no partial
                refunds are issued for unused time unless required by applicable law.
              </li>
              <li>
                <strong>Price changes:</strong> We will give at least 30 days&apos; notice of price
                changes by email. Continued use after the effective date constitutes acceptance.
              </li>
              <li>
                <strong>Free tiers:</strong> Local Mode and BYOK Mode are and will remain free. We
                reserve the right to add, modify, or remove features in free tiers with reasonable
                notice.
              </li>
            </ul>

            <h3>4. BYOK (Bring Your Own Key)</h3>
            <p>
              If you use BYOK mode, your API keys are stored encrypted on your device or in our
              secure vault. You are responsible for the costs incurred on your provider accounts.
              AGI Workforce is not liable for unexpected API charges arising from your use of the
              Services.
            </p>

            <h3>5. User Responsibilities and Acceptable Use</h3>
            <p>You are responsible for:</p>
            <ul>
              <li>Maintaining the confidentiality of your account credentials.</li>
              <li>All activities that occur under your account.</li>
              <li>Ensuring your use complies with applicable laws and regulations.</li>
              <li>
                Not using the Services to generate content that is illegal, harmful, defamatory,
                harassing, or infringing on third-party rights.
              </li>
              <li>
                Not using automated access (beyond the CLI/API interfaces we provide) to circumvent
                usage limits.
              </li>
              <li>
                Complying with the terms of service of each AI provider whose models you access
                through the Services.
              </li>
            </ul>

            <h3>6. Data Processing Agreement (DPA)</h3>
            <p>
              If you are subject to the GDPR, CCPA, or other applicable data protection laws and are
              using the Services in a business context, you may request a Data Processing Agreement
              by contacting legal@agiworkforce.com. The DPA will govern the processing of personal
              data we handle on your behalf and will supplement these Terms.
            </p>

            <h3>7. Intellectual Property</h3>
            <p>
              AGI Workforce and its licensors own all rights, title, and interest in the Services,
              including all intellectual property rights. Your use of the Services does not grant
              you any ownership rights. You retain ownership of content you create using the
              Services.
            </p>

            <h3>8. Termination</h3>
            <p>
              Either party may terminate this agreement at any time. We may suspend or terminate
              your account immediately, without prior notice or liability, if you materially breach
              these Terms, your payment fails after a reasonable grace period, or we are required to
              do so by law.
            </p>
            <p>
              Upon termination: your license to use the Services ceases immediately; we will provide
              a 30-day window for you to export your data before deletion (Cloud Mode data only);
              Local Mode data on your device is yours and is not affected.
            </p>

            <h3>9. Disclaimers and Warranty Disclaimer</h3>
            <p>
              THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
              WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, AGI AUTOMATION LLC
              DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE
              DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
              COMPONENTS.
            </p>
            <p>
              AI-generated content may be inaccurate, incomplete, or inappropriate. You are solely
              responsible for reviewing and verifying any output before relying on it.
            </p>

            <h3>10. Limitation of Liability</h3>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL AGI AUTOMATION
              LLC, ITS DIRECTORS, EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE
              FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES,
              INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE
              LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE
              SERVICES.
            </p>
            <p>
              OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED TO
              THESE TERMS OR THE SERVICES WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO
              AGI AUTOMATION LLC IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM OR (B) ONE HUNDRED US
              DOLLARS (USD $100).
            </p>

            <h3>11. Indemnification</h3>
            <p>
              You agree to indemnify, defend, and hold harmless AGI Automation LLC and its officers,
              directors, employees, and agents from and against any claims, liabilities, damages,
              losses, and expenses (including reasonable attorneys&apos; fees) arising out of or in
              any way connected with your access to or use of the Services, your violation of these
              Terms, or your infringement of any third-party right.
            </p>

            <h3>12. Arbitration and Dispute Resolution</h3>
            <p>
              Any dispute, controversy, or claim arising out of or relating to these Terms or the
              breach, termination, or validity thereof shall first be subject to good-faith
              negotiation. If unresolved within 30 days, disputes shall be resolved by binding
              arbitration under the rules of the American Arbitration Association (AAA) in Delaware,
              USA. The arbitration shall be conducted in English. Judgment on the award may be
              entered in any court of competent jurisdiction.
            </p>
            <p>
              <strong>Class action waiver:</strong> You waive any right to participate in a class
              action lawsuit or class-wide arbitration. This waiver does not apply where prohibited
              by law.
            </p>
            <p>
              Nothing in this section prevents either party from seeking injunctive or other
              equitable relief in a court of competent jurisdiction to prevent irreparable harm.
            </p>

            <h3>13. Governing Law and Jurisdiction</h3>
            <p>
              These Terms are governed by and construed in accordance with the laws of the State of
              Delaware, United States, without regard to its conflict-of-law provisions. To the
              extent court proceedings are permitted under Section 12, you consent to the exclusive
              jurisdiction of the state and federal courts located in Delaware.
            </p>

            <h3>14. Modifications to Terms</h3>
            <p>
              We reserve the right to modify these Terms at any time. We will provide at least 30
              days&apos; notice of material changes by posting the revised Terms at
              agiworkforce.com/terms and emailing registered users. Your continued use of the
              Services after the effective date constitutes acceptance of the revised Terms.
            </p>

            <h3>15. Miscellaneous</h3>
            <ul>
              <li>
                <strong>Entire agreement:</strong> These Terms, together with our Privacy Policy and
                any applicable DPA, constitute the entire agreement between you and AGI Automation
                LLC regarding the Services.
              </li>
              <li>
                <strong>Severability:</strong> If any provision of these Terms is found
                unenforceable, that provision will be modified to the minimum extent necessary to
                make it enforceable, and the remaining provisions will remain in full force.
              </li>
              <li>
                <strong>Waiver:</strong> Our failure to enforce any provision of these Terms is not
                a waiver of our right to enforce it in the future.
              </li>
              <li>
                <strong>Assignment:</strong> You may not assign these Terms without our prior
                written consent. We may assign our rights and obligations under these Terms without
                restriction.
              </li>
            </ul>

            <h3>16. Contact</h3>
            <p>
              Questions about these Terms:
              <br />
              <strong>AGI Automation LLC</strong>
              <br />
              Email: legal@agiworkforce.com
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
