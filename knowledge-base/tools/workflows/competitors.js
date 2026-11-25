export const meta = {
  name: "kb-competitor-trace",
  description: "For each capability topic, trace Claude and ChatGPT evidence to an AGI requirement, the current implementation, the gap, acceptance criteria and verification",
  phases: [{ title: "Trace", detail: "one agent per capability topic", model: "sonnet" }],
};
const TOPICS = [
 {
  "slug": "conversations-and-history",
  "title": "Conversations and history",
  "scope": "starting a chat, the chat list, search of past chats, rename, pin, archive, delete, temporary chats, export",
  "catalog_areas": "Home and navigation; Conversations and message actions; Projects and organization",
  "ledger_areas": "4, 12, 18, 34, 41"
 },
 {
  "slug": "editing-regeneration-and-branching",
  "title": "Editing, regeneration and branching",
  "scope": "editing a sent message, retry and regenerate, response versions, branches of a conversation, stop",
  "catalog_areas": "Conversations and message actions",
  "ledger_areas": "16, 17, 18"
 },
 {
  "slug": "model-selection",
  "title": "Model selection",
  "scope": "the model picker, automatic choice, reasoning or effort levels, which models each plan gets, what happens when a model lacks an ability",
  "catalog_areas": "Models and reasoning",
  "ledger_areas": "15, 76, 79, 91"
 },
 {
  "slug": "streaming-and-response-states",
  "title": "Streaming and response states",
  "scope": "first words, streaming display, thinking display, stop, interrupted answers, errors during an answer",
  "catalog_areas": "Conversations and message actions; Rendering and content",
  "ledger_areas": "19"
 },
 {
  "slug": "context-management",
  "title": "Context management",
  "scope": "long conversations, context limits, summarising, compaction, what is sent with each turn, attachments in context",
  "catalog_areas": "Conversations and message actions; Models and reasoning",
  "ledger_areas": "93, 19"
 },
 {
  "slug": "memory-and-personalization",
  "title": "Memory and personalization",
  "scope": "saved memory, memory controls, custom instructions, styles and tone, reference to past chats",
  "catalog_areas": "Memory and personalization",
  "ledger_areas": "39, 40, 94"
 },
 {
  "slug": "projects",
  "title": "Projects",
  "scope": "projects with instructions and files, project chats, sharing a project, project memory",
  "catalog_areas": "Projects and organization",
  "ledger_areas": "23"
 },
 {
  "slug": "files-and-attachments",
  "title": "Files and attachments",
  "scope": "uploading files and images, supported types and size limits, reading documents, the library of files",
  "catalog_areas": "Files, media and creation; Composer and input",
  "ledger_areas": "14, 24, 25, 95"
 },
 {
  "slug": "artifacts-and-documents",
  "title": "Generated artifacts and documents",
  "scope": "artifacts, documents, code canvases, spreadsheets, slides, published pages, Office file creation, editing and versions",
  "catalog_areas": "Artifacts and documents; Files, media and creation",
  "ledger_areas": "26, 27, 28, 29, 30, 31, 33, 96"
 },
 {
  "slug": "rich-content-rendering",
  "title": "Rich content rendering",
  "scope": "Markdown, code blocks, tables, math, charts, inline visuals, cards and widgets in answers",
  "catalog_areas": "Rendering and content",
  "ledger_areas": "20, 21, 22"
 },
 {
  "slug": "search",
  "title": "Web search",
  "scope": "searching the web, citations and sources, search controls",
  "catalog_areas": "Search and research",
  "ledger_areas": "34, 36"
 },
 {
  "slug": "research",
  "title": "Deep research",
  "scope": "multi-step research, reports with citations, research using connected apps",
  "catalog_areas": "Search and research",
  "ledger_areas": "35"
 },
 {
  "slug": "tools-and-code-execution",
  "title": "Tools and code execution",
  "scope": "the tools the assistant can call, running code, data analysis, tool call display",
  "catalog_areas": "Agents, tasks and automation; Rendering and content",
  "ledger_areas": "57, 92, 21"
 },
 {
  "slug": "connectors-apps-and-extensions",
  "title": "Connectors, apps, plugins and skills",
  "scope": "connecting outside apps, the directory, custom connectors and MCP, plugins, skills, custom assistants",
  "catalog_areas": "Connectors, apps, plugins and skills",
  "ledger_areas": "52, 53, 54, 55, 56, 58, 98"
 },
 {
  "slug": "agent-actions",
  "title": "Agent actions",
  "scope": "the assistant acting for the user: multi-step work, browser actions, computer use, agents that run in the cloud",
  "catalog_areas": "Agents, tasks and automation; Browser actions",
  "ledger_areas": "60, 61, 62, 64, 65"
 },
 {
  "slug": "approvals-and-permissions",
  "title": "Approvals and permissions",
  "scope": "asking before an action, permission modes, per-tool approval, what is never done without the user",
  "catalog_areas": "Agents, tasks and automation; Browser actions; Privacy, security and data",
  "ledger_areas": "59"
 },
 {
  "slug": "voice",
  "title": "Voice",
  "scope": "voice conversations, dictation, read aloud, voice settings and languages",
  "catalog_areas": "Voice",
  "ledger_areas": "48, 49, 50"
 },
 {
  "slug": "images-and-video",
  "title": "Images and video",
  "scope": "image understanding, image generation and editing, video generation",
  "catalog_areas": "Files, media and creation",
  "ledger_areas": "43, 44, 45, 46, 47"
 },
 {
  "slug": "coding-workflows",
  "title": "Coding workflows",
  "scope": "coding in the chat product, the cloud coding agent, pull requests, review; keep the chat products apart from the separate coding tools and say how they connect",
  "catalog_areas": "Coding agent",
  "ledger_areas": "66, 67, 99"
 },
 {
  "slug": "scheduled-tasks",
  "title": "Tasks and schedules",
  "scope": "scheduled tasks, recurring runs, triggers, results and history",
  "catalog_areas": "Agents, tasks and automation",
  "ledger_areas": "63"
 },
 {
  "slug": "notifications",
  "title": "Notifications",
  "scope": "when and how the user is told something finished or needs attention, per channel",
  "catalog_areas": "Notifications",
  "ledger_areas": "42"
 },
 {
  "slug": "sharing-and-collaboration",
  "title": "Sharing and collaboration",
  "scope": "sharing a chat, an artifact or a project, public links, roles, comments, team spaces",
  "catalog_areas": "Sharing and collaboration",
  "ledger_areas": "23, 26, 106, 107"
 },
 {
  "slug": "synchronization-and-continuity",
  "title": "Synchronization and continuity",
  "scope": "the same account on several devices, sync of chats and settings, moving a session between devices, remote control",
  "catalog_areas": "Cross-device continuity; Device and OS integration",
  "ledger_areas": "68, 110"
 },
 {
  "slug": "settings",
  "title": "Settings",
  "scope": "general, appearance, language, data controls, keyboard shortcuts",
  "catalog_areas": "Settings; Accessibility and languages",
  "ledger_areas": "84, 85, 11"
 },
 {
  "slug": "privacy-and-data-controls",
  "title": "Privacy and data controls",
  "scope": "training opt-out, retention, deletion, export, temporary chats, security settings, sensitive data",
  "catalog_areas": "Privacy, security and data",
  "ledger_areas": "41, 85, 86, 88"
 },
 {
  "slug": "subscriptions-and-plans",
  "title": "Subscriptions and plans",
  "scope": "the plans, what each includes, buying, changing and cancelling, team and enterprise plans",
  "catalog_areas": "Plans, billing and usage",
  "ledger_areas": "81, 83, 100"
 },
 {
  "slug": "usage-limits",
  "title": "Usage limits",
  "scope": "allowances and windows, what happens at a limit, usage display, extra usage and credits",
  "catalog_areas": "Plans, billing and usage",
  "ledger_areas": "82"
 },
 {
  "slug": "recovery-and-errors",
  "title": "Recovery behaviour",
  "scope": "what the product does when something goes wrong: failed answers, lost connection, reload during an answer, offline, retries, restoring deleted items",
  "catalog_areas": "Conversations and message actions; Help, feedback and support",
  "ledger_areas": "19, 88"
 },
 {
  "slug": "account-and-sign-in",
  "title": "Account and sign-in",
  "scope": "sign-up, sign-in methods, verification, sessions, account security, age requirements",
  "catalog_areas": "Account and sign-in",
  "ledger_areas": "3, 86"
 },
 {
  "slug": "teams-and-admin",
  "title": "Teams and admin",
  "scope": "workspaces, members and roles, admin controls, single sign-on, audit, enterprise controls",
  "catalog_areas": "Teams and admin",
  "ledger_areas": "87"
 },
 {
  "slug": "apps-and-install",
  "title": "Apps, install and updates",
  "scope": "which apps exist, how they are installed and updated, operating system integration",
  "catalog_areas": "Install, release and update; Device and OS integration",
  "ledger_areas": "69, 70, 71, 72, 74, 109"
 }
];
const CATALOG = "~/.cache/agi-audit/leader-docs/2026-11-22/catalog.jsonl";
const SAVED = "~/.cache/agi-audit/leader-docs/2026-11-22";
const ROWS = "~/Desktop/agiworkforce/knowledge-base/50-competitors/data";
const BRIEFS = "~/Desktop/agiworkforce/knowledge-base/data/area-briefs";
const REPO = "~/Desktop/agiworkforce";
const EV = { type: "array", items: { type: "object", properties: { url: { type: "string" }, says: { type: "string" }, plans: { type: "string" }, surfaces: { type: "string" } }, required: ["url", "says"] } };
const TRACE = {
  type: "object",
  properties: {
    summary: { type: "string" },
    scope_notes: { type: "string" },
    capabilities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          what_it_is: { type: "string" },
          claude: { type: "object", properties: { has: { type: "string", enum: ["yes", "partly", "no", "unknown"] }, product: { type: "string" }, evidence: EV }, required: ["has", "product", "evidence"] },
          chatgpt: { type: "object", properties: { has: { type: "string", enum: ["yes", "partly", "no", "unknown"] }, product: { type: "string" }, evidence: EV }, required: ["has", "product", "evidence"] },
          requirement: { type: "object", properties: { statement: { type: "string" }, basis: { type: "string", enum: ["requirement", "inferred", "proposed"] }, source: { type: "string" }, fit_with_models_providers_subscription: { type: "string" } }, required: ["statement", "basis", "source", "fit_with_models_providers_subscription"] },
          current: { type: "object", properties: { status: { type: "string", enum: ["built", "partly built", "not built", "off by decision", "unknown"] }, by_app: { type: "string" }, ledger_ids: { type: "array", items: { type: "string" } }, comparison_ids: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } } }, required: ["status", "by_app", "ledger_ids", "comparison_ids", "evidence"] },
          gap: { type: "string" },
          acceptance_criteria: { type: "array", items: { type: "string" } },
          verification: { type: "object", properties: { status: { type: "string", enum: ["seen working by a person", "seen failing by a person", "code inspected only", "not verified"] }, evidence: { type: "string" } }, required: ["status", "evidence"] },
        },
        required: ["name", "what_it_is", "claude", "chatgpt", "requirement", "current", "gap", "acceptance_criteria", "verification"],
      },
    },
    unresolved_product_choices: { type: "array", items: { type: "string" } },
    could_not_establish: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "scope_notes", "capabilities", "unresolved_product_choices", "could_not_establish"],
};
function prompt(t) {
  return "You are writing one page of the AGI Workforce knowledge base that turns competitor research into traceable requirements.\n\n" +
    "AGI Workforce competes directly with Claude (by Anthropic) and ChatGPT (by OpenAI) across the whole assistant experience on six apps: Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension. Established product requirements: model agnostic; provider agnostic; one AGI Subscription system for entitlements, usage accounting, quotas and limits on every app; free local inference on mobile and desktop (sign-in requirements are a separate matter from payment); explicit execution boundaries between what runs on the device and what needs our servers or outside services.\n\n" +
    "Topic: " + t.title + ". Scope: " + t.scope + ".\n\n" +
    "Sources, all READ ONLY (never edit or create anything outside your answer, never run builds, tests or apps):\n" +
    "1. Competitor evidence: " + CATALOG + " holds 9,643 features taken from official Claude and ChatGPT documentation and help pages on 2026-11-22, one JSON object per line with product, surfaces, area, feature, detail, plans, status, url, id. Search it with rg for the areas '" + t.catalog_areas + "' and for the words of this topic. The saved pages themselves are under " + SAVED + " (manifest.jsonl maps each url to its saved file); open a saved page when a catalogue line is not enough. Use only this evidence for competitor behaviour, cite the url, and give the review date 2026-11-22. Never state competitor behaviour from memory: if the catalogue does not show it, write has: unknown.\n" +
    "2. Keep products distinct. A url under code.claude.com or about Claude Code describes the separate coding tool, not the Claude chat product; Codex pages describe the separate coding tool, not ChatGPT. In each product field write which product the evidence is about (Claude, Claude Code, ChatGPT, Codex, or two of them), and note where the coding tool connects to the chat product.\n" +
    "3. What AGI has: " + ROWS + "/comparison-<app>.csv (4,754 compared features with AGI's status from code reading; list_id column holds ids such as W12 or WP30), " + BRIEFS + " (the project's capability ledger by area; areas relevant here: " + t.ledger_areas + "; item ids look like S13.10 with a 'Should' line and status per app), and the code itself in " + REPO + ".\n" +
    "4. What a person has actually seen: " + "~/Desktop/agiworkforce/knowledge-base/70-qa/results" + "/basics/scorecards/web.csv and " + "~/Desktop/agiworkforce/knowledge-base/70-qa/defects" + "/web-problems-seen-in-browser.csv. Nothing is 'seen working by a person' unless one of these or a ledger live result says so.\n" +
    "5. Established requirements and owner decisions: " + REPO + "/docs/product (definition.md, requirements.md, experience-contract.md, commercial.md, competitive-guidance.md) and " + REPO + "/docs/decisions.\n\n" +
    "Return:\n- summary: at most 80 words.\n- scope_notes: how Claude, Claude Code, ChatGPT and Codex divide this topic, and any plan or availability limits that matter.\n" +
    "- capabilities: the 10 to 35 distinct capabilities of this topic that at least one competitor documents, or that AGI has and they do not. For each: name; what_it_is in one or two sentences; claude and chatgpt (has, product, evidence with url, what the page says, plan limits, surfaces); requirement (the statement for AGI Workforce; basis 'requirement' only when a project document states it, with that document as source, otherwise 'inferred' from competitor parity with source 'competitor parity', or 'proposed'; and how it must work with different models and providers and under the one subscription system, including what happens in Local mode); current (status, a short by_app line, the ledger ids and comparison ids that match, and code evidence as path:line); gap (what is missing between current and required, 'none known' if nothing); acceptance_criteria (2 to 5 checks a tester can run); verification (status and evidence).\n" +
    "- unresolved_product_choices: decisions the owner has not made that this topic needs (for example whether to match a feature only one competitor has). Do not decide them.\n- could_not_establish: gaps in the evidence.\n" +
    "Plain words, short sentences. Never invent a url, a file, an id or a behaviour. Do not write specific model identifiers or version names.";
}
const pages = await parallel(TOPICS.map((t) => () => agent(prompt(t), { label: "trace:" + t.slug, phase: "Trace", schema: TRACE, model: "sonnet" }).then((r) => ({ slug: t.slug, title: t.title, trace: r }))));
const done = pages.filter((p) => p && p.trace);
log("topics traced: " + done.length + " of " + TOPICS.length);
return { topics: done };
