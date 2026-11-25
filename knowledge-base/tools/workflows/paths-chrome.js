export const meta = {
  name: "qa-paths-chrome",
  description: "Write, from the code, how a tester reaches each Chrome item, using the cheap model",
  phases: [
    {
      title: "Paths",
      detail: "one cheap agent per area: where to find each item and the steps",
      model: "haiku",
    },
    {
      title: "Setup",
      detail: "one cheap agent per app: how to start it locally",
      model: "haiku",
    },
  ],
};

const ARGS = {"app": "chrome", "setupApps": [], "jobs": [["003-authentication-and-onboarding-screens", 0, "S3.01", "S3.35", 7], ["004-signed-in-application-destinations", 0, "S4.01", "S4.44", 17], ["005-application-shell-and-navigation-components", 0, "S5.01", "S5.35", 18], ["006-visual-foundations-and-spacing-conventions", 0, "S6.01", "S6.25", 25], ["006-visual-foundations-and-spacing-conventions", 1, "S6.26", "S6.35", 10], ["007-layout-systems", 0, "S7.01", "S7.29", 14], ["008-basic-interactive-elements", 0, "S8.01", "S8.38", 25], ["008-basic-interactive-elements", 1, "S8.40", "S8.50", 9], ["009-compound-interface-components", 0, "S9.01", "S9.38", 16], ["010-modal-and-dialog-inventory", 0, "S10.01", "S10.46", 12], ["011-accessibility-and-localization-components", 0, "S11.01", "S11.27", 18], ["012-new-chat-experience", 0, "S12.01", "S12.22", 9], ["013-composer-text-interaction", 0, "S13.01", "S13.40", 21], ["014-attachment-intake-components", 0, "S14.01", "S14.34", 13], ["015-model-selector-interface", 0, "S15.01", "S15.30", 13], ["016-user-message-components", 0, "S16.01", "S16.16", 8], ["017-assistant-message-components", 0, "S17.01", "S17.40", 19], ["018-conversation-level-controls", 0, "S18.01", "S18.28", 5], ["019-streaming-and-response-presentation-states", 0, "S19.01", "S19.27", 25], ["019-streaming-and-response-presentation-states", 1, "S19.28", "S19.29", 2], ["020-markdown-and-text-rendering", 0, "S20.01", "S20.30", 24], ["021-code-blocks-and-executable-code-presentation", 0, "S21.19", "S21.19", 1], ["022-rich-answers-and-structured-result-widgets", 0, "S22.01", "S22.28", 5], ["023-project-workspace", 0, "S23.01", "S23.32", 6], ["024-library-and-file-management-experience", 0, "S24.04", "S24.04", 1], ["026-artifact-container-and-panel", 0, "S26.02", "S26.32", 25], ["026-artifact-container-and-panel", 1, "S26.35", "S26.40", 5], ["027-document-and-writing-editor", 0, "S27.01", "S27.40", 18], ["028-code-canvas-and-application-preview", 0, "S28.01", "S28.30", 13], ["029-spreadsheet-and-data-analysis-workspace", 0, "S29.17", "S29.39", 7], ["030-presentation-workspace", 0, "S30.28", "S30.28", 1], ["032-design-workspace", 0, "S32.06", "S32.34", 6], ["033-generated-sites-and-published-applications", 0, "S33.02", "S33.26", 12], ["034-search-experiences", 0, "S34.02", "S34.32", 8], ["035-research-workspace", 0, "S35.18", "S35.25", 2], ["036-sources-and-grounding-interface", 0, "S36.02", "S36.04", 3], ["037-notebook-and-knowledge-workspace-product", 0, "S37.01", "S37.37", 6], ["039-memory-product", 0, "S39.04", "S39.32", 14], ["040-instructions-preferences-and-personal-style", 0, "S40.01", "S40.26", 15], ["041-temporary-and-private-experiences", 0, "S41.14", "S41.20", 4], ["042-proactive-assistance-briefings-and-reflection", 0, "S42.01", "S42.17", 5], ["043-image-and-visual-understanding", 0, "S43.01", "S43.14", 11], ["049-dictation-transcription-and-recording", 0, "S49.01", "S49.30", 5], ["053-skill-creation-and-management", 0, "S53.18", "S53.18", 1], ["055-connector-setup-and-account-management", 0, "S55.29", "S55.29", 1], ["056-concrete-integration-families", 0, "S56.01", "S56.26", 25], ["056-concrete-integration-families", 1, "S56.27", "S56.47", 19], ["057-tool-catalog-and-invocation-experience", 0, "S57.01", "S57.34", 25], ["057-tool-catalog-and-invocation-experience", 1, "S57.36", "S57.37", 2], ["058-mcp-and-interactive-extension-products", 0, "S58.24", "S58.25", 2], ["059-approvals-and-human-in-the-loop-ui", 0, "S59.01", "S59.31", 24], ["060-agentic-work-product", 0, "S60.02", "S60.34", 13], ["062-multi-agent-and-multi-model-interfaces", 0, "S62.09", "S62.12", 4], ["063-routines-schedules-and-triggers", 0, "S63.02", "S63.32", 11], ["064-browser-assistant-experience", 0, "S64.01", "S64.32", 21], ["065-computer-use-experience", 0, "S65.01", "S65.28", 11], ["067-coding-capabilities-and-developer-workflows", 0, "S67.16", "S67.18", 3], ["074-browser-extension", 0, "S74.01", "S74.28", 19], ["076-model-capability-registry", 0, "S76.01", "S76.38", 15], ["078-ui-gating-and-adaptation-components", 0, "S78.01", "S78.28", 16], ["079-routing-and-model-neutral-orchestration", 0, "S79.01", "S79.30", 17], ["081-free-basic-pro-max-5x-max-20x-planning-structure", 0, "S81.07", "S81.28", 8], ["082-usage-dashboard-and-limit-ui", 0, "S82.01", "S82.27", 11], ["083-billing-and-subscription-screens", 0, "S83.14", "S83.14", 1], ["084-general-and-appearance-settings", 0, "S84.03", "S84.22", 7], ["085-personalization-and-data-settings", 0, "S85.01", "S85.14", 8], ["086-security-and-connected-access-settings", 0, "S86.08", "S86.26", 6], ["087-enterprise-administration-screens", 0, "S87.27", "S87.27", 1], ["088-support-trust-and-policy-product", 0, "S88.01", "S88.08", 6], ["108-specialist-workspaces", 0, "S108.19", "S108.33", 5], ["109-optional-native-and-ambient-extensions", 0, "S109.05", "S109.09", 2], ["110-cross-product-experiences-to-include-in-the-product-map", 0, "S110.01", "S110.28", 6]]};
const REPO = "~/Desktop/agiworkforce";
const ROOTS = {
  web: "apps/web (pages under apps/web/app, features under apps/web/features) and the shared screens in packages/ui",
  desktop:
    "apps/desktop (the public Desktop app is Electron showing the hosted web app, so most chat screens are the web screens in apps/web and packages/ui; desktop-only parts are under apps/desktop/electron and apps/desktop/src)",
  mobile: "apps/mobile",
  cli: "apps/cli (a terminal program: features are commands, flags and slash commands)",
  vscode:
    "apps/extension-vscode (a panel inside the editor, plus editor commands)",
  chrome: "apps/extension (a side panel in Chrome)",
};
const NAMES = {
  web: "Web",
  desktop: "Desktop",
  mobile: "Mobile",
  cli: "CLI",
  vscode: "VS Code",
  chrome: "Chrome",
};

