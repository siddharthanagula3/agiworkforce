import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

const INCLUDED: { k: string; v: string }[] = [
  { k: 'SSO', v: 'SAML 2.0 + OIDC. Okta, Azure AD, Google Workspace.' },
  { k: 'SCIM', v: 'User and group provisioning. Add and remove seats from your IdP.' },
  { k: 'Audit log', v: 'Every model call, tool execution, user action. Export to your SIEM.' },
  { k: 'Retention', v: 'Org-level retention windows. You set them.' },
  {
    k: 'BYOK enforcement',
    v: 'Force BYOK across the org. Zero managed-cloud spend unless you opt in.',
  },
  { k: 'Residency', v: 'Default us-east-2. EU on roadmap. Custom regions on contract.' },
  { k: 'SLA', v: 'Four-hour response. Named support contact.' },
  { k: 'MSA', v: 'Negotiate against your procurement. We do not require a click-through.' },
];

const COMPLIANCE: { k: string; v: string }[] = [
  { k: 'SOC 2 Type II', v: 'In progress. Audit initiated.' },
  { k: 'GDPR', v: 'DPA available on request.' },
  { k: 'HIPAA', v: 'BAA on request. Not HIPAA-certified.' },
  { k: 'ISO 27001', v: 'On the roadmap. No date claimed.' },
];

export default function RedesignPreviewEnterprisePage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">
          The same product. With the controls your security team needs.
        </h1>
        <p className="pv-page-lede">
          SSO, SCIM, audit log export, custom retention, regional residency on request, and a
          four-hour SLA — on a contract that names you.{' '}
          <strong>
            One CTA at the bottom of the page. We are not going to chase you with three.
          </strong>
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">What&rsquo;s included</p>
        <table className="pv-ledger">
          <tbody>
            {INCLUDED.map((row) => (
              <tr key={row.k}>
                <td>{row.k}</td>
                <td>{row.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Compliance posture — honest as of today</p>
        <table className="pv-ledger">
          <tbody>
            {COMPLIANCE.map((row) => (
              <tr key={row.k}>
                <td>{row.k}</td>
                <td>{row.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          className="pv-step-body"
          style={{ marginTop: 18, color: 'var(--pv-ink-quiet)', fontSize: 13 }}
        >
          We claim only what we have completed. Anything else is on the roadmap with no date until
          there&rsquo;s a date.
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Talk to us</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: '60ch' }}>
          <p className="pv-step-body" style={{ fontSize: 16 }}>
            We answer. A real human, on a real contract, against your real security review.
          </p>
          <div className="pv-cta-row">
            <Link href="/contact-sales" className="pv-cta-primary">
              Contact sales
            </Link>
            <Link href="/redesign-preview/byok" className="pv-cta-ghost">
              Read the BYOK posture →
            </Link>
          </div>
        </div>
      </section>

      <AgiFooter />
    </main>
  );
}
