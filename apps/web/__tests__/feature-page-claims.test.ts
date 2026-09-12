import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Claim guard for the landing page and the feature pages that describe how the
 * product behaves.
 *
 * Commit d42d3cb15 rewrote these pages onto the flagship system and carried a
 * set of claims the code does not make good on. Each case below pins the true
 * statement and bans the phrasing that was wrong, so a future writer trips on
 * the words rather than on a review.
 *
 * The bans are patterns, not quoted copy, because the defect is the claim and
 * not the sentence it arrived in.
 */

const WEB_ROOT = join(__dirname, '..');

function read(path: string): string {
  return readFileSync(join(WEB_ROOT, path), 'utf8');
}

function collapsed(path: string): string {
  return read(path).replace(/\s+/gu, ' ');
}

const LANDING = 'features/marketing/components/MarketingLanding.tsx';
const AI_CHAT = 'app/features/ai-chat/page.tsx';
const ARTIFACTS = 'app/features/artifacts/page.tsx';
const AGENTS = 'app/features/agents/page.tsx';
const AGI_WORK = 'app/agi-work/page.tsx';
const AGI_CODE = 'app/agi-code/page.tsx';

describe('landing, the Chrome surface card', () => {
  /**
   * apps/extension/src/features/cloud-bridge/freeTrialClient.ts posts every
   * extension chat turn to the Managed Cloud gateway under the signed-in
   * account token. The native-messaging bridge carries selections, captures and
   * queued messages into Desktop; it is not where answers come from. /chrome
   * -extension was corrected for the same claim in 3fbb1a024 and the landing
   * card repeated it.
   */
  const BANNED: ReadonlyArray<readonly [string, RegExp]> = [
    ['real work executes on desktop', /real work (executes|runs) on desktop/iu],
    ['work executes over the bridge', /work (executes|runs) on desktop over/iu],
    ['chat executes on desktop', /chat (models )?(and tools )?runs? on desktop/iu],
    ['models and tools run on desktop', /models and tools run on desktop/iu],
  ];

  for (const [label, pattern] of BANNED) {
    it(`does not claim ${label}`, () => {
      expect(collapsed(LANDING)).not.toMatch(pattern);
    });
  }

  it('names Managed Cloud as where an extension answer comes from', () => {
    const source = collapsed(LANDING);
    expect(source).toContain('Answers come back from AGI Managed Cloud');
    expect(source).toContain('Chat answered by Managed Cloud');
  });
});

describe('landing, the Desktop surface card', () => {
  /**
   * AGI Work is a mode of the web chat composer, gated on the `agi_work` plan
   * capability and rendered by
   * apps/web/features/chat/components/Composer/ChatComposerNew.tsx. The desktop
   * app has no such mode: apps/desktop/src/features/agi/AgentTaskPanel.tsx
   * carries scheduled tasks and background agents instead.
   */
  it('does not sell AGI Work as a Desktop capability', () => {
    expect(collapsed(LANDING)).not.toMatch(/scheduled work with agi work/iu);
  });

  it('names the scheduling Desktop actually ships', () => {
    expect(collapsed(LANDING)).toContain('Scheduled tasks and background agents');
  });
});

describe('/features/ai-chat, the memory card', () => {
  /**
   * `/memory` is registered in packages/ui/unified-chat/src/lib/slashCommands.ts
   * under `registerBuiltinSlashCommands`, which no application calls; the web
   * composer's menu is built from `BUILT_IN_SLASH_COMMANDS`, which has no memory
   * entry. Typing /memory does nothing. The list lives at /settings/memory.
   */
  it('does not promise a /memory slash command', () => {
    const source = collapsed(AI_CHAT);
    expect(source).not.toMatch(/(type|typing|run|enter)\s+\/memory\b/iu);
    expect(source).not.toMatch(/\/memory\b['"]?\s*[,.]?\s*(to |opens|for )/iu);
  });

  it('keeps the slash-command ledger to the commands the menu builds', () => {
    const ledger = /caption="Slash commands"[\s\S]*?\]\}/u.exec(read(AI_CHAT));
    expect(ledger, 'slash command ledger not found').not.toBeNull();
    expect(ledger![0]).not.toMatch(/\/memory|\/plan|\/rewind|\/clear|\/model|\/help/u);
  });

  it('points at Settings for the memory list', () => {
    expect(collapsed(AI_CHAT)).toContain('Settings holds what the assistant has kept about you');
  });
});

