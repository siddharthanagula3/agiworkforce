export const meta = {
  name: 'agi-cli-migration-ux',
  description:
    'Migration-first UX: audit the journey of a Claude Code/Codex/Gemini user switching to AGI CLI (esp. Local/BYOK/Cloud surfacing), verify each gap against real code, emit a prioritized build-spec plan',
  phases: [
    {
      title: 'Audit',
      detail:
        'grounded migration-friction audit across onboarding, access modes, composer, slash, keys, approvals, transcript, panels, status, help',
    },
    {
      title: 'Verify',
      detail: 'adversarially confirm each P0/P1 gap is real, current-state-accurate, buildable',
    },
    {
      title: 'Spec',
      detail:
        'write the prioritized migration plan to disk + concrete Rust build specs for top items',
    },
  ],
};

const DATE = (args && args.date) || '2026-06-01';

// Repo root, resolved without hardcoding a developer machine path so the
// harness runs for any contributor / CI runner. Priority:
//   1. explicit --repo arg (args.repo)
//   2. process.cwd() when the harness is launched from the repo root
//   3. last-resort fallback for the original author's layout
const REPO =
  (args && args.repo) ||
  (typeof process !== 'undefined' && process.cwd && process.cwd()) ||
  '/Users/siddhartha/Desktop/agiworkforce';
const CLI = REPO + '/apps/cli';
const ART = CLI + '/docs/parity';

// External Claude reference checkout. Not part of this repo, so its location is
// machine-specific: resolve from --claudeRef / AGI_CLAUDE_REFERENCE first, then
// fall back to the original author's layout. The reference line in GROUND is
// only emitted when the path actually exists (see CLAUDE_REF_NOTE below) so the
// harness does not point agents at a non-existent tree on other machines.
const CLAUDE_REF =
  (args && args.claudeRef) ||
  (typeof process !== 'undefined' && process.env && process.env.AGI_CLAUDE_REFERENCE) ||
  '/Users/siddhartha/Desktop/claude_reference/src';

// Best-effort synchronous existence check. If the fs module is unavailable in
// the harness sandbox, treat the reference as present (preserving prior
// behavior) rather than silently dropping it.
let CLAUDE_REF_EXISTS = true;
try {
  const { existsSync } = await import('node:fs');
  CLAUDE_REF_EXISTS = existsSync(CLAUDE_REF);
} catch (_e) {
  CLAUDE_REF_EXISTS = true;
}
const CLAUDE_REF_NOTE = CLAUDE_REF_EXISTS ? ', and the Claude reference at ' + CLAUDE_REF : '';

const GROUND =
  ' GROUND every claim in real code: Read AGI files under ' +
  CLI +
  '/src (tui/tui_app.rs, tui/widgets/*, agent/*, auth.rs, auth_oauth.rs, command_registry*, runtime/*) and the reference CLIs at ' +
  REPO +
  '/reference/codex-cli/codex-rs/tui, ' +
  REPO +
  '/reference/gemini-cli/packages/cli/src/ui, ' +
  REPO +
  '/reference/opencode' +
  CLAUDE_REF_NOTE +
  '. Cite file:line. Do not trust training data. date_accessed=' +
  DATE +
  '. The migrant is an existing Claude Code / Codex CLI / Gemini CLI user; friction = anything that breaks muscle memory or hides AGI value. Key differentiator to surface well: users can run LOCAL on-device LLMs, bring their own keys (BYOK), OR use a cloud subscription - SEPARATE trust boundaries, never silently route between them. Your final message IS the structured result.';

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['surface', 'findings'],
  properties: {
    surface: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'migrant_friction',
          'agi_current_state',
          'reference_pattern',
          'recommendation',
          'impact',
          'effort',
          'touches_access_modes',
        ],
        properties: {
          title: { type: 'string' },
          migrant_friction: { type: 'string' },
          agi_current_state: { type: 'string' },
          reference_pattern: { type: 'string' },
          recommendation: { type: 'string' },
          impact: { type: 'string', enum: ['p0', 'p1', 'p2', 'p3'] },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          touches_access_modes: { type: 'boolean' },
        },
      },
    },
  },
};

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'is_real',
    'current_state_accurate',
    'buildable',
    'confidence',
    'corrected_impact',
    'notes',
  ],
  properties: {
    title: { type: 'string' },
    is_real: { type: 'boolean' },
    current_state_accurate: { type: 'boolean' },
    buildable: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    corrected_impact: { type: 'string', enum: ['p0', 'p1', 'p2', 'p3', 'not-a-gap'] },
    notes: { type: 'string' },
  },
};

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['item', 'files_to_touch', 'approach', 'test_plan', 'risk'],
  properties: {
    item: { type: 'string' },
    files_to_touch: { type: 'array', items: { type: 'string' } },
    approach: { type: 'string' },
    test_plan: { type: 'string' },
    risk: { type: 'string' },
  },
};

