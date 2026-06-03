export const meta = {
  name: 'agi-cli-parity-1000',
  description:
    'AGI CLI parity: 1000 Opus-4.8-1M agent jobs (990 read-only research/audit/design/verify workers + 10 synthesis), 16 concurrent, model inherited (no downshift/fallback)',
  phases: [
    { title: 'Approval', detail: 'adversarial verification of the landed TUI approval wiring' },
    { title: 'RefStudy', detail: 'reference CLIs (Claude/Codex/Gemini/OpenCode) architecture map' },
    { title: 'AGIAudit', detail: 'per-file audit of AGI TUI/tool/agent surface' },
    { title: 'Panels', detail: 'interactive panel designs for every product workflow' },
    { title: 'Cells', detail: 'structured transcript cell designs' },
    { title: 'Composer', detail: 'modern composer feature designs' },
    { title: 'Snapshots', detail: 'snapshot/test matrix across widths' },
    { title: 'Research', detail: 'cited current-docs research (web/MCP/Context7)' },
    { title: 'Security', detail: 'permission/trust/approval-bypass audit' },
    { title: 'Keybindings', detail: 'keybinding & navigation parity' },
    { title: 'ToolCells', detail: 'per-tool cell rendering designs' },
    { title: 'MCP', detail: 'MCP spec + elicitation/resources requirements' },
    { title: 'EdgeCases', detail: 'edge-case & stress behavior specs' },
    { title: 'TerminalCompat', detail: 'terminal-compatibility matrix' },
    { title: 'Chips', detail: 'status/footer chip designs' },
    { title: 'SlashParity', detail: 'slash-command parity specs' },
    { title: 'Settings', detail: 'settings-field designs' },
    { title: 'Synthesize', detail: '10 agents write consolidated parity artifacts to disk' },
  ],
};

const DATE = (args && args.date) || '2026-06-01';
const REPO = '/Users/siddhartha/Desktop/agiworkforce';
const ART = REPO + '/apps/cli/docs/parity';

const CITE =
  ' Cite every factual claim with an absolute local path or a URL plus date_accessed=' +
  DATE +
  '. Do not trust training data; verify against local reference source and/or current official docs (use ToolSearch to load WebSearch/WebFetch/context7 for current docs). Be terse: headline <=140 chars, findings 3-6 sentences, <=4 citations, <=3 recommendations. Your final message IS the structured result.';

const FINDING = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'findings', 'citations', 'recommendations', 'priority'],
  properties: {
    headline: { type: 'string' },
    findings: { type: 'string' },
    citations: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
    priority: { type: 'string', enum: ['p0', 'p1', 'p2', 'p3', 'info'] },
  },
};

const SYNTH = {
  type: 'object',
  additionalProperties: false,
  required: ['artifact_path', 'summary', 'top_actions'],
  properties: {
    artifact_path: { type: 'string' },
    summary: { type: 'string' },
    top_actions: { type: 'array', items: { type: 'string' } },
  },
};

const J = (phase, label, prompt) => ({ phase, label, prompt });
const cross = (a, b, fn) => a.flatMap((x) => b.map((y) => fn(x, y)));

// ---- Phase: Approval (12) --------------------------------------------------
const APPROVAL_CTX =
  ' Review the landed change that makes TUI tool-approval non-blocking. At ' +
  REPO +
  ', run: git -C ' +
  REPO +
  ' diff -- apps/cli/src/tui/approval_broker.rs apps/cli/src/tui/tui_app.rs apps/cli/src/features/exec/tools/bash.rs apps/cli/src/features/exec/tools/file_ops.rs , and Read the functions send_message, run_tui_approval_modal, approval_choice_to_decision, and ApprovalBroker. Ground findings in file:line + quoted code.';
