#!/usr/bin/env python3
"""Write tools/workflows/competitors.js: one agent per capability topic traces
competitor evidence -> AGI requirement -> current implementation -> gap -> acceptance -> verification."""
import json, pathlib

KB = pathlib.Path(__file__).resolve().parent.parent
TOPICS = [
    ("conversations-and-history", "Conversations and history", "starting a chat, the chat list, search of past chats, rename, pin, archive, delete, temporary chats, export", "Home and navigation; Conversations and message actions; Projects and organization", "4, 12, 18, 34, 41"),
    ("editing-regeneration-and-branching", "Editing, regeneration and branching", "editing a sent message, retry and regenerate, response versions, branches of a conversation, stop", "Conversations and message actions", "16, 17, 18"),
    ("model-selection", "Model selection", "the model picker, automatic choice, reasoning or effort levels, which models each plan gets, what happens when a model lacks an ability", "Models and reasoning", "15, 76, 79, 91"),
    ("streaming-and-response-states", "Streaming and response states", "first words, streaming display, thinking display, stop, interrupted answers, errors during an answer", "Conversations and message actions; Rendering and content", "19"),
    ("context-management", "Context management", "long conversations, context limits, summarising, compaction, what is sent with each turn, attachments in context", "Conversations and message actions; Models and reasoning", "93, 19"),
    ("memory-and-personalization", "Memory and personalization", "saved memory, memory controls, custom instructions, styles and tone, reference to past chats", "Memory and personalization", "39, 40, 94"),
    ("projects", "Projects", "projects with instructions and files, project chats, sharing a project, project memory", "Projects and organization", "23"),
    ("files-and-attachments", "Files and attachments", "uploading files and images, supported types and size limits, reading documents, the library of files", "Files, media and creation; Composer and input", "14, 24, 25, 95"),
    ("artifacts-and-documents", "Generated artifacts and documents", "artifacts, documents, code canvases, spreadsheets, slides, published pages, Office file creation, editing and versions", "Artifacts and documents; Files, media and creation", "26, 27, 28, 29, 30, 31, 33, 96"),
    ("rich-content-rendering", "Rich content rendering", "Markdown, code blocks, tables, math, charts, inline visuals, cards and widgets in answers", "Rendering and content", "20, 21, 22"),
    ("search", "Web search", "searching the web, citations and sources, search controls", "Search and research", "34, 36"),
    ("research", "Deep research", "multi-step research, reports with citations, research using connected apps", "Search and research", "35"),
    ("tools-and-code-execution", "Tools and code execution", "the tools the assistant can call, running code, data analysis, tool call display", "Agents, tasks and automation; Rendering and content", "57, 92, 21"),
    ("connectors-apps-and-extensions", "Connectors, apps, plugins and skills", "connecting outside apps, the directory, custom connectors and MCP, plugins, skills, custom assistants", "Connectors, apps, plugins and skills", "52, 53, 54, 55, 56, 58, 98"),
    ("agent-actions", "Agent actions", "the assistant acting for the user: multi-step work, browser actions, computer use, agents that run in the cloud", "Agents, tasks and automation; Browser actions", "60, 61, 62, 64, 65"),
    ("approvals-and-permissions", "Approvals and permissions", "asking before an action, permission modes, per-tool approval, what is never done without the user", "Agents, tasks and automation; Browser actions; Privacy, security and data", "59"),
    ("voice", "Voice", "voice conversations, dictation, read aloud, voice settings and languages", "Voice", "48, 49, 50"),
    ("images-and-video", "Images and video", "image understanding, image generation and editing, video generation", "Files, media and creation", "43, 44, 45, 46, 47"),
    ("coding-workflows", "Coding workflows", "coding in the chat product, the cloud coding agent, pull requests, review; keep the chat products apart from the separate coding tools and say how they connect", "Coding agent", "66, 67, 99"),
    ("scheduled-tasks", "Tasks and schedules", "scheduled tasks, recurring runs, triggers, results and history", "Agents, tasks and automation", "63"),
    ("notifications", "Notifications", "when and how the user is told something finished or needs attention, per channel", "Notifications", "42"),
    ("sharing-and-collaboration", "Sharing and collaboration", "sharing a chat, an artifact or a project, public links, roles, comments, team spaces", "Sharing and collaboration", "23, 26, 106, 107"),
    ("synchronization-and-continuity", "Synchronization and continuity", "the same account on several devices, sync of chats and settings, moving a session between devices, remote control", "Cross-device continuity; Device and OS integration", "68, 110"),
    ("settings", "Settings", "general, appearance, language, data controls, keyboard shortcuts", "Settings; Accessibility and languages", "84, 85, 11"),
    ("privacy-and-data-controls", "Privacy and data controls", "training opt-out, retention, deletion, export, temporary chats, security settings, sensitive data", "Privacy, security and data", "41, 85, 86, 88"),
    ("subscriptions-and-plans", "Subscriptions and plans", "the plans, what each includes, buying, changing and cancelling, team and enterprise plans", "Plans, billing and usage", "81, 83, 100"),
    ("usage-limits", "Usage limits", "allowances and windows, what happens at a limit, usage display, extra usage and credits", "Plans, billing and usage", "82"),
    ("recovery-and-errors", "Recovery behaviour", "what the product does when something goes wrong: failed answers, lost connection, reload during an answer, offline, retries, restoring deleted items", "Conversations and message actions; Help, feedback and support", "19, 88"),
    ("account-and-sign-in", "Account and sign-in", "sign-up, sign-in methods, verification, sessions, account security, age requirements", "Account and sign-in", "3, 86"),
    ("teams-and-admin", "Teams and admin", "workspaces, members and roles, admin controls, single sign-on, audit, enterprise controls", "Teams and admin", "87"),
    ("apps-and-install", "Apps, install and updates", "which apps exist, how they are installed and updated, operating system integration", "Install, release and update; Device and OS integration", "69, 70, 71, 72, 74, 109"),
]
docs = [{"slug": s, "title": t, "scope": sc, "catalog_areas": a, "ledger_areas": l} for s, t, sc, a, l in TOPICS]
js = r'''export const meta = {
  name: "kb-competitor-trace",
  description: "For each capability topic, trace Claude and ChatGPT evidence to an AGI requirement, the current implementation, the gap, acceptance criteria and verification",
  phases: [{ title: "Trace", detail: "one agent per capability topic", model: "sonnet" }],
};
const TOPICS = __TOPICS__;
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
'''
out = KB / "tools/workflows/competitors.js"
out.write_text(js.replace("__TOPICS__", json.dumps(docs, indent=1)))
print(len(docs), "topics;", out.stat().st_size, "bytes")
