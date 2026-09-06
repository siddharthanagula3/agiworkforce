import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Eyebrow,
  CodeTabs,
  CtaPanel,
  Ledger,
  Prose,
  SplitFeature,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { ConsoleWindow } from '@/features/marketing/components/FeatureScenes';

export const metadata = buildMetadata({
  title: 'Enterprise: evaluate without exposing your data',
  description:
    'Run AGI fully local or on your own provider keys, so no conversation content reaches our infrastructure. Identity, audit, and retention controls are administered by your own workspace owner, with build status stated honestly.',
  path: '/enterprise',
});

/**
 * When the enterprise control and compliance rows below were last reviewed
 * against the codebase. Rendered on the page, an undated "honest as of today"
 * is the same defect /trust was rewritten to remove (it promised "claims with
 * dates" and rendered none). Change this when you change a row.
 */
const STATUS_AS_OF = '23 August 2026';

/**
 * Field order is what `formatAuditEvent` emits; the metadata keys are the ones
 * the sanitiser in lib/security-audit.ts admits; the denial row is what the
 * export route records before it throws; newest-first matches the iterator.
 * Every value here is format, never a measurement, do not add counts.
 */
const AUDIT_EXPORT_FILENAME = 'agi-audit-<workspace-id>-2026-08-23.jsonl';

const AUDIT_EXPORT_LINE_BREAK = '\n\n';

const AUDIT_EXPORT_EVENTS = [
  '{"id":"1f8a4d6c-7b52-4a19-9e30-2c6d84b1f077","organizationId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","actorUserId":"user_31Kk8fQpZ2mXvR7d","surface":"web","action":"data_exported","resourceType":"enterprise_audit_events","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","outcome":"denied","severity":"warning","metadata":{"resourceType":"enterprise_audit_events","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","reason":"audit_export_disabled"},"createdAt":"2026-08-23T16:41:07.402Z"}',
  '{"id":"0b73e5aa-1c94-4d28-8f57-3ae0629b4d11","organizationId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","actorUserId":"user_31Kk8fQpZ2mXvR7d","surface":"web","action":"admin_policy_changed","resourceType":"organization_admin_policy","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","outcome":"success","severity":"warning","metadata":{"resourceType":"organization_admin_policy","resourceId":"7d2c9b41-53e8-4f60-a1b7-9c0e5d8a3f24","role":"owner","status":"updated","changedKeys":["auditExportEnabled"]},"createdAt":"2026-08-23T09:02:44.517Z"}',
];

const AUDIT_EXPORT_SAMPLE = AUDIT_EXPORT_EVENTS.join(AUDIT_EXPORT_LINE_BREAK);

const AUDIT_EXPORT_GLOB = 'agi-audit-*.jsonl';

const AUDIT_TABS = [
  {
    label: 'jq',
    language: 'shell',
    code: `$ jq -c '{action, outcome}' ${AUDIT_EXPORT_GLOB}\n${AUDIT_EXPORT_EVENTS.map((event) => {
      const record = JSON.parse(event) as Record<string, string>;
      return JSON.stringify({ action: record['action'], outcome: record['outcome'] });
    }).join('\n')}`,
    note: 'Two rows out of the JSONL your admin downloads.',
  },
  {
    label: AUDIT_EXPORT_FILENAME,
    language: 'json',
    code: AUDIT_EXPORT_SAMPLE,
    note: 'Newest first, one event per line, streamed as it is read.',
  },
] as const;