const approvalJobs = [
  J(
    'Approval',
    'approval:deadlock',
    'LENS deadlock/cancellation-safety.' +
      APPROVAL_CTX +
      ' Can the tokio::select! loop deadlock or strand a queued approval? Is biased ordering correct? Can the turn future finish with an unresolved waiter?' +
      CITE,
  ),
  J(
    'Approval',
    'approval:security',
    'LENS approval-bypass.' +
      APPROVAL_CTX +
      ' Any path where a tool runs without an allowing decision? Deny/Cancel must block disk/exec. Check deny_all latch race and tools that skip the callback.' +
      CITE,
  ),
  J(
    'Approval',
    'approval:regression',
    'LENS non-TUI regression.' +
      APPROVAL_CTX +
      ' Confirm REPL/headless/app_server/MCP-server keep on_tool_approval=None and dialoguer fallback. Grep other AgentSession::send callers.' +
      CITE,
  ),
  J(
    'Approval',
    'approval:borrow',
    'LENS borrow/async soundness.' +
      APPROVAL_CTX +
      ' send_fut holds &mut app.session; confirm nothing in the loop/modal touches app, pin usage is sound, callback Send/Sync bounds hold, no panicking unwraps.' +
      CITE,
  ),
  J(
    'Approval',
    'approval:lost-wakeup',
    'LENS Notify lost-wakeup.' +
      APPROVAL_CTX +
      ' notify_one stores one permit; with concurrent tool requests can a request be enqueued but never drained? Does the inner while-drain make coalescing harmless? Give a concrete interleaving or prove none.' +
      CITE,
  ),
  J(
    'Approval',
    'approval:completeness',
    'LENS test completeness.' +
      APPROVAL_CTX +
      ' Which decision paths lack a behavioral test (AllowOnce runs, AlwaysAllow persists to PermissionStore, DenyAll latches, FIFO multi-request)? Sketch minimal tokio tests asserting observable behavior.' +
      CITE,
  ),
  J(
    'Approval',
    'approval:deny-all-e2e',
    'Verify end-to-end that DenyAll resolves the current request AND auto-cancels subsequent requests this turn without prompting.' +
      APPROVAL_CTX +
      CITE,
  ),
  J(
    'Approval',
    'approval:allow-once-runs',
    'Verify AllowOnce actually executes the tool (write reaches disk) when require_confirmation=true.' +
      APPROVAL_CTX +
      CITE,
  ),
  J(
    'Approval',
    'approval:always-persist',
    'Verify AlwaysAllow records in PermissionStore so the next identical request skips the prompt (perms.check_command path in bash.rs).' +
      APPROVAL_CTX +
      CITE,
  ),
  J(
    'Approval',
    'approval:modal-render',
    'Review run_tui_approval_modal rendering: does it look correct at 60/80/120 cols, and does the blank backdrop (Clear over the chat) degrade UX? Compare to Codex approval_overlay.' +
      APPROVAL_CTX +
      CITE,
  ),
  J(
    'Approval',
    'approval:notify-semantics',
    'Audit ApprovalBroker Notify permit semantics and deny_all flag for correctness under the current_thread tokio test runtime and multi-thread runtime.' +
      APPROVAL_CTX +
      CITE,
  ),
  J(
    'Approval',
    'approval:queued-test',
    'Design an integration test that queues two approvals (two parallel tools), resolves them through the modal FIFO, and asserts both tools observe their decisions.' +
      APPROVAL_CTX +
      CITE,
  ),
];