const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['artifact_path', 'summary', 'top_build_items'],
  properties: {
    artifact_path: { type: 'string' },
    summary: { type: 'string' },
    top_build_items: { type: 'array', items: { type: 'string' } },
  },
};

const DIMENSIONS = [
  {
    key: 'access-modes',
    prompt:
      'AUDIT the MODEL & PROVIDER selection as a migrant first touchpoint, focused on the LOCAL / BYOK / CLOUD value prop. AGI today: tui/widgets/model_picker.rs groups by PROVIDER (ProviderHeader rows, "13+ providers" badge), NOT by access mode. A migrant from Claude Code/Codex cannot immediately see "I can run local, use my own key, or a cloud subscription." Examine model_picker.rs, auth.rs/auth_oauth.rs, runtime provider metadata, models.json. Recommend surfacing Local(on-device)/BYOK/Cloud as first-class, clearly-separated groups (respecting trust boundaries) with obvious onboarding. Highest-priority surface.' +
      GROUND,
  },
  {
    key: 'first-run',
    prompt:
      'AUDIT first-run / onboarding / welcome. Does a brand-new AGI user get a clear welcome, a hint of what to type, how to pick a model/provider, and where local/BYOK/cloud setup lives? Compare to Claude Code/Codex/Gemini first-run. Recommend a concrete welcome/onboarding flow.' +
      GROUND,
  },
  {
    key: 'composer',
    prompt:
      'AUDIT the input COMPOSER vs Codex chat_composer / Gemini InputPrompt / Claude input: multiline, @file refs, history, history-search, slash popup, paste handling, queued-input-while-running. AGI today: tui_app.rs uses a simple input string + show_slash_popup. Find parity gaps that break muscle memory.' +
      GROUND,
  },
  {
    key: 'slash',
    prompt:
      'AUDIT SLASH COMMAND parity. Enumerate what AGI handles in tui_app.rs handle_slash + command_registry vs the giants. Which expected commands are missing or behave differently (open a panel vs print text)? Recommend the parity set + popup UX.' +
      GROUND,
  },
  {
    key: 'keybindings',
    prompt:
      'AUDIT KEYBINDINGS / navigation muscle memory (interactive.rs KeyAction + tui_app handle_key). Enter/Shift+Enter, Esc, Ctrl+C, Up/Down history, Ctrl+R, Tab, Shift+Tab mode cycle, scroll. Where does AGI differ from the giants in a way that trips a migrant?' +
      GROUND,
  },
  {
    key: 'approvals',
    prompt:
      'AUDIT the tool-APPROVAL UX (just rebuilt: tui/approval_broker.rs + run_tui_approval_modal in tui_app.rs + widgets/approval_overlay.rs). Does it feel as good as Codex approval_overlay / Claude permission prompts? Gaps: per-mode behavior, allow-session vs always, diff preview, narrow-terminal. Recommend polish.' +
      GROUND,
  },
  {
    key: 'transcript',
    prompt:
      'AUDIT how TOOL CALLS and assistant output RENDER (tui_app render_chat + ChatMessage; new transcript_cell.rs contract is unused). A migrant expects Codex/Gemini-class tool timelines (exec cells, diffs, status). AGI renders flat text. Recommend the minimum to feel modern.' +
      GROUND,
  },
  {
    key: 'panels',
    prompt:
      'AUDIT product PANELS (/mcp /tasks /usage /sessions /models /settings /permissions). Which are interactive vs static text dumps (screen_renderers.rs)? Recommend which to make interactive first for migration comfort.' +
      GROUND,
  },
  {
    key: 'status-footer',
    prompt:
      'AUDIT the STATUS BAR / footer (tui_app render_status_bar + cost_hud.rs). Can a migrant see at a glance: model, provider, ACCESS MODE (local/BYOK/cloud), mode, sandbox, branch, cost, tokens? Recommend the chip set and especially an access-mode indicator.' +
      GROUND,
  },
  {
    key: 'help-discovery',
    prompt:
      'AUDIT HELP & discoverability: /help, inline hints, the "what can I do" moment. Compare to the giants. Recommend a help panel + inline affordances.' +
      GROUND,
  },
  {
    key: 'onramp',
    prompt:
      'AUDIT the MIGRATION ON-RAMP: can a Claude Code / Codex user import or reuse config, MCP servers, .claude/.codex settings, command muscle memory, or auth? Recommend concrete on-ramp features (config import, command aliases, a "coming from X?" hint) that lower switching cost.' +
      GROUND,
  },
  {
    key: 'auth-setup',
    prompt:
      'AUDIT the AUTH / key-setup flow for the THREE access modes. How does a user set up a local model (download/select), a BYOK key (which providers, where stored, secret scan), and a cloud subscription/login (auth.rs/auth_oauth.rs, /login)? Where is it confusing or hidden? Recommend a clear guided setup per mode that respects trust boundaries.' +
      GROUND,
  },
];

