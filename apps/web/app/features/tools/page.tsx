import Link from 'next/link';
import {
  CONNECTORS_COMING_SOON_DETAIL,
  CONNECTORS_COMING_SOON_LABEL,
  CONNECTORS_COMING_SOON_MESSAGE,
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_APPROVAL_HIGH_RISK_NOTICE,
  connectorsReleased,
} from '@agiworkforce/types';
import { buildMetadata } from '@/lib/seo/metadata';
import { CLI_AVAILABILITY_NOTE } from '@/lib/surface-status';
import { buildToolApprovalPolicyRows } from '@/lib/tool-approval-view';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  toolApprovalPolicyOption,
} from '@shared/types/toolApprovalPolicy';
import { Header } from '@shared/components/layout/Header';
import { AgentRunWindow } from '@/features/marketing/components/FeatureScenes';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';

export const metadata = buildMetadata({
  title: 'Tools and connectors: MCP servers, OAuth apps, and permissions',
  description:
    'How a tool call is gated in AGI Web: a tool you denied, your saved choice, the account default, the connector tools AGI does not know, and the high-risk approval no standing answer covers.',
  path: '/features/tools',
});

const IDS = {
  hero: 'agi-features-tools-title',
  gate: 'agi-features-tools-gate-title',
  standing: 'agi-features-tools-standing-title',
  saved: 'agi-features-tools-saved-title',
  close: 'agi-features-tools-close-title',
} as const;

const CONNECTORS_RELEASED = connectorsReleased();
const CONNECTORS_STATUS_LABEL = `Connectors: ${CONNECTORS_COMING_SOON_LABEL.toLowerCase()}`;
const CONNECTORS_NOTE = CONNECTORS_RELEASED ? '' : ` ${CONNECTORS_COMING_SOON_MESSAGE}`;
const CLI_NOTE = CLI_AVAILABILITY_NOTE ? ` ${CLI_AVAILABILITY_NOTE}` : '';

const ACCOUNT_DEFAULT = toolApprovalPolicyOption(WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY);
const WITHHELD_FALLBACK = toolApprovalPolicyOption(DEFAULT_TOOL_APPROVAL_POLICY);
const RUNS_UNDER_ACCOUNT_DEFAULT =
  buildToolApprovalPolicyRows().find((row) => row.isDefault)?.runsWithoutAsking ?? [];

const { allow, allowForChat, alwaysAllow, ask, deny } = TOOL_APPROVAL_ACTION_LABELS;