// ---- Phase: RefStudy (72) --------------------------------------------------
const REF = [
  ['claude-ink-ui', '/Users/siddhartha/Desktop/claude_reference/src'],
  ['codex-tui', '/Users/siddhartha/Desktop/reference/codex-cli/codex-rs/tui/src'],
  [
    'codex-bottom-pane',
    '/Users/siddhartha/Desktop/reference/codex-cli/codex-rs/tui/src/bottom_pane',
  ],
  ['codex-history-cells', '/Users/siddhartha/Desktop/reference/codex-cli/codex-rs/tui/src'],
  ['gemini-ui', '/Users/siddhartha/Desktop/reference/gemini-cli/packages/cli/src/ui'],
  ['gemini-messages', '/Users/siddhartha/Desktop/reference/gemini-cli/packages/cli/src/ui'],
  [
    'opencode-tui',
    '/Users/siddhartha/Desktop/reference/opencode/packages/opencode/src/cli/cmd/tui',
  ],
  [
    'opencode-prompt',
    '/Users/siddhartha/Desktop/reference/opencode/packages/opencode/src/cli/cmd/tui',
  ],
];
const REF_FACETS = [
  'module layout & architecture',
  'event loop / frame scheduling / redraw coalescing',
  'input & composer',
  'approvals & permissions UX',
  'transcript & tool-call rendering',
  'dialogs / panels / settings',
  'keybindings & navigation',
  'empty / error / loading states',
  'paste / resize / narrow-terminal handling',
];
const refJobs = cross(REF, REF_FACETS, (r, f) =>
  J(
    'RefStudy',
    'ref:' + r[0] + ':' + f.slice(0, 14),
    'Study ' +
      f +
      ' in the reference at ' +
      r[1] +
      " (enumerate + Read the relevant files). Extract concrete patterns AGI's Rust/Ratatui CLI should adopt and explicitly note what NOT to copy (proprietary prompts/UI copy)." +
      CITE,
  ),
);

// ---- Phase: AGIAudit (80) --------------------------------------------------
const AGI = [
  ['tui_app', 'apps/cli/src/tui/tui_app.rs'],
  ['w-command_popup', 'apps/cli/src/tui/widgets/command_popup.rs'],
  ['w-model_picker', 'apps/cli/src/tui/widgets/model_picker.rs'],
  ['w-agent_picker', 'apps/cli/src/tui/widgets/agent_picker.rs'],
  ['w-effort_picker', 'apps/cli/src/tui/widgets/effort_picker.rs'],
  ['w-theme_picker', 'apps/cli/src/tui/widgets/theme_picker.rs'],
  ['w-diff_review', 'apps/cli/src/tui/widgets/diff_review.rs'],
  ['w-elicitation_overlay', 'apps/cli/src/tui/widgets/elicitation_overlay.rs'],
  ['w-skills_toggle', 'apps/cli/src/tui/widgets/skills_toggle.rs'],
  ['w-memories_settings', 'apps/cli/src/tui/widgets/memories_settings.rs'],
  ['w-statusline_setup', 'apps/cli/src/tui/widgets/statusline_setup.rs'],
  ['w-terminal_title_setup', 'apps/cli/src/tui/widgets/terminal_title_setup.rs'],
  ['w-list_selection_view', 'apps/cli/src/tui/widgets/list_selection_view.rs'],
  ['w-screen_renderers', 'apps/cli/src/tui/widgets/screen_renderers.rs'],
  ['w-interactive', 'apps/cli/src/tui/widgets/interactive.rs'],
  ['w-approval_overlay', 'apps/cli/src/tui/widgets/approval_overlay.rs'],
  ['tools-mod', 'apps/cli/src/features/exec/tools/mod.rs'],
  ['tools-task_registry', 'apps/cli/src/features/exec/tools/task_registry.rs'],
  ['agent-chat', 'apps/cli/src/agent/chat.rs'],
  ['agent-mod', 'apps/cli/src/agent/mod.rs'],
];
const AUDIT_FACETS = [
  'current behavior & responsibilities',
  'parity gaps vs reference CLIs',
  'blocking-prompt / dialoguer / eprintln sites that break the alternate screen',
  'test & snapshot coverage gaps',
];
const agiJobs = cross(AGI, AUDIT_FACETS, (a, f) =>
  J(
    'AGIAudit',
    'agi:' + a[0] + ':' + f.slice(0, 12),
    'Audit ' +
      f +
      ' for ' +
      REPO +
      '/' +
      a[1] +
      ' (Read it). Be specific with file:line. Recommend concrete parity improvements that keep existing CLI compatibility.' +
      CITE,
  ),
);

