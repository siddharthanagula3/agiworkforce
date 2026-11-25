export const meta = {
  name: "qa-paths-web",
  description: "Write, from the code, how a tester reaches each Web item, using the cheap model",
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

const ARGS = {"app": "web", "setupApps": [], "jobs": [["002-public-website-and-acquisition-screens", 0, "S2.01", "S2.30", 25], ["002-public-website-and-acquisition-screens", 1, "S2.31", "S2.40", 8], ["003-authentication-and-onboarding-screens", 0, "S3.01", "S3.35", 25], ["004-signed-in-application-destinations", 0, "S4.01", "S4.26", 25], ["004-signed-in-application-destinations", 1, "S4.27", "S4.44", 15], ["005-application-shell-and-navigation-components", 0, "S5.01", "S5.30", 25], ["005-application-shell-and-navigation-components", 1, "S5.31", "S5.39", 7], ["006-visual-foundations-and-spacing-conventions", 0, "S6.01", "S6.25", 25], ["006-visual-foundations-and-spacing-conventions", 1, "S6.26", "S6.35", 10], ["007-layout-systems", 0, "S7.01", "S7.32", 25], ["008-basic-interactive-elements", 0, "S8.01", "S8.27", 25], ["008-basic-interactive-elements", 1, "S8.28", "S8.50", 22], ["009-compound-interface-components", 0, "S9.01", "S9.27", 25], ["009-compound-interface-components", 1, "S9.28", "S9.38", 11], ["010-modal-and-dialog-inventory", 0, "S10.01", "S10.26", 25], ["010-modal-and-dialog-inventory", 1, "S10.27", "S10.48", 19], ["011-accessibility-and-localization-components", 0, "S11.01", "S11.26", 25], ["011-accessibility-and-localization-components", 1, "S11.27", "S11.27", 1], ["012-new-chat-experience", 0, "S12.01", "S12.24", 23], ["013-composer-text-interaction", 0, "S13.01", "S13.31", 25], ["013-composer-text-interaction", 1, "S13.32", "S13.40", 9], ["014-attachment-intake-components", 0, "S14.01", "S14.34", 25], ["014-attachment-intake-components", 1, "S14.35", "S14.36", 2], ["015-model-selector-interface", 0, "S15.01", "S15.29", 25], ["015-model-selector-interface", 1, "S15.30", "S15.35", 6], ["016-user-message-components", 0, "S16.01", "S16.18", 17], ["017-assistant-message-components", 0, "S17.01", "S17.31", 25], ["017-assistant-message-components", 1, "S17.32", "S17.40", 6], ["018-conversation-level-controls", 0, "S18.01", "S18.28", 22], ["019-streaming-and-response-presentation-states", 0, "S19.01", "S19.26", 25], ["019-streaming-and-response-presentation-states", 1, "S19.27", "S19.29", 3], ["020-markdown-and-text-rendering", 0, "S20.01", "S20.26", 25], ["020-markdown-and-text-rendering", 1, "S20.27", "S20.30", 4], ["021-code-blocks-and-executable-code-presentation", 0, "S21.01", "S21.30", 19], ["022-rich-answers-and-structured-result-widgets", 0, "S22.01", "S22.38", 19], ["023-project-workspace", 0, "S23.01", "S23.34", 23], ["024-library-and-file-management-experience", 0, "S24.02", "S24.35", 17], ["025-file-previews-and-readers", 0, "S25.01", "S25.30", 14], ["026-artifact-container-and-panel", 0, "S26.01", "S26.30", 25], ["026-artifact-container-and-panel", 1, "S26.31", "S26.40", 7], ["027-document-and-writing-editor", 0, "S27.01", "S27.37", 14], ["028-code-canvas-and-application-preview", 0, "S28.01", "S28.30", 12], ["029-spreadsheet-and-data-analysis-workspace", 0, "S29.17", "S29.39", 10], ["030-presentation-workspace", 0, "S30.28", "S30.28", 1], ["031-pdf-and-document-transformation-products", 0, "S31.01", "S31.24", 11], ["032-design-workspace", 0, "S32.31", "S32.34", 3], ["033-generated-sites-and-published-applications", 0, "S33.01", "S33.30", 13], ["034-search-experiences", 0, "S34.01", "S34.32", 19], ["035-research-workspace", 0, "S35.01", "S35.33", 25], ["035-research-workspace", 1, "S35.34", "S35.34", 1], ["036-sources-and-grounding-interface", 0, "S36.01", "S36.25", 14], ["037-notebook-and-knowledge-workspace-product", 0, "S37.01", "S37.38", 20], ["038-learning-and-study-products", 0, "S38.01", "S38.04", 4], ["039-memory-product", 0, "S39.02", "S39.30", 25], ["039-memory-product", 1, "S39.31", "S39.32", 2], ["040-instructions-preferences-and-personal-style", 0, "S40.01", "S40.30", 23], ["041-temporary-and-private-experiences", 0, "S41.01", "S41.20", 14], ["042-proactive-assistance-briefings-and-reflection", 0, "S42.01", "S42.25", 10], ["043-image-and-visual-understanding", 0, "S43.01", "S43.17", 12], ["044-image-generation-studio", 0, "S44.01", "S44.36", 21], ["045-image-editor", 0, "S45.01", "S45.33", 11], ["046-video-generation-studio", 0, "S46.01", "S46.32", 12], ["048-voice-conversation-interface", 0, "S48.01", "S48.38", 25], ["048-voice-conversation-interface", 1, "S48.39", "S48.41", 3], ["049-dictation-transcription-and-recording", 0, "S49.01", "S49.30", 12], ["050-audio-overviews-speech-generation-and-music", 0, "S50.01", "S50.03", 3], ["053-skill-creation-and-management", 0, "S53.01", "S53.36", 17], ["054-plugin-marketplace-and-customization", 0, "S54.01", "S54.28", 25], ["054-plugin-marketplace-and-customization", 1, "S54.29", "S54.37", 8], ["055-connector-setup-and-account-management", 0, "S55.01", "S55.30", 24], ["056-concrete-integration-families", 0, "S56.01", "S56.26", 25], ["056-concrete-integration-families", 1, "S56.27", "S56.47", 19], ["057-tool-catalog-and-invocation-experience", 0, "S57.01", "S57.33", 25], ["057-tool-catalog-and-invocation-experience", 1, "S57.34", "S57.37", 3], ["058-mcp-and-interactive-extension-products", 0, "S58.01", "S58.28", 19], ["059-approvals-and-human-in-the-loop-ui", 0, "S59.01", "S59.28", 25], ["059-approvals-and-human-in-the-loop-ui", 1, "S59.30", "S59.31", 2], ["060-agentic-work-product", 0, "S60.01", "S60.32", 25], ["060-agentic-work-product", 1, "S60.33", "S60.34", 2], ["062-multi-agent-and-multi-model-interfaces", 0, "S62.09", "S62.17", 5], ["063-routines-schedules-and-triggers", 0, "S63.01", "S63.31", 25], ["063-routines-schedules-and-triggers", 1, "S63.32", "S63.33", 2], ["065-computer-use-experience", 0, "S65.27", "S65.29", 2], ["066-coding-workspace-frontend", 0, "S66.01", "S66.40", 16], ["067-coding-capabilities-and-developer-workflows", 0, "S67.01", "S67.30", 25], ["067-coding-capabilities-and-developer-workflows", 1, "S67.31", "S67.36", 4], ["068-session-continuity-and-remote-session-product", 0, "S68.01", "S68.25", 17], ["069-web-application", 0, "S69.01", "S69.20", 14], ["076-model-capability-registry", 0, "S76.01", "S76.37", 25], ["076-model-capability-registry", 1, "S76.38", "S76.38", 1], ["078-ui-gating-and-adaptation-components", 0, "S78.01", "S78.28", 25], ["079-routing-and-model-neutral-orchestration", 0, "S79.01", "S79.30", 24], ["081-free-basic-pro-max-5x-max-20x-planning-structure", 0, "S81.01", "S81.26", 25], ["081-free-basic-pro-max-5x-max-20x-planning-structure", 1, "S81.27", "S81.28", 2], ["082-usage-dashboard-and-limit-ui", 0, "S82.01", "S82.26", 25], ["082-usage-dashboard-and-limit-ui", 1, "S82.27", "S82.33", 6], ["083-billing-and-subscription-screens", 0, "S83.01", "S83.27", 25], ["083-billing-and-subscription-screens", 1, "S83.28", "S83.32", 5], ["084-general-and-appearance-settings", 0, "S84.01", "S84.23", 15], ["085-personalization-and-data-settings", 0, "S85.01", "S85.26", 17], ["086-security-and-connected-access-settings", 0, "S86.01", "S86.26", 17], ["087-enterprise-administration-screens", 0, "S87.01", "S87.25", 25], ["087-enterprise-administration-screens", 1, "S87.26", "S87.40", 10], ["088-support-trust-and-policy-product", 0, "S88.01", "S88.26", 25], ["088-support-trust-and-policy-product", 1, "S88.27", "S88.27", 1], ["105-developer-platform-and-console", 0, "S105.01", "S105.30", 18], ["106-office-collaboration-channel-and-email-surfaces", 0, "S106.13", "S106.24", 5], ["107-discovery-social-and-public-content-products", 0, "S107.04", "S107.23", 7], ["108-specialist-workspaces", 0, "S108.01", "S108.33", 18], ["109-optional-native-and-ambient-extensions", 0, "S109.16", "S109.16", 1], ["110-cross-product-experiences-to-include-in-the-product-map", 0, "S110.01", "S110.30", 18]]};
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
