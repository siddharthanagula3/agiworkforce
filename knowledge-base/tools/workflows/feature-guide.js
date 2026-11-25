export const meta = {
  name: "qa-feature-guide",
  description: "Write the feature guide: one page per product area on the cheap model, and one map of the whole codebase",
  phases: [
    { title: "Areas", detail: "one cheap agent per product area", model: "haiku" },
    { title: "Map", detail: "one page that explains how the whole codebase fits together", model: "sonnet" },
  ],
};

const AREAS = ["002-public-website-and-acquisition-screens", "003-authentication-and-onboarding-screens", "004-signed-in-application-destinations", "005-application-shell-and-navigation-components", "006-visual-foundations-and-spacing-conventions", "007-layout-systems", "008-basic-interactive-elements", "009-compound-interface-components", "010-modal-and-dialog-inventory", "011-accessibility-and-localization-components", "012-new-chat-experience", "014-attachment-intake-components", "015-model-selector-interface", "016-user-message-components", "017-assistant-message-components", "018-conversation-level-controls", "019-streaming-and-response-presentation-states", "020-markdown-and-text-rendering", "021-code-blocks-and-executable-code-presentation", "022-rich-answers-and-structured-result-widgets", "023-project-workspace", "024-library-and-file-management-experience", "025-file-previews-and-readers", "026-artifact-container-and-panel", "027-document-and-writing-editor", "028-code-canvas-and-application-preview", "029-spreadsheet-and-data-analysis-workspace", "030-presentation-workspace", "031-pdf-and-document-transformation-products", "032-design-workspace", "033-generated-sites-and-published-applications", "034-search-experiences", "035-research-workspace", "036-sources-and-grounding-interface", "037-notebook-and-knowledge-workspace-product", "038-learning-and-study-products", "039-memory-product", "040-instructions-preferences-and-personal-style", "041-temporary-and-private-experiences", "042-proactive-assistance-briefings-and-reflection", "043-image-and-visual-understanding", "044-image-generation-studio", "045-image-editor", "046-video-generation-studio", "047-video-editing-and-media-continuity", "048-voice-conversation-interface", "049-dictation-transcription-and-recording", "050-audio-overviews-speech-generation-and-music", "051-voice-agent-builder-and-telephony-extensions", "052-custom-assistant-builder", "053-skill-creation-and-management", "054-plugin-marketplace-and-customization", "055-connector-setup-and-account-management", "056-concrete-integration-families", "057-tool-catalog-and-invocation-experience", "058-mcp-and-interactive-extension-products", "059-approvals-and-human-in-the-loop-ui", "060-agentic-work-product", "061-persistent-agents-and-agent-rosters", "062-multi-agent-and-multi-model-interfaces", "064-browser-assistant-experience", "065-computer-use-experience", "066-coding-workspace-frontend", "067-coding-capabilities-and-developer-workflows", "068-session-continuity-and-remote-session-product", "069-web-application", "070-desktop-application", "071-mobile-application", "072-cli-and-terminal-application", "073-vs-code-and-ide-extension", "074-browser-extension", "076-model-capability-registry", "078-ui-gating-and-adaptation-components", "079-routing-and-model-neutral-orchestration", "081-free-basic-pro-max-5x-max-20x-planning-structure", "082-usage-dashboard-and-limit-ui", "084-general-and-appearance-settings", "085-personalization-and-data-settings", "086-security-and-connected-access-settings", "087-enterprise-administration-screens", "088-support-trust-and-policy-product", "089-account-and-access-components", "090-conversation-and-synchronization-components", "091-model-and-inference-components", "092-tool-calling-and-agent-loop-components", "093-search-retrieval-and-context-components", "094-memory-and-personalization-components", "095-file-and-library-components", "096-artifact-and-generated-application-components", "097-media-and-realtime-components", "098-integration-and-extensibility-components", "099-coding-and-local-runtime-components", "100-commercial-and-administrative-components", "101-shared-package-boundaries", "102-runtime-inventory", "103-data-and-persistence-categories", "104-named-technology-options-not-claims-about-competitor-interna", "105-developer-platform-and-console", "106-office-collaboration-channel-and-email-surfaces", "107-discovery-social-and-public-content-products", "108-specialist-workspaces", "109-optional-native-and-ambient-extensions", "110-cross-product-experiences-to-include-in-the-product-map"];
const REPO = '~/Desktop/agiworkforce'
const BRIEFS = '~/Desktop/agiworkforce/knowledge-base/data/area-briefs'

const GUIDE = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    what_it_is_for: { type: 'string' },
    who_uses_it: { type: 'string' },
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ids: { type: 'array', items: { type: 'string' } },
          use: { type: 'string' },
          how_people_use_it: { type: 'array', items: { type: 'string' } },
          how_it_should_work: { type: 'array', items: { type: 'string' } },
          on_each_app: { type: 'string' },
        },
        required: ['name', 'ids', 'use', 'how_people_use_it', 'how_it_should_work', 'on_each_app'],
      },
    },
    how_it_works: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, detail: { type: 'string' }, code: { type: 'array', items: { type: 'string' } } }, required: ['step', 'detail', 'code'] } },
    key_files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, role: { type: 'string' } }, required: ['path', 'role'] } },
    data_kept: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' } }, required: ['what', 'where'] } },
    switches: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'effect', 'where'] } },
    shared_code: { type: 'string' },
    things_that_look_wrong: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' } }, required: ['what', 'where'] } },
    not_sure: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'what_it_is_for', 'who_uses_it', 'features', 'how_it_works', 'key_files', 'data_kept', 'switches', 'shared_code', 'things_that_look_wrong', 'not_sure'],
}