// ---- Phase: Panels (108) ---------------------------------------------------
const PANELS = [
  '/mcp',
  '/tasks',
  '/usage',
  '/plugins',
  '/marketplace',
  '/skills',
  '/agents',
  '/sessions',
  '/permissions',
  '/hooks',
  '/memory',
  '/models',
  '/settings',
  '/auth',
  '/sandbox',
  '/history',
  '/resume',
  '/fork',
];
const PANEL_FACETS = [
  'layout (tabs / list / detail pane)',
  'keyboard navigation & shortcuts',
  'search / filter',
  'action row & side actions',
  'empty / error / loading states',
  'narrow-terminal (60-col) behavior',
];
const panelJobs = cross(PANELS, PANEL_FACETS, (p, f) =>
  J(
    'Panels',
    'panel:' + p.slice(1) + ':' + f.slice(0, 10),
    'Design the ' +
      f +
      ' for the AGI TUI ' +
      p +
      ' panel. Reference Codex/Gemini/OpenCode panel UX + AGI screen_renderers.rs current data. Output a concrete PaneView-compatible spec (fields, key map, states).' +
      CITE,
  ),
);

// ---- Phase: Cells (65) -----------------------------------------------------
const CELLS = [
  'UserCell',
  'AssistantCell',
  'ReasoningCell',
  'ExecCell',
  'ToolCell',
  'PatchCell',
  'ApprovalCell',
  'TaskCell',
  'SubagentCell',
  'WarningCell',
  'ErrorCell',
  'SystemNoticeCell',
  'PlanCell',
];
const CELL_FACETS = [
  'data contract & fields',
  'streaming deltas into the active cell',
  'compact vs expanded rendering',
  'status / state transitions',
  'snapshot spec @ 80 cols',
];
const cellJobs = cross(CELLS, CELL_FACETS, (c, f) =>
  J(
    'Cells',
    'cell:' + c + ':' + f.slice(0, 10),
    'Design ' +
      f +
      ' for AGI ' +
      c +
      ', building on apps/cli/src/tui/transcript_cell.rs. Reference Codex history_cell.rs/exec_cell + Gemini ToolGroupMessage. Output a concrete TranscriptCell-trait spec.' +
      CITE,
  ),
);

// ---- Phase: Composer (48) --------------------------------------------------
const COMPOSER = [
  'multiline editing',
  'history up/down',
  'history search (ctrl-r)',
  'slash-command popup',
  '@file references',
  'skill mentions',
  'plugin mentions',
  'paste burst handling',
  'queued input while agent runs',
  'external editor flow',
  'cursor & word movement',
  'kill/yank',
  'placeholder & hints',
  'submit vs newline',
  'mode indicator',
  'token/char counter',
];
const COMP_FACETS = [
  'design vs Codex chat_composer / Gemini InputPrompt',
  'AGI integration with the existing command registry',
  'test/snapshot spec',
];
const composerJobs = cross(COMPOSER, COMP_FACETS, (c, f) =>
  J(
    'Composer',
    'comp:' + c.slice(0, 12) + ':' + f.slice(0, 8),
    'For an AGI ChatComposer, specify ' +
      c +
      ' — ' +
      f +
      ". Keep AGI's Rust/Ratatui identity and existing CommandRegistry." +
      CITE,
  ),
);

// ---- Phase: Snapshots (96) -------------------------------------------------
const VIEWS = [
  'idle composer',
  'streaming response',
  'slash popup',
  'file search popup',
  'history search',
  'approval overlay',
  'deny-all confirm',
  'model picker',
  'agent picker',
  'effort picker',
  'theme picker',
  'diff review',
  'exec tool cell',
  'patch cell',
  'task panel',
  'mcp panel',
  'sessions panel',
  'permissions panel',
  'usage panel',
  'settings panel',
  'error banner',
  'plan-mode banner',
  'footer chips',
  'narrow layout',
];
const WIDTHS = ['60', '80', '120', '160'];
const snapJobs = cross(VIEWS, WIDTHS, (v, w) =>
  J(
    'Snapshots',
    'snap:' + v.slice(0, 12) + ':' + w,
    'Specify the snapshot test for the AGI TUI "' +
      v +
      '" view at ' +
      w +
      ' columns: what must render, expected layout, and edge truncation. Reference codex-rs/tui snapshots + AGI snapshot_smoke.rs. Give an insta/vt100-style assertion outline.' +
      CITE,
  ),
);