const ITEMS = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reachable: { type: "string", enum: ["yes", "not_from_ui", "unsure"] },
          where: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          needs: { type: "string" },
          labels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                file: { type: "string" },
              },
              required: ["text", "file"],
            },
          },
          note: { type: "string" },
        },
        required: ["id", "reachable", "where", "steps", "needs", "labels"],
      },
    },
  },
  required: ["items"],
};

function pathPrompt(job) {
  return `You are writing directions for a QA tester who will use the AGI ${NAMES[job.app]} app like a real person on a Mac (click, tap, type, drag). The tester has never seen the code. Your directions must come from the code, never from guessing.

Project folder (READ ONLY: never edit, create or delete anything in it, and never run builds, tests, installs or servers): ${REPO}
Code for this app: ${ROOTS[job.app]}

Plan file to read: ${job.file}
Each item in that file starts with a heading "## <ID> <name>". Handle ONLY the ${job.count} items from "## ${job.first}" through "## ${job.last}" inclusive, in the order they appear in the file. Ignore the items before and after that range.

For each item, the "Expected" line says what the person must be able to do, and the "Code" line lists source files with line numbers. Open those files. Find the screen, menu, button, setting, command or shortcut that a person uses for this item, and the exact words shown on it. Visible words are often in a translation file or a constant, so search for them with: rg -n "the words" <folder>.

Return one entry per item:
- id: the item ID.
- reachable: "yes" if a person can reach it from the app; "not_from_ui" if it is inner behaviour with no control of its own (for example a rule the server applies, a layout rule, a colour); "unsure" if you could not find it.
- where: the path a person takes from the first screen after signing in, using the exact visible words, for example "Sidebar > Scheduled > New task" or "Settings > Privacy > Memory" or, for the CLI, the command to type such as "agi --help" or "/model". For "not_from_ui", say in a few words where its effect can be seen. Empty if unsure.
- steps: 2 to 6 short steps a tester can follow: what to click or type, and as the last step what to look at to compare with Expected. For "not_from_ui", steps that make its effect visible if there are any, otherwise an empty list.
- needs: what the tester needs before starting, for example "none", "a paid account", "a Free account", "a second account in the same workspace", "a file to upload", "a microphone", "an outside account (Google)", "phone width".
- labels: 1 to 3 of the exact visible words you used in "where", each with the project file path (relative to the project folder) where that exact text appears. Copy the text exactly as it is in the file. Empty list if you found none.
- note: one short sentence only when something is uncertain, missing from the code, or different from what Expected says.

Rules: never invent a label, a menu or a path. If the files named in the Code line no longer contain the feature, search the app's folder once for it; if you still cannot find it, return reachable "unsure" with an empty "where" and say in "note" what you searched for. Do not judge whether the feature works. Plain, short words. Return every ID you were given, in the same order.`;
}