phase('Audit');
const audits = (
  await parallel(
    DIMENSIONS.map(
      (d) => () =>
        agent(d.prompt, { label: 'audit:' + d.key, phase: 'Audit', schema: AUDIT_SCHEMA }).then(
          (r) => (r ? { key: d.key, surface: r.surface, findings: r.findings || [] } : null),
        ),
    ),
  )
).filter(Boolean);

const all = [];
for (const a of audits) for (const f of a.findings) all.push(Object.assign({}, f, { key: a.key }));
const serious = all.filter((f) => f.impact === 'p0' || f.impact === 'p1');
log(
  'audit: ' +
    audits.length +
    '/' +
    DIMENSIONS.length +
    ' dimensions, ' +
    all.length +
    ' findings, ' +
    serious.length +
    ' P0/P1 to verify',
);

phase('Verify');
const verdicts = (
  await parallel(
    serious.map(
      (f) => () =>
        agent(
          'Independently verify this claimed migration-UX gap in the AGI CLI. Do NOT trust the claim - re-derive against real code at ' +
            CLI +
            ' (Read + grep) and the reference CLIs. Claim: "' +
            f.title +
            '" [' +
            f.impact +
            '/' +
            f.effort +
            ', surface=' +
            f.key +
            ']. Stated AGI current state: ' +
            f.agi_current_state +
            '. Recommendation: ' +
            f.recommendation +
            '. Confirm is_real, whether the current-state file:line is accurate, whether the fix is buildable now, and corrected_impact.',
          { label: 'verify:' + f.key, phase: 'Verify', schema: VERIFY_SCHEMA },
        ).then((v) => (v ? Object.assign({}, f, { verdict: v }) : null)),
    ),
  )
).filter(Boolean);

const confirmed = verdicts
  .filter(
    (f) => f.verdict.is_real && f.verdict.buildable && f.verdict.corrected_impact !== 'not-a-gap',
  )
  .sort((a, b) => (a.verdict.corrected_impact > b.verdict.corrected_impact ? 1 : -1));
log('verified: ' + confirmed.length + ' real+buildable gaps');

phase('Spec');
const top = confirmed.slice(0, 6);
const specs = (
  await parallel(
    top.map(
      (f) => () =>
        agent(
          'Produce a concrete Rust/Ratatui BUILD SPEC for this verified AGI CLI migration-UX improvement so an engineer can implement it directly. Item: "' +
            f.title +
            '" (surface ' +
            f.key +
            '). Recommendation: ' +
            f.recommendation +
            '. Current state: ' +
            f.agi_current_state +
            '. Read the real files at ' +
            CLI +
            '/src first. Give exact files_to_touch, the approach (structs/enums/render/key-handling/wiring, keeping existing CLI compatibility and trust boundaries), a test_plan, and the main risk.',
          { label: 'spec:' + f.key, phase: 'Spec', schema: SPEC_SCHEMA },
        ),
    ),
  )
).filter(Boolean);

const planPath = ART + '/migration-ux-plan.md';
const compact = confirmed
  .map(
    (f) =>
      '- [' +
      f.verdict.corrected_impact +
      '/' +
      f.effort +
      (f.touches_access_modes ? '/access-mode' : '') +
      '] ' +
      f.title +
      ' (' +
      f.key +
      ') -> ' +
      f.recommendation,
  )
  .join('\n');
const specBlock = specs
  .map(
    (s) =>
      '### ' +
      s.item +
      '\nFiles: ' +
      (s.files_to_touch || []).join(', ') +
      '\nApproach: ' +
      s.approach +
      '\nTests: ' +
      s.test_plan +
      '\nRisk: ' +
      s.risk,
  )
  .join('\n\n')
  .slice(0, 24000);

const synthPrompt =
  'You are the migration-UX lead for the AGI CLI (Rust/Ratatui). Goal: an existing Claude Code/Codex/Gemini user migrates comfortably, and the Local/BYOK/Cloud differentiator is obvious. Below are VERIFIED, buildable gaps and concrete build specs.\n\nVERIFIED GAPS:\n' +
  compact +
  '\n\nBUILD SPECS:\n' +
  specBlock +
  '\n\nWrite ' +
  planPath +
  ' with the Write tool: (1) Migration thesis, (2) Prioritized roadmap table (P0 first, with effort + whether it touches access-modes), (3) The top 5-6 build specs verbatim, (4) Sequencing for a single engineer. Keep existing CLI compatibility and trust boundaries. Then return artifact_path, a 3-sentence summary, and the ordered top 5 build items.';

const synth = await agent(synthPrompt, {
  label: 'synth:migration-plan',
  phase: 'Spec',
  schema: SYNTH_SCHEMA,
});

return {
  dimensions: audits.length,
  total_findings: all.length,
  verified_buildable: confirmed.length,
  plan: synth ? synth.artifact_path : null,
  top_build_items: synth ? synth.top_build_items : [],
  specs,
};