// ---- Phase: Research (96) --------------------------------------------------
const SUBSYS = [
  'Claude Code permissions',
  'Claude Code slash commands',
  'Claude Code subagents/Task',
  'Claude Code MCP',
  'Codex CLI approvals',
  'Codex CLI composer',
  'Codex CLI history cells',
  'Gemini CLI dialogs',
  'Gemini CLI tool messages',
  'OpenCode TUI',
  'OpenCode plugins',
  'MCP spec elicitation',
  'Ratatui current API',
  'Crossterm events/paste',
  'Tokio select/cancellation',
  'public UX complaints',
];
const QUESTIONS = [
  'current official behavior & exact API/flags',
  'changes since early 2025',
  'known bugs / open issues',
  'UX best practices',
  'accessibility / terminal compat',
  'what AGI must match or deliberately avoid',
];
const researchJobs = cross(SUBSYS, QUESTIONS, (s, q) =>
  J(
    'Research',
    'rsx:' + s.slice(0, 12) + ':' + q.slice(0, 8),
    'Research ' +
      s +
      ': ' +
      q +
      '. Prefer official docs + source; secondary sources only for UX sentiment.' +
      CITE,
  ),
);

// ---- Phase: Security (44) --------------------------------------------------
const SEC = [
  'run_command approval',
  'write_file approval',
  'edit_file approval',
  'multiedit approval',
  'apply_patch approval',
  'notebook_edit approval gap',
  'task_registry input prompt',
  'MCP tool elicitation',
  'deny-all latch race',
  'permission store persistence',
  'plan-mode tool gating',
  'bypass-permissions mode',
  'full-auto mode',
  'sandbox enforcement',
  'trust-directory prompt',
  'path validation outside cwd',
  'secret redaction in transcript',
  'BYOK vs local routing in CLI',
  'app_server approval path',
  'headless auto-approve',
  'allowed/disallowed tools filter',
  'hook command injection',
];
const SEC_FACETS = [
  'can a tool execute without an allowing decision? trace the exact code path',
  'what hardening or test is missing',
];
const secJobs = cross(SEC, SEC_FACETS, (s, f) =>
  J(
    'Security',
    'sec:' + s.slice(0, 14) + ':' + f.slice(0, 6),
    'Security audit of "' +
      s +
      '" in the AGI CLI: ' +
      f +
      '. Read the real code under apps/cli/src. Trust boundaries: Local vs BYOK vs Managed are separate; never silently route.' +
      CITE,
  ),
);

// ---- Phase: Keybindings (84) -----------------------------------------------
const KEYS = [
  'Enter submit',
  'Shift+Enter newline',
  'Esc cancel',
  'Ctrl+C interrupt',
  'Ctrl+D eof',
  'Up/Down history',
  'Ctrl+R search',
  'Tab complete',
  'Shift+Tab mode cycle',
  'PageUp/Down scroll',
  'Home/End',
  'Ctrl+L clear',
  'Ctrl+U kill line',
  'Ctrl+W kill word',
  'Alt+Enter',
  '@ file ref',
  '/ slash',
  '! bash',
  'arrow nav lists',
  'Enter select',
  'Space toggle',
  'q quit panel',
  '? help',
  'g/G top/bottom',
  'j/k vim',
  'Ctrl+T transcript',
  'Ctrl+O expand',
  'Ctrl+B background',
];
const CLIS = ['Claude Code', 'Codex CLI', 'Gemini CLI'];
const keyJobs = cross(KEYS, CLIS, (k, c) =>
  J(
    'Keybindings',
    'key:' + k.slice(0, 12) + ':' + c.slice(0, 6),
    'Compare the "' +
      k +
      '" keybinding/behavior in ' +
      c +
      " and recommend AGI's mapping (KeyAction in interactive.rs). Note conflicts and discoverability." +
      CITE,
  ),
);