const SETUP = {
  type: "object",
  properties: {
    app: { type: "string" },
    what_it_is: { type: "string" },
    prerequisites: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          what: { type: "string" },
          command: { type: "string" },
          source: { type: "string" },
        },
        required: ["what", "source"],
      },
    },
    sign_in: { type: "string" },
    modes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          mode: { type: "string" },
          how: { type: "string" },
          source: { type: "string" },
        },
        required: ["mode", "how", "source"],
      },
    },
    how_to_tell_it_is_running: { type: "string" },
    cannot_be_done_on_this_computer: {
      type: "array",
      items: { type: "string" },
    },
    not_found_in_the_docs: { type: "array", items: { type: "string" } },
  },
  required: [
    "app",
    "what_it_is",
    "prerequisites",
    "steps",
    "sign_in",
    "modes",
    "how_to_tell_it_is_running",
    "cannot_be_done_on_this_computer",
    "not_found_in_the_docs",
  ],
};

const SETUP_HINTS = {
  desktop:
    "apps/desktop (package.json scripts, electron-builder.yml, README), docs/runbooks/desktop-electron-macos-release.md. The public Desktop app is Electron loading the hosted web app; AGI Code works on local folders. Modes to cover: Cloud for a subscribed user; AGI Code on a local model; AGI Code on the user's own key.",
  mobile:
    "apps/mobile (package.json scripts, app config, README), docs/runbooks/mobile-eas-signing.md and mobile-store-first-release.md. Cover the iOS Simulator and the Android emulator on a Mac. Modes to cover: Local on the device; Cloud on the Free plan; Cloud for a subscribed user.",
  cli: "apps/cli (Cargo.toml, README.md, src/lib.rs for commands), docs/runbooks/cli-release.md. Modes to cover: a local model; the user's own key; Cloud for a subscribed user.",
  vscode:
    "apps/extension-vscode (package.json scripts and contributes, README). Cover installing the built extension into VS Code on a Mac. Modes to cover: a local model; own key; Cloud for a subscribed user.",
  chrome:
    "apps/extension (package.json scripts, manifest, README, docs), docs/runbooks/chrome-web-store-publish.md. Cover loading the built extension into Google Chrome on a Mac (Load unpacked). Mode: Cloud, following the web account.",
};