describe('/features/artifacts, the panel shortcut', () => {
  /**
   * apps/web/features/chat/hooks/use-keyboard-shortcuts.ts binds
   * `toggle-artifacts` to key A with ctrl, meta AND shift. A bare Shift+A types
   * a letter.
   */
  it('does not claim a bare Shift+A toggles the panel', () => {
    expect(collapsed(ARTIFACTS)).not.toMatch(/shift\s?\+\s?a\b/iu);
  });

  it('names the full chord', () => {
    expect(collapsed(ARTIFACTS)).toContain('Ctrl or Cmd with Shift and A opens and closes it');
  });
});

describe('/features/agents, the sandbox surfaces', () => {
  /**
   * apps/cli/src/claude_parity.rs `render_sandbox` prints the permission mode,
   * the skip-permissions flag and the registered additional workspace roots. It
   * prints no tool allow or block list and no backend name, and the modes are
   * the `PermissionMode` values in apps/cli/src/cli_options.rs, not
   * "read-only, contained, unrestricted".
   */
  it('does not invent sandbox mode names', () => {
    const source = collapsed(AGENTS);
    expect(source).not.toMatch(/read-only, contained, and unrestricted/iu);
    expect(source).not.toMatch(/the tools it allows, the ones it blocks/iu);
  });

  it('describes what /sandbox actually prints', () => {
    const source = collapsed(AGENTS);
    expect(source).toContain('prints the permission mode the session is running under');
    expect(source).toContain('every extra workspace root registered for it');
  });

  /**
   * apps/cli/src/sandbox.rs `missing_sandbox_message` tells the operator to
   * re-run with --no-sandbox, so the sandbox is not something the CLI refuses to
   * start without. The page has to name that escape hatch rather than sell an
   * absolute.
   */
  it('names the sandbox opt-out rather than claiming an absolute', () => {
    const source = collapsed(AGENTS);
    expect(source).not.toMatch(/sandbox the cli refuses to start without/iu);
    expect(source).toContain('--no-sandbox');
  });
});

describe('/agi-work, the plan', () => {
  /**
   * apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts
   * `advanceAgiWorkPlan` has exactly two transitions: 'start' marks the first
   * pending step in progress, and one terminal transition settles every
   * remaining step at once. No step is tracked individually, and
   * apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts logs
   * "continuing without a plan" when the planning turn returns nothing
   * parseable.
   */
  it('does not claim each step is tracked through the run', () => {
    expect(collapsed(AGI_WORK)).not.toMatch(
      /each moving from pending to in progress to completed/iu,
    );
  });

  it('states how the plan really moves', () => {
    const source = collapsed(AGI_WORK);
    expect(source).toContain('The first step is marked in progress as the run starts');
    expect(source).toContain('the rest settle when it ends');
  });

  it('does not promise a plan on every run', () => {
    const source = collapsed(AGI_WORK);
    expect(source).not.toMatch(/three to six step plan before the first tool call/iu);
    expect(source).toContain('leaves the run with no plan rather than stopping it');
  });

  /**
   * packages/contracts/types/src/billing-catalog.ts maps `agi_work` to
   * PRO_TIERS, and ChatComposerNew.tsx renders the Chat | AGI Work control only
   * when `canUseBillingPlanCapability(tier, 'agi_work')` holds.
   */
  it('keeps the plan gate on Pro and above', () => {
    expect(collapsed(AGI_WORK)).toContain('Pro plans and above');
  });
});

describe('/agi-code, session forking', () => {
  /**
   * apps/cli/src/lib.rs exposes forking as `Command::Fork` and
   * `SessionAction::Fork` (`agi fork <id>`, `agi session fork <id> --at-turn`).
   * The only slash commands carrying "fork" in apps/cli/src/claude_parity.rs are
   * /fork-byok and /fork-cloud, which change the trust route, not the session.
   */
  it('does not claim a /fork slash command', () => {
    expect(collapsed(AGI_CODE)).not.toMatch(/fork it with \/fork/iu);
  });

  it('names the command that forks a session', () => {
    expect(collapsed(AGI_CODE)).toContain('agi session fork');
  });
});