// ---- Phase: ToolCells (66) -------------------------------------------------
const TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'multiedit',
  'apply_patch',
  'run_command',
  'search_files',
  'grep_files',
  'glob',
  'list_directory',
  'web_search',
  'web_fetch',
  'tool_search',
  'batch',
  'notebook_edit',
  'todo_read',
  'todo_write',
  'update_plan',
  'subagent_spawn',
  'task',
  'mcp_tool',
  'powershell',
];
const TC_FACETS = [
  'compact one-line rendering',
  'expanded output rendering',
  'error/failed rendering',
];
const toolCellJobs = cross(TOOLS, TC_FACETS, (t, f) =>
  J(
    'ToolCells',
    'tc:' + t + ':' + f.slice(0, 8),
    'Design the ' +
      f +
      ' of the AGI ToolCell for the "' +
      t +
      '" tool. Reference Codex exec_cell + Gemini ToolGroupMessage. Specify icon, header, body, status, and truncation.' +
      CITE,
  ),
);

// ---- Phase: MCP (42) -------------------------------------------------------
const MCP = [
  'server config & discovery',
  'tool namespacing mcp__server__tool',
  'resources list/read',
  'prompts list/expand',
  'elicitation request UI',
  'sampling',
  'roots',
  'progress notifications',
  'tool approval for MCP',
  'connection lifecycle / errors',
  'stdio vs http transport',
  'oauth/auth for MCP',
  '/mcp panel data',
  'capability negotiation',
];
const MCP_FACETS = [
  'current spec behavior (cite the spec)',
  'reference implementation (codex/claude)',
  'AGI gap & required TUI element',
];
const mcpJobs = cross(MCP, MCP_FACETS, (m, f) =>
  J(
    'MCP',
    'mcp:' + m.slice(0, 12) + ':' + f.slice(0, 8),
    'MCP aspect "' +
      m +
      '": ' +
      f +
      '. Verify against the current Model Context Protocol spec at modelcontextprotocol.io. Map to AGI src/mcp + elicitation_overlay.rs.' +
      CITE,
  ),
);

// ---- Phase: EdgeCases (68) -------------------------------------------------
const SCEN = [
  'empty input submit',
  'very long single line',
  '10k-line tool output',
  'rapid paste burst',
  'terminal resize mid-stream',
  'window focus loss',
  'ctrl-c during tool',
  'ctrl-c during approval',
  'approval while streaming',
  'multiple parallel approvals',
  'network error mid-turn',
  'provider fallback rotation',
  'model switch mid-session',
  'session resume with tools',
  'fork session',
  'compact context',
  'huge file diff',
  'binary file write',
  'denied then retry',
  'always-allow then new command',
  'unicode/emoji width',
  'RTL text',
  'ANSI in tool output',
  'tmux passthrough',
  'no-color terminal',
  'very narrow 40 col',
  'very wide 200 col',
  'slow provider',
  'rate limit',
  'token budget exhausted',
  'plan-mode write attempt',
  'sandbox denied command',
  'MCP server crash',
  'hook failure',
];
const EDGE_FACETS = ['expected behavior (per reference CLIs)', 'current AGI behavior & gap'];
const edgeJobs = cross(SCEN, EDGE_FACETS, (s, f) =>
  J(
    'EdgeCases',
    'edge:' + s.slice(0, 14) + ':' + f.slice(0, 6),
    'Edge case "' +
      s +
      '": ' +
      f +
      ' for the AGI TUI. Recommend the correct handling and a test.' +
      CITE,
  ),
);

// ---- Phase: TerminalCompat (48) --------------------------------------------
const TERMS = [
  'Terminal.app',
  'iTerm2',
  'VS Code terminal',
  'tmux',
  'Alacritty',
  'Kitty',
  'Windows Terminal',
  'GNOME Terminal',
  'Warp',
  'SSH session',
  'CI non-tty',
  'GNU screen',
];
const TERM_FACETS = [
  'bracketed paste support',
  'focus/resize events',
  'truecolor vs 256 vs 16 color',
  'keyboard enhancement flags',
];
const termJobs = cross(TERMS, TERM_FACETS, (t, f) =>
  J(
    'TerminalCompat',
    'term:' + t.slice(0, 10) + ':' + f.slice(0, 8),
    'Terminal "' +
      t +
      '": ' +
      f +
      '. What must AGI detect/handle (crossterm capabilities)? Cite crossterm/ratatui docs.' +
      CITE,
  ),
);