function setupPrompt(app) {
  return `Write, from this project's own documents and scripts, how a tester starts the AGI ${NAMES[app]} app on this Mac for hands-on testing against the LOCAL web server at http://localhost:3000 with local test accounts.

Project folder (READ ONLY: never edit, create or delete anything, and never run builds, tests, installs, servers, simulators or the app itself): ${REPO}
Read: ${SETUP_HINTS[app]} Also read docs/development/README.md, docs/development/local-test-accounts.md, docs/development/troubleshooting.md, docs/agent-context/commands.json (the command inventory), and the baseline script for this app at ~/.cache/agi-audit/leader-docs/2026-11-22/results/baseline/scripts/${app}.md.
This computer has 16 GB of memory: heavy jobs (builds, simulators, emulators, dev servers) must run one at a time through scripts/dev/heavy-job.sh; read that script's header to say how.

Return:
- what_it_is: one or two sentences.
- prerequisites: what must already be installed or running.
- steps: in order, each with "what" in plain words, the exact "command" if there is one, and "source": the file and line where you read it (for example "apps/cli/README.md:42" or "package.json:416"). Only commands that appear in the project's files. No invented flags.
- sign_in: how a tester signs in with a local test account, as the documents describe it.
- modes: for each mode named above, how to put the app in that mode, with the source.
- how_to_tell_it_is_running: what the tester should see.
- cannot_be_done_on_this_computer: things the documents say need a signing certificate, a store account, a real phone, or another machine.
- not_found_in_the_docs: every step you expected to find and did not. Be honest: a gap listed here is more useful than a guess.
Plain words. Nothing from memory: only what the files say.`;
}

const JOBS = ARGS.jobs.map(([slug, part, first, last, count]) => ({
  app: ARGS.app, slug, part, first, last, count,
  file: `~/Desktop/agiworkforce/knowledge-base/70-qa/test-plans/${ARGS.app}/${slug}.md`,
}));
const paths = pipeline(JOBS, (job) =>
  agent(pathPrompt(job), { label: `${job.app}:${job.slug.slice(0, 28)}:${job.part}`, phase: "Paths", schema: ITEMS, model: "haiku" })
    .then((r) => ({ app: job.app, slug: job.slug, part: job.part, first: job.first, last: job.last, asked: job.count, items: r ? r.items : [] })),
);
const setup = parallel(
  ARGS.setupApps.map(
    (app) => () =>
      agent(setupPrompt(app), {
        label: `setup:${app}`,
        phase: "Setup",
        schema: SETUP,
        model: "haiku",
      }),
  ),
);
const [p, s] = await Promise.all([paths, setup]);
const done = p.filter(Boolean);
log(
  `paths: ${done.reduce((n, x) => n + x.items.length, 0)} items returned for ${done.reduce((n, x) => n + x.asked, 0)} asked; ${p.length - done.length} areas returned nothing`,
);
return { paths: done, setup: s.filter(Boolean) };
