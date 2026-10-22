import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8').replace(/\s+/gu, ' ');
const overlay = readFileSync(
  join(REPO_ROOT, 'apps/cli/src/tui/widgets/approval_overlay.rs'),
  'utf8',
);
const tui = readFileSync(join(REPO_ROOT, 'apps/cli/src/tui/tui_app.rs'), 'utf8');

describe('/features/agents, the approval overlay', () => {
  it('names the choice the CLI asserts the cursor opens on', () => {
    const asserted =
      /const _: \(\) = assert!\(matches!\(CHOICES\[DEFAULT_CURSOR\], ApprovalChoice::(\w+)\)\);/u.exec(
        overlay,
      );

    expect(asserted, 'the default-cursor assertion moved').not.toBeNull();
    expect(page).toContain(`The overlay opens with the cursor on ${asserted![1]}`);
    expect(page).not.toMatch(/parked on No|if the default is no|it shipped closed/iu);
  });

  it('says Esc answers No because the overlay does', () => {
    expect(overlay).toMatch(/KeyAction::Esc => \{[^}]*ApprovalChoice::No/u);
    expect(page).toContain('Esc always answers No');
  });

  it('says an unanswered prompt does not run because the CLI expires it', () => {
    expect(tui).toMatch(/const APPROVAL_EXPIRY: Duration/u);
    expect(tui).toContain('without an answer, so it did not run');
    expect(page).toContain('a prompt left unanswered expires without running the call');
  });
});

describe('/features/agents, which surface each part belongs to', () => {
  it('scopes the CLI statement to the parts the CLI owns', () => {
    expect(page).toContain(
      'The agent files, subagents, hooks and sandbox described below belong to the agi CLI.',
    );
    expect(page).not.toContain('Everything on this page describes the agi CLI');
  });

  it('names the web preview as the web app', () => {
    expect(page).toContain('<AgentRunWindow />');
    expect(page).toContain('The preview above shows a tool waiting for approval in AGI Chat.');
  });
});
