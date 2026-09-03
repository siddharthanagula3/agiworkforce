import { Fragment } from 'react';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  ProductFrame,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

export const metadata = buildMetadata({
  title: 'Tools and connectors: MCP servers, OAuth apps, and permissions',
  description:
    'How a tool call is gated inside AGI: the mode check, the per-tool default, the approval prompt that opens on No, the 120-second timeout that cancels rather than approves, and the tools no standing grant can answer for.',
  path: '/features/tools',
});

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
        <PageHero
          id="agi-features-tools-title"
          eyebrow="Features · Tool permissions"
          title="The agent asks you before it acts, and for nineteen tools it asks every time."
          lede="MCP servers, OAuth connectors, and shell commands all arrive at the same gate. A tool call is a request, and a permission you never granted is not one the runtime can assume. Below is the order that gate actually runs in, and the tools it refuses to stop asking about."
          ctas={[
            { href: '/agent-permissions', label: 'Read the permission reference' },
            { href: '/connectors', label: 'See what connects', variant: 'secondary' },
          ]}
          visual={
            <ProductFrame
              src="/product/agents-tool-approvals-dark.png"
              srcLight="/product/agents-tool-approvals-light.png"
              alt='The tool approvals setting in AGI, with "Ask before every action" selected'
              width={1132}
              height={584}
              caption={['Settings', 'Tool approvals']}
              priority
            />
          }
        />

        <Section id="gate-order" labelledBy="agi-features-tools-gate-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The gate order</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-tools-gate-title">
                A tool call gets past all of this before it runs.
              </h2>
            </div>
            <Ledger
              caption="Tool approval gate order"
              rows={[
                {
                  label: 'Mode',
                  value:
                    'AGI Desktop carries an agent mode. In Safe and Plan the agent may call only read-only tools, so a write is refused before a prompt is even offered. The mode is stored, not held in memory, so a restriction you set survives the next launch.',
                },
                {
                  label: 'Default',
                  value:
                    'A connector tool you have never ruled on is Needs approval. If its name reads as a write (create, update, delete, remove), the default is Blocked instead. Nothing becomes allowed by omission.',
                },
                {
                  label: 'The ask',
                  value:
                    'The request carries the tool name, the arguments the model actually wrote, and a risk level. In the CLI overlay the cursor starts on No, so pressing Enter on a prompt you did not read cannot grant it.',
                },
                {
                  label: 'Silence',
                  value:
                    'The desktop dialog holds the call open for 120 seconds and then cancels it. An unanswered prompt returns an error to the caller; it is never counted as a yes.',
                },
                {
                  label: 'Reach',
                  value:
                    'Inside Local mode the CLI will only open a stdio MCP server. SSE and Streamable HTTP are network egress even when their tool schemas look read-only, so neither is offered there.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section
          id="standing-grants"
          labelledBy="agi-features-tools-standing-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <div>
              <Eyebrow>Standing grants</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-tools-standing-title">
                Some tools refuse to remember your answer.
              </h2>
            </div>
            <Prose>
              Always allow, an approval scoped to the session, and Autopilot are one grant at three
              lengths, so AGI Desktop governs them with one list. Nineteen tools are excluded from
              all three and prompt again on every call: the ones that rewrite the permission model
              itself, the ones that run code or write to your disk, and the ones that publish or
              destroy data outside the app. Every MCP tool is excluded as well, because what a tool
              does is decided by a third-party server and a remembered answer would follow the name
              after the server redefines it.
            </Prose>
            <Prose>
              {NEVER_REMEMBERABLE.map((tool, index) => (
                <Fragment key={tool}>
                  {index > 0 ? ', ' : ''}
                  <code>{tool}</code>
                </Fragment>
              ))}
            </Prose>
            <Prose size="sm">
              That list is a constant in the desktop source with a test pinning it entry for entry,
              so it cannot quietly get shorter. What the agent may do <em>without</em> asking on
              each surface is written out at{' '}
              <Link href="/agent-permissions" className="agi-ds-link">
                the permission reference
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="saved-rules" labelledBy="agi-features-tools-saved-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Saved rules</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-tools-saved-title">
                Your saved answers live in a file you can open.
              </h2>
            </div>
            <Prose>
              The rules sit in <code>permissions.toml</code> under <code>~/.agiworkforce</code>,
              written with owner-only file permissions on macOS and Linux.{' '}
              <code>agi approvals list</code> prints its Allow, Ask, Deny and Workspace tabs; allow,
              deny, session and remove edit them; export and import carry them to another machine;
              reset clears them. Matching is by whole token and deny is checked before allow, and a
              command containing a newline matches no stored rule at all, so an allow for{' '}
              <code>git status</code> cannot be ridden by a second line.
            </Prose>
            <ButtonRow>
              <Button href="/cli" variant="secondary">
                See the agi CLI
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <Section id="tools-close" labelledBy="agi-features-tools-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-tools-close-title">
              The gaps are written down too.
            </h2>
            <Prose>
              The security page sets out where data lives per trust boundary, what is encrypted,
              what is logged, and which protections stop short, with the gaps named rather than
              smoothed over. The download page says which installers are verified today.
            </Prose>
            <ButtonRow>
              <Button href="/security">Read the security model</Button>
              <Button href="/download" variant="secondary">
                Check availability
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