function prompt(slug) {
  return `Write the feature guide page for one product area of AGI Workforce, an AI assistant product with six apps (Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension) that does what Claude and ChatGPT do, lets the user choose the model, and can run a model on the user's own device for free. It runs in three separate ways: Local (on the device), own key (the user's provider key), and Cloud (our managed service, paid by plan).

Readers: a new engineer who must change this area, and a QA tester who must use it like a person. Neither has seen the code.

Start from the brief: ${BRIEFS}/${slug}.md. It lists every item in the area, what should happen ("Should"), its status in each app, and where its code is.
Then read the code in the project folder ${REPO} (READ ONLY: never edit, create or delete anything there, and never run builds, tests, installs or servers). Open the files the brief names, and follow the path from the screen to the server and to where data is stored. Search with rg when a file has moved.

Return:
- area: the area's name.
- what_it_is_for: 2 to 4 sentences: what a person gets from this area and why it matters.
- who_uses_it: which users (every user, paid plans only, workspace admins, developers ...), as the code shows.
- features: group the brief's items into the 4 to 12 features a person would recognise. For each: a plain name; ids (every item ID from the brief that belongs to it; each ID in exactly one feature); use (what it is for, one or two sentences); how_people_use_it (the steps or gestures: click, type, drag, tap, swipe, keyboard shortcut, command); how_it_should_work (what must happen, including the empty state, the waiting state, what happens on failure, and any limit by plan); on_each_app (which apps have it and how they differ, from the Status lines).
- how_it_works: the path through the code in order, 4 to 10 steps, from what the person touches to what is stored or sent. Each step: a short name, what happens in plain words, and code: the files and lines you actually opened, as "path:line".
- key_files: the 5 to 12 files someone must know, each with its role in one line.
- data_kept: what is stored and where (database table, browser storage, file on disk, device storage), only what you saw in the code.
- switches: plan gates, feature flags, settings and environment values that turn parts of this area on or off, with where each is read.
- shared_code: which code is shared between apps and which is separate per app.
- things_that_look_wrong: places where the code does not do what the brief's "Should" says, or looks unfinished or contradictory. Only what you saw, with path:line. Empty list if none.
- not_sure: everything you could not establish. An honest gap is better than a guess.

Rules: plain words, short sentences, explain any technical term in a few words the first time. Every "code" and "where" entry must be a real path you opened in this project. Never invent a file, a function, a setting or a behaviour. Do not write model names or vendor names of AI providers.`
}

const MAP_PROMPT = `Write one page that explains how the whole AGI Workforce codebase fits together, for a new engineer and for a QA tester. Project folder (READ ONLY: never edit, create or delete anything, and never run builds, tests, installs or servers): ${REPO}
Read ARCHITECTURE.md, AGENTS.md, README.md, docs/architecture/ (every file), docs/agent-context/repo-map.json and lanes.json, package.json, pnpm-workspace.yaml, Cargo.toml, and the top of each app's and package's own README or package.json. Open code where the documents are unclear.
Write Markdown with these sections, in plain words and short sentences, explaining each technical term in a few words the first time:
1. The product in five lines (six apps; Local, own key and Cloud as three separate ways of running; the user chooses the model).
2. The apps: for each of Web, Desktop, Mobile, CLI, VS Code extension and Chrome extension: its folder, what it is built with, how it starts, and what it shares with the others. Say plainly that the public Desktop app shows the hosted web app in its window and what the older retained desktop code is.
3. The shared packages and services: a table of every folder under packages/, services/, crates/ and infrastructure/ with one line on what it is for and which apps use it.
4. What happens when a person sends a chat message in Cloud mode, step by step from the screen to the model provider and back, and where the conversation is stored. Then the same in a few lines for Local mode and for own key.
5. Accounts, plans and usage: where sign-in, plans, allowances and billing live in the code.
6. Where data is kept: the database and its migration folder, files, caches, device storage.
7. The rules the code enforces (trust boundaries between Local, own key and Cloud; the generated model catalog; protocol types generated from Rust; the guard scripts) and where each is enforced.
8. How to build, run and check each app: the commands, taken from docs/agent-context/commands.json.
9. Where to look first: a table "if you need to change X, start in Y" with at least 25 rows covering the main features.
Cite the file for every statement as (path) or (path:line). Only real paths you opened. Never invent a file, a command or a behaviour; where the documents and the code disagree, say so and trust the code. Do not write model names or vendor names of AI providers. End with a section "Not established" listing what you could not find.`;

const areas = parallel(AREAS.map((slug) => () => agent(prompt(slug), { label: `area:${slug.slice(0, 34)}`, phase: "Areas", schema: GUIDE, model: "haiku" }).then((r) => ({ slug, model: "haiku", guide: r }))));
const map = agent(MAP_PROMPT, { label: "codebase map", phase: "Map", model: "sonnet" });
const [pages, mapText] = await Promise.all([areas, map]);
const done = pages.filter((p) => p && p.guide);
log(`area pages written: ${done.length} of ${AREAS.length}`);
return { pages: done, map: mapText || "" };
