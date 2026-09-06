import { Fragment } from 'react';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
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
    'How a tool call is gated inside AGI: the mode check, the per-tool default, the approval prompt that opens on No, the 120-second timeout that cancels rather than approves, and the tools no standing grant can answer for.',
  path: '/features/tools',
});

const IDS = {
  hero: 'agi-features-tools-title',
  gate: 'agi-features-tools-gate-title',
  standing: 'agi-features-tools-standing-title',
  saved: 'agi-features-tools-saved-title',
  close: 'agi-features-tools-close-title',
} as const;

const NEVER_REMEMBERABLE = [
  'set_auto_approve_all',
  'set_agent_mode:autopilot',
  'set_tool_approval_policy',
  'execute_code',
  'code_execute',
  'file_write',
  'file_write_text',
  'file_write_binary',
  'file_open_with_default_app',
  'terminal_execute',
  'folder_access',
  'playwright_evaluate',
  'email_send',
  'git_push',
  'cloud_upload',
  'db_execute',
  'browser_execute_async_js',
  'browser_evaluate',
  'browser_execute_in_frame',
];

export default function FeaturesToolsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Tool permissions</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">The agent asks first,</span>
                <em className="agi-lp-accent">and nineteen tools ask every time.</em>
              </h1>
              <p className="agi-lp-lede">
                MCP servers, OAuth connectors, and shell commands all arrive at the same gate. A
                tool call is a request, and a permission you never granted is not one the runtime
                can assume.
              </p>
              <ButtonRow>
                <Button href="/agent-permissions">Read the permission reference</Button>
                <Button href="/connectors" variant="secondary">
                  See what connects
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
            <Ledger
              caption="Tool approval gate order"
              rows={[
                {
                  label: 'Mode',
                  value:
                    'In Safe and Plan, AGI Desktop may call only read-only tools, so a write is refused before a prompt is even offered.',
                },
                {
                  label: 'Default',
                  value:
                    'A connector tool you have never ruled on is Needs approval. A write-shaped name defaults to Blocked instead.',
                },
                {
                  label: 'The ask',
                  value:
                    'The request carries the tool name, the arguments the model actually wrote, and a risk level.',
                },
                {
                  label: 'Silence',
                  value:
                    'The desktop dialog holds the call open for 120 seconds and then cancels it. It is never counted as a yes.',
                },
                {
                  label: 'Reach',
                  value:
                    'Inside Local mode the CLI will only open a stdio MCP server; SSE and Streamable HTTP are network egress and are not offered there.',
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
                Some tools refuse to remember your answer.
              </h2>
            </div>
            <Prose>
              Always allow, an approval scoped to the session, and Autopilot are one grant at three
              lengths. Nineteen tools are excluded from all three and prompt again on every call:
              the ones that rewrite the permission model itself, the ones that run code or write to
              your disk, and the ones that publish or destroy data outside the app. Every MCP tool
              is excluded as well, because what a tool does is decided by a third-party server.
            </Prose>
            <Prose size="sm">
              {NEVER_REMEMBERABLE.map((tool, index) => (
                <Fragment key={tool}>
                  {index > 0 ? ', ' : ''}
                  <code>{tool}</code>
                </Fragment>
              ))}
            </Prose>
            <Prose size="sm">
              That list is a constant in the desktop source with a test pinning it entry for entry.
              What the agent may do <em>without</em> asking on each surface is written out at{' '}
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
                Your saved answers live in a file you can open.
              </h2>
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
                      <code>agi approvals list</code> prints its Allow, Ask, Deny and Workspace
                      tabs; allow, deny, session and remove edit them; export and import carry them
                      to another machine; reset clears them.
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