export default function FeaturesToolsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">
                Features &middot; Tool permissions
                {CONNECTORS_RELEASED ? null : <> &middot; {CONNECTORS_STATUS_LABEL}</>}
              </p>
              <h1 className="sr-only" id={IDS.hero}>
                <span className="agi-lp-line">
                  On the website the default is {ACCOUNT_DEFAULT.label}.
                </span>{' '}
                <em className="agi-lp-accent">{ACCOUNT_DEFAULT.hint}</em>
              </h1>
              <ButtonRow>
                <Button href="/agent-permissions">Read the permission reference</Button>
                <Button href="/connectors/mcp-directory" variant="secondary">
                  Browse the MCP directory
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <AgentRunWindow />
            </div>
          </div>
        </section>

        <Section id="gate-order" labelledBy={IDS.gate} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The gate order</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.gate}>
                A tool call gets past all of this before it runs.
              </h2>
            </div>
            <Prose>
              Under {ACCOUNT_DEFAULT.label}, eligible reads, searches, and sandboxed code run on
              their own, while destructive actions and connector tools AGI does not know still ask.
              {CONNECTORS_RELEASED ? null : ` ${CONNECTORS_COMING_SOON_DETAIL}`}
            </Prose>
            <Ledger
              caption="Tool approval gate order"
              rows={[
                {
                  label: deny,
                  value: `A connector tool you set to ${deny} is refused first, before any other rule is read.${CONNECTORS_NOTE}`,
                },
                {
                  label: alwaysAllow,
                  value: `A connector tool saved as ${alwaysAllow} runs, unless the escalation below trips, and then it asks.`,
                },
                {
                  label: ask,
                  value: `A connector tool saved as ${ask} asks every time, whatever the account default says.`,
                },
                {
                  label: 'Account default',
                  value: `A new account uses ${ACCOUNT_DEFAULT.label}. ${ACCOUNT_DEFAULT.hint} Where a workspace withholds it, the account falls back to ${WITHHELD_FALLBACK.label}.`,
                },
                {
                  label: 'Unknown tools',
                  value:
                    'A connector or MCP tool AGI has not classified is treated as an irreversible write that can send data out, so no account default runs it on its own.',
                },
                {
                  label: 'Escalation',
                  value:
                    'When untrusted content is in the chat, a private source is in reach and the call can send data out, the call waits for a person even if it would otherwise have run.',
                },
                {
                  label: 'Local mode',
                  value: `Inside Local mode the CLI will only open a stdio MCP server; SSE and Streamable HTTP are network egress and are not offered there.${CLI_NOTE}`,
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="standing-grants" labelledBy={IDS.standing} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Standing grants</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.standing}>
                A high-risk approval cannot be answered in advance.
              </h2>
            </div>
            <Prose>
              An approval card offers {allow}, {allowForChat} and {deny}. {allowForChat} also
              answers later calls to the same tool in that chat for as long as the page stays open.
              A high-risk approval is the exception. The card warns &ldquo;
              {TOOL_APPROVAL_HIGH_RISK_NOTICE}&rdquo; and offers only {allow} and {deny}, and an
              allowance the chat already holds does not answer it.
            </Prose>
            <Prose size="sm">
              Under {ACCOUNT_DEFAULT.label} these built-in tools run without asking:{' '}
              {RUNS_UNDER_ACCOUNT_DEFAULT.join(', ')}.
            </Prose>
            <Prose size="sm">
              That list is built from the same table the server reads. What the agent may do{' '}
              <em>without</em> asking under each setting is written out at{' '}
              <Link href="/agent-permissions" className="agi-ds-link">
                the permission reference
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="saved-rules" labelledBy={IDS.saved} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Saved rules</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.saved}>
                In the CLI, your saved answers live in a file you can open.
              </h2>
              {CLI_AVAILABILITY_NOTE ? <Prose>{CLI_AVAILABILITY_NOTE}</Prose> : null}
            </div>
            <Ledger
              caption="Saved permission rules"
              rows={[
                {
                  label: 'File',
                  value: (
                    <>
                      <code>permissions.toml</code> under <code>~/.agiworkforce</code>, written with
                      owner-only file permissions on macOS and Linux.
                    </>
                  ),
                },
                {
                  label: 'Commands',
                  value: (
                    <>
                      <code>agi approvals list</code> prints the Allow, Ask and Deny rules; allow,
                      ask, deny, session and remove edit them; export and import carry them to
                      another machine; reset clears them.
                    </>
                  ),
                },
                {
                  label: 'Matching',
                  value: (
                    <>
                      By whole token, deny checked before allow. A command containing a newline
                      matches no stored rule, so an allow for <code>git status</code> cannot be
                      ridden by a second line.
                    </>
                  ),
                },
              ]}
            />
            <ButtonRow>
              <Button href="/cli" variant="secondary">
                See the agi CLI
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                The gaps are <em className="agi-lp-accent">written down too.</em>
              </h2>
              <p className="agi-lp-lede">
                The security page sets out where data lives per trust boundary, what is encrypted,
                what is logged, and which protections stop short, with the gaps named rather than
                smoothed over.
              </p>
              <ButtonRow>
                <Button href="/security">Read the security model</Button>
                <Button href="/download" variant="secondary">
                  Check availability
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