// ---- Phase: Chips (36) -----------------------------------------------------
const CHIPS = [
  'model',
  'provider',
  'mode',
  'sandbox',
  'git branch',
  'cost',
  'tokens in',
  'tokens out',
  'context %',
  'cache read',
  'reasoning tokens',
  'tasks running',
  'MCP servers',
  'plan-mode',
  'fallback active',
  'queued input',
  'elapsed time',
  'session name',
];
const CHIP_FACETS = ['format & design', 'data source & update trigger'];
const chipJobs = cross(CHIPS, CHIP_FACETS, (c, f) =>
  J(
    'Chips',
    'chip:' + c.slice(0, 10) + ':' + f.slice(0, 8),
    'Status/footer chip "' +
      c +
      '": ' +
      f +
      ' for the AGI TUI status bar. Reference Codex footer + AGI render_status_bar/cost_hud.rs.' +
      CITE,
  ),
);

// ---- Phase: SlashParity (45) -----------------------------------------------
const SLASH = [
  '/help',
  '/model',
  '/agents',
  '/mcp',
  '/tasks',
  '/usage',
  '/plugins',
  '/marketplace',
  '/skills',
  '/sessions',
  '/permissions',
  '/hooks',
  '/memory',
  '/settings',
  '/auth',
  '/sandbox',
  '/history',
  '/resume',
  '/fork',
  '/clear',
  '/compact',
  '/save',
  '/load',
  '/branch',
  '/export',
  '/rewind',
  '/cost',
  '/status',
  '/login',
  '/logout',
  '/theme',
  '/effort',
  '/quit',
  '/fast',
  '/output-style',
  '/init',
  '/review',
  '/security-review',
  '/vim',
  '/terminal-setup',
  '/statusline',
  '/add-dir',
  '/config',
  '/doctor',
  '/bug',
];
const slashJobs = SLASH.map((s) =>
  J(
    'SlashParity',
    'slash:' + s.slice(1),
    'Specify AGI TUI behavior for ' +
      s +
      ': should it open an interactive panel or print text? Compare to Claude Code/Codex/Gemini. Note current AGI handling in tui_app.rs handle_slash and recommend the panel/flow.' +
      CITE,
  ),
);

// ---- Phase: Settings (34) --------------------------------------------------
const SETTINGS = [
  'approval mode',
  'sandbox backend',
  'default model',
  'default provider',
  'theme',
  'terminal title',
  'notifications',
  'memory enabled',
  'git integration',
  'MCP servers',
  'plugins enabled',
  'skills enabled',
  'keybindings',
  'auto-compact threshold',
  'context window',
  'fallback chain',
  'output style',
  'effort level',
  'telemetry',
  'tool filters',
  'allowed dirs',
  'trust prompt',
  'paste-to-file threshold',
  'spinner style',
  'color mode',
  'timestamp display',
  'cost display',
  'token display',
  'vim mode',
  'line numbers',
  'word wrap',
  'scrollback limit',
  'auto-save',
  'session naming',
];
const settingsJobs = SETTINGS.map((s) =>
  J(
    'Settings',
    'set:' + s.slice(0, 16),
    'Design the AGI TUI settings field "' +
      s +
      '": control type, allowed values, default, persistence (preserve existing config format), and any migration. Reference Codex/Gemini settings UX.' +
      CITE,
  ),
);