export default function EnterprisePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-enterprise-title"
          eyebrow="AGI for enterprise"
          title="Your data can stay where it is while the security review runs."
          lede="Most AI tools ask you to accept their data boundary before you are allowed to evaluate them. Local and BYOK invert that: a reviewer runs the product on their own hardware or their own provider contract, and the evaluation finishes without a conversation reaching AGI infrastructure. When you do buy, identity, policy, audit, and retention are administered by your own owner in a workspace console, and the ledgers below say which of those are built and which are still only commitments."
          ctas={[
            { href: '/contact-sales', label: 'Contact sales' },
            { href: '/trust', label: 'Read the dated trust ledger', variant: 'secondary' },
          ]}
          visual={<ConsoleWindow view="members" />}
        />

        {/*
          Every control row below must match shipped code, in both directions:
          never name a control we do not offer, and never call a shipped,
          entitlement-gated control "roadmap". There is NO data-region-pinning
          mechanism, so those rows stay cut. SSO/OIDC, SCIM directory sync, org
          audit read + JSONL export, audit streaming, and per-workspace
          retention are live, gated on the `enterprise_controls` /
          `audit_export` capabilities; retention enforcement is opt-in per
          workspace and fails closed, so do not restore "you set them" phrasing
          that implied it is unconditional. The four-hour SLA is a PLANNED
          target on /sla, not a binding promise; defer to /sla rather than
          restating it. Re-verify each row against the code before editing.
        */}
        <Section id="contract-coverage" labelledBy="agi-enterprise-contract-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>What an enterprise contract covers</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-enterprise-contract-title">
                Scoped on a contract, stated without inflation.
              </h2>
              <Prose>
                Reviewed {STATUS_AS_OF}. Everything below is implemented and live, gated on the
                enterprise_controls entitlement that ships with the Enterprise plan. When your
                org&rsquo;s owner configures both directly once that entitlement is on the account,
                an admin can read and filter the audit trail, and the workspace owner can set a
                retention window and decide whether it is enforced.
              </Prose>
            </div>
            <SplitFeature
              id="agi-enterprise-identity-title"
              eyebrow="Identity"
              title="SSO and directory provisioning, configured by your owner."
              body={
                <p>
                  SAML 2.0 and OIDC single sign-on, and SCIM 2.0 user and group provisioning from
                  your IdP, with token issuance and a provisioning event log at /workspace/identity.
                  Deactivating a user in your IdP removes their membership; an owner who wants to
                  keep a seat nominates a successor first.
                </p>
              }
              points={[
                'SAML 2.0 and OIDC, one connection per workspace',
                'SCIM 2.0 users and groups, with a provisioning log',
                'A member who already has a password can still sign in with it',
              ]}
              visual={<ConsoleWindow view="members" />}
            />
            <SplitFeature
              id="agi-enterprise-policy-title"
              eyebrow="Policy and retention"
              title="A ceiling the console enforces, not a preference it records."
              flip
              body={
                <p>
                  Which routes the workspace allows, whether managed cloud may be used at all, and
                  which client surfaces may sync. Your workspace owner sets a retention window
                  between 1 and 3650 days and decides whether it is enforced; until enforcement is
                  on, the window is recorded, nothing is deleted. Legal holds exempt any thread.
                </p>
              }
              points={[
                'Local, BYOK and AGI Cloud allowed per workspace',
                'Public share links and phone sync switch off server side',
                'Retention enforced only when the owner turns it on',
              ]}
              visual={<ConsoleWindow view="policy" />}
            />
            <SplitFeature
              id="agi-enterprise-audit-title"
              eyebrow="Audit"
              title="Every administrative and identity event, readable and streamable."
              body={
                <p>
                  Events are written through a security-definer function into a table the
                  application cannot update or delete, read by an admin with filters, exported as
                  JSONL, and streamed to your SIEM in batches signed with a per-workspace secret. A
                  refusal is recorded in the same trail as the change that caused it.
                </p>
              }
              points={[
                'Append-only table, streamed as it is read',
                'JSONL export, newest first',
                'Signed batches drained to your endpoint every ten minutes',
              ]}
              visual={<ConsoleWindow view="audit" />}
            />
            <Ledger
              caption="Contract terms"
              rows={[
                {
                  label: 'BYOK posture',
                  value:
                    'The strongest control available today, and it needs no feature work from us: every seat can run fully local, or on your own provider keys on Desktop, CLI and VS Code, and no conversation content reaches AGI Cloud. A member who moves a thread to managed cloud does so through an explicit, reviewed handoff.',
                },
                {
                  label: 'Service levels',
                  value:
                    'Your named contact gets a first response within 4 business hours (Central Time) for a service-down report, and within 1 business day otherwise, with an escalation path and the status page. Uptime numbers remain planned targets rather than binding commitments; see the SLA page for exactly which is which.',
                },
                {
                  label: 'MSA',
                  value: 'We negotiate against your procurement. No forced click-through.',
                },
              ]}
            />
          </Stack>
        </Section>

        {/*
          These rows must agree with /trust, which is the dated ledger and the
          page a reviewer is sent to. SOC 2 language stays as written: no
          auditor is engaged and no audit is in progress, and
          compliance-claim-honesty.test.ts fails the build if audit-programme
          language returns on any page. GDPR and CCPA are implemented through
          /api/user/export, /api/user/delete-account and the purge cron.
        */}
        <Section
          id="compliance-posture"
          labelledBy="agi-enterprise-compliance-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <div>
              <Eyebrow>{`Compliance posture as of ${STATUS_AS_OF}`}</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-enterprise-compliance-title">
                We claim only what is complete.
              </h2>
            </div>
            <Ledger
              caption="Compliance posture"
              rows={[
                {
                  label: 'SOC 2 Type II',
                  value:
                    'Not held. No report exists, no auditor is engaged, and no audit is in progress. We are not going to describe internal work as an audit programme.',
                },
                {
                  label: 'GDPR: data subject rights',
                  value:
                    'Implemented. Self-service export returns your account data as a download, and account deletion runs an enumerated erasure on a scheduled job.',
                },
                {
                  label: 'CCPA / CPRA',
                  value:
                    'Implemented, through the same export and erasure paths. We do not sell personal information; the privacy policy carries that disclosure.',
                },
                {
                  label: 'HIPAA',
                  value: 'Not available. AGI does not offer HIPAA-covered workflows today.',
                },
                {
                  label: 'ISO 27001',
                  value: 'Not held. No certification body is engaged and no date is claimed.',
                },
                {
                  label: 'Everything else',
                  value: 'On the roadmap with no date until there is a date.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="audit-artifact" labelledBy="agi-enterprise-export-title" rule>
          <SplitFeature
            id="agi-enterprise-export-title"
            eyebrow="The artifact behind the audit row"
            title="Your reviewer can read the export line by line."
            body={
              <p>
                These two rows are the shape your admin downloads. Read them together: an owner
                switched export off that morning, and the afternoon attempt to download the trail
                was refused, so the denial is in the trail, next to the change that caused it.
              </p>
            }
            visual={<CodeTabs tabs={AUDIT_TABS} title="Two rows of an audit export" />}
          />
        </Section>

        <Section id="enterprise-close" labelledBy="agi-enterprise-close-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Start the evaluation</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-enterprise-close-title">
                You can start before you talk to us.
              </h2>
            </div>
            <CtaPanel
              label="Two ways to evaluate"
              cards={[
                {
                  title: 'Run it on your own hardware first',
                  body: 'Local and BYOK need no contract, no trial, and no seat, so a reviewer can run the product while procurement is still reading.',
                  points: [
                    'Nothing reaches AGI infrastructure in Local mode',
                    'BYOK traffic goes straight to your provider contract',
                    'The route is printed on every reply',
                  ],
                  cta: { href: '/download', label: "See what's live" },
                },
                {
                  title: 'Send the questionnaire',
                  body: "You will get direct answers, including the ones where the answer is 'not yet'.",
                  points: [
                    'Dated claims on the trust ledger',
                    'A contract negotiated against your procurement',
                    'A named contact with a first-response window',
                  ],
                  cta: { href: '/contact-sales', label: 'Contact sales' },
                },
              ]}
            />
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