// ---- 990 workers across 10 ordered buckets (high-value first). Each bucket
// ---- runs its workers in parallel (8 effective concurrent), then its
// ---- synthesis agent writes the artifact IMMEDIATELY — so output is durable
// ---- at 10 checkpoints, not all-or-nothing at the end of a multi-hour run.
// ---- 990 workers + 10 synthesis = exactly 1000 agents.
const BUCKETS = [
  { name: 'security-and-approval', jobs: [].concat(approvalJobs, secJobs) },
  { name: 'reference-architecture-map', jobs: refJobs },
  { name: 'agi-surface-audit', jobs: agiJobs },
  { name: 'panels-design', jobs: panelJobs },
  { name: 'transcript-and-tool-cells', jobs: [].concat(cellJobs, toolCellJobs) },
  { name: 'composer-design', jobs: composerJobs },
  { name: 'snapshot-and-terminal-matrix', jobs: [].concat(snapJobs, termJobs) },
  { name: 'research-and-mcp', jobs: [].concat(researchJobs, mcpJobs) },
  { name: 'keybindings-status-edgecases', jobs: [].concat(keyJobs, chipJobs, edgeJobs) },
  { name: 'slash-and-settings', jobs: [].concat(slashJobs, settingsJobs) },
];

// Trim to exactly 990 workers, dropping from the tail (lowest-value padding).
let remaining = 990;
for (const b of BUCKETS) {
  if (remaining <= 0) {
    b.jobs = [];
    continue;
  }
  if (b.jobs.length > remaining) b.jobs = b.jobs.slice(0, remaining);
  remaining -= b.jobs.length;
}
const totalWorkers = BUCKETS.reduce((n, b) => n + b.jobs.length, 0);
log(
  'registering ' +
    totalWorkers +
    ' workers + ' +
    BUCKETS.length +
    ' synthesis = ' +
    (totalWorkers + BUCKETS.length) +
    ' agents; model inherited (Opus 4.8 1M); 8 effective concurrent on this 10-core host; 10 incremental artifact checkpoints',
);

const compact = (items) =>
  items.map((f) => '- [' + f.p + '] ' + f.h + (f.rec ? ' -> ' + f.rec : '')).join('\n');

const summaries = [];
for (let bi = 0; bi < BUCKETS.length; bi++) {
  const b = BUCKETS[bi];
  if (!b.jobs.length) continue;
  log(
    'bucket ' +
      (bi + 1) +
      '/' +
      BUCKETS.length +
      ' "' +
      b.name +
      '": running ' +
      b.jobs.length +
      ' workers',
  );

  const found = (
    await parallel(
      b.jobs.map(
        (j) => () =>
          agent(j.prompt, { label: j.label, phase: j.phase, schema: FINDING }).then((r) =>
            r
              ? {
                  phase: j.phase,
                  h: r.headline,
                  p: r.priority,
                  rec: (r.recommendations || [])[0] || '',
                }
              : null,
          ),
      ),
    )
  ).filter(Boolean);

  // Incremental durability: write this bucket's artifact now, before the next
  // bucket starts. A crash/interruption keeps every completed bucket's file.
  const path = ART + '/' + b.name + '.md';
  const body = compact(found).slice(0, 28000);
  const s = await agent(
    'You are a synthesis lead for AGI CLI parity. Below are ' +
      found.length +
      ' compact findings (priority, headline, top recommendation) from parallel Opus-4.8-1M research/audit/design agents (bucket: ' +
      b.name +
      ').\n\n' +
      body +
      '\n\nWrite a consolidated, de-duplicated engineering artifact to ' +
      path +
      " using the Write tool. Structure: (1) Overview, (2) Prioritized findings table (P0/P1/P2/P3), (3) Concrete recommendations grouped by theme, (4) Open questions / conflicts. Keep AGI's Rust/Ratatui identity and existing CLI compatibility. Then return artifact_path, a 3-sentence summary, and the top 5 actions.",
    { label: 'synth:' + b.name, phase: 'Synthesize', schema: SYNTH },
  );
  if (s) {
    summaries.push(s);
    log('checkpoint ' + (bi + 1) + '/' + BUCKETS.length + ' artifact written: ' + s.artifact_path);
  }
}

return {
  total_agents: totalWorkers + BUCKETS.length,
  buckets: BUCKETS.length,
  artifacts: summaries.map((s) => s.artifact_path),
  summaries,
};
