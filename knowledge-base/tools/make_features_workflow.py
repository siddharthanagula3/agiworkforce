#!/usr/bin/env python3
"""Write tools/workflows/features-<n>.js: workflows that author the ten-section page of
every feature in 20-features/registry.json, at most six features per agent, all features of
one agent from the same area. Usage: python3 -I tools/make_features_workflow.py [parts]"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kb_lib import *

PARTS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
reg = json.loads((KB / "20-features/registry.json").read_text())["features"]
done = set()
for f in RAW.glob("features-deep-*.json"):
    for chunk in (json.loads(f.read_text()).get("result") or {}).get("chunks", []):
        done.update(x["id"] for x in chunk.get("features", []))
jobs, by_area = [], {}
for f in reg:
    if f["id"] not in done:
        by_area.setdefault(f["area"], []).append(f)
for sec in sorted(by_area, key=int):
    fs = by_area[sec]
    for i in range(0, len(fs), 6):
        part = fs[i:i + 6]
        jobs.append({"area": sec, "area_title": part[0]["area_title"], "slug": part[0]["area_slug"], "n": i // 6,
                     "features": [{"id": x["id"], "name": x["name"], "items": x["items"], "use": x["use"], "people": x["how_people_use_it"][:8], "should": x["how_it_should_work"][:10], "apps": x["on_each_app"], "status": x["implementation"]} for x in part]})

JS = r'''export const meta = {
  name: "kb-features-__PART__",
  description: "Write the ten-section knowledge-base page for each feature (part __PART__): purpose, user experience, current implementation, required behaviour, implementation map, data flow, access rules, states, verification, gaps",
  phases: [{ title: "Features", detail: "one agent per group of up to six features of one area", model: "sonnet" }],
};
const JOBS = __JOBS__;
const REPO = "~/Desktop/agiworkforce";
const BRIEFS = "~/Desktop/agiworkforce/knowledge-base/data/area-briefs";
const S = { type: "array", items: { type: "string" } };
const FEATURE = {
  type: "object",
  properties: {
    id: { type: "string" },
    aliases: S,
    summary: { type: "string" },
    purpose: { type: "object", properties: { what_it_does: { type: "string" }, why_it_exists: { type: "string" }, who_uses_it: { type: "string" }, problems_solved: S, use_cases: S }, required: ["what_it_does", "why_it_exists", "who_uses_it", "problems_solved", "use_cases"] },
    user_experience: { type: "object", properties: { where_to_find_it: S, prerequisites: S, screens_and_controls: S, journey: S, feedback_and_outputs: S, settings: S }, required: ["where_to_find_it", "prerequisites", "screens_and_controls", "journey", "feedback_and_outputs", "settings"] },
    current_implementation: { type: "object", properties: { working: S, incomplete: S, disconnected_or_disabled: S, not_available: S }, required: ["working", "incomplete", "disconnected_or_disabled", "not_available"] },
    required_behaviour: { type: "object", properties: { established: { type: "array", items: { type: "object", properties: { statement: { type: "string" }, source: { type: "string" } }, required: ["statement", "source"] } }, acceptance_criteria: S, inferred: S, proposed: S }, required: ["established", "acceptance_criteria", "inferred", "proposed"] },
    implementation_map: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["component", "screen", "hook", "store", "service", "endpoint", "schema", "table", "event", "job", "integration", "command", "config", "test", "other"] }, name: { type: "string" }, path: { type: "string" }, role: { type: "string" } }, required: ["kind", "name", "path", "role"] } },
    execution_and_data_flow: { type: "object", properties: { steps: { type: "array", items: { type: "object", properties: { what_happens: { type: "string" }, runs_on: { type: "string", enum: ["device", "our servers", "outside service", "device and our servers"] }, evidence: { type: "string" } }, required: ["what_happens", "runs_on", "evidence"] } }, data: { type: "array", items: { type: "object", properties: { what: { type: "string" }, where_stored: { type: "string" }, synced: { type: "string" }, retained_or_deleted: { type: "string" } }, required: ["what", "where_stored", "synced", "retained_or_deleted"] } }, models_and_providers: { type: "string" } }, required: ["steps", "data", "models_and_providers"] },
    access_and_usage: { type: "object", properties: { account: { type: "string" }, permissions: { type: "string" }, subscription: { type: "string" }, limits_and_metering: { type: "string" }, flags: { type: "string" }, model_compatibility: { type: "string" }, provider_restrictions: { type: "string" }, local_mode: { type: "string" } }, required: ["account", "permissions", "subscription", "limits_and_metering", "flags", "model_compatibility", "provider_restrictions", "local_mode"] },
    states_and_edge_cases: { type: "array", items: { type: "object", properties: { state: { type: "string" }, behaviour: { type: "string" }, evidence: { type: "string" } }, required: ["state", "behaviour", "evidence"] } },
    verification: { type: "object", properties: { existing_tests: { type: "array", items: { type: "object", properties: { path: { type: "string" }, covers: { type: "string" } }, required: ["path", "covers"] } }, scenarios: { type: "array", items: { type: "object", properties: { name: { type: "string" }, steps: S, expected: { type: "string" } }, required: ["name", "steps", "expected"] } }, diagnostics: S }, required: ["existing_tests", "scenarios", "diagnostics"] },
    gaps: { type: "array", items: { type: "object", properties: { gap: { type: "string" }, affects: { type: "string" }, evidence: { type: "string" }, work_needed: { type: "string" } }, required: ["gap", "affects", "evidence", "work_needed"] } },
    depends_on: S,
    relationships: { type: "array", items: { type: "object", properties: { rel: { type: "string", enum: ["implemented_by", "depends_on", "available_on", "uses_provider", "governed_by_subscription", "stores_data_in", "tested_by", "blocked_by", "exposes_api", "configured_by"] }, to: { type: "string" }, evidence: { type: "string" } }, required: ["rel", "to", "evidence"] } },
    unknowns: S,
  },
  required: ["id", "aliases", "summary", "purpose", "user_experience", "current_implementation", "required_behaviour", "implementation_map", "execution_and_data_flow", "access_and_usage", "states_and_edge_cases", "verification", "gaps", "depends_on", "relationships", "unknowns"],
};
const OUT = { type: "object", properties: { features: { type: "array", items: FEATURE } }, required: ["features"] };
const RULES =
  "Product context: AGI Workforce is an AI assistant product competing directly with Claude and ChatGPT, with six apps (Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension). Established requirements: model agnostic; provider agnostic; every subscription capability on every app connects to one AGI Subscription system (entitlements, access rules, usage accounting, quotas, limits); local inference on mobile and desktop is free of any paid subscription (sign-in requirements are a separate question from payment); execution boundaries are explicit (what runs on the device, what needs our servers or outside services, and how subscription rules apply) and are established from the code, never assumed. The product runs in three separate ways: Local (on the device), own key (the user's provider key), Cloud (our managed service).\n" +
  "Project folder (READ ONLY: never edit, create or delete anything in it, and never run builds, tests, installs, servers or apps): " + REPO + "\n" +
  "Evidence rules. Write only what you established. Every statement about current behaviour ends with its source in brackets: (path:line) for code you opened, or (doc: path) for a project document. Mark a statement that is your reasoning with [inferred] and your own suggestion with [proposed]. If you could not establish something, write 'unknown' and add it to unknowns; never guess. Nothing counts as run or tested unless a file records it. Never invent a file, symbol, endpoint, table, flag or behaviour. Record configuration names and purposes only, never a secret value. Do not write specific model identifiers or version names.\n" +
  "Keep two things apart: whether the code exists and is connected (current_implementation), and whether anyone has verified it (verification lists only tests that exist and scenarios to run; do not claim results).\n" +
  "Writing rules. Plain words, short sentences, no jargon without a few words of explanation. Each field must make sense read alone: name the feature and the app, never 'as above'.\n" +
  "Names for depends_on and relationships: apps are surface:web, surface:desktop, surface:mobile, surface:cli, surface:vscode, surface:chrome; modes are mode:local, mode:own-key, mode:cloud; plans are plan:<name>; files are file:<path>; endpoints are api:<METHOD> <path>; database tables are table:<name>; device stores are store:<name>; providers are provider:<folder name under packages/ai/providers>; tests are test:<path>; other features by their id (F013-02); system pages by id: SYS-model-catalog-and-routing, SYS-inference-providers, SYS-local-inference, SYS-execution-boundaries, SYS-subscriptions-entitlements-and-usage, SYS-authentication-and-identity, SYS-authorization-and-workspaces, SYS-data-model-and-migrations, SYS-api-and-contracts, SYS-chat-turn-pipeline, SYS-agents-tools-and-automation, SYS-connectors-plugins-and-skills, SYS-files-artifacts-and-storage, SYS-memory-projects-and-context, SYS-voice-and-media, SYS-sync-and-continuity, SYS-observability-and-operations, SYS-security-and-privacy, SYS-shared-ui-and-design.\n";
function prompt(job) {
  return "Write the knowledge-base pages for " + job.features.length + " features of the product area '" + job.area_title + "' of AGI Workforce. A page must let an engineer, a tester or an LLM answer: what is this feature, why does it exist, how does a person use it, how does it work inside, how should it work, where is it implemented, what does it depend on, how do models, providers, subscriptions and local inference affect it, what is missing, and how can it be verified.\n\n" + RULES +
    "\nStart from the area brief " + BRIEFS + "/" + job.slug + ".md: it lists every item of the area with its id, what should happen ('Should'), its status in each app and where its code is. Then read the code.\n\n" +
    "The features (id, name, the brief items that belong to it, and a first draft of its use and behaviour that you must check against the code and correct):\n" + JSON.stringify(job.features, null, 1) + "\n\n" +
    "For EACH feature return one entry with exactly its id and:\n" +
    "- aliases: other names for it in the interface, in code and in the brief.\n- summary: at most 60 words, understandable alone.\n" +
    "- purpose: what it does, why it exists, who uses it, the problems it solves, 2 to 4 representative use cases.\n" +
    "- user_experience: where to find it on each app that has it (exact visible labels from the code); prerequisites; the screens and controls; the journey as ordered steps from starting the task to getting the result; the feedback and outputs the person sees; related settings.\n" +
    "- current_implementation: what works in the code today, what is incomplete, what exists but is disconnected or switched off, and what is not available (say on which apps), each with its source.\n" +
    "- required_behaviour: established requirements (the brief's 'Should' lines, citing the item id, and project documents under docs/product or docs/decisions, citing the path); acceptance_criteria a tester can check (3 to 8); inferred requirements; proposed improvements.\n" +
    "- implementation_map: the files, components, hooks, stores, services, endpoints, schemas, tables, events, background jobs, integrations, commands and settings that implement it, each with its path and role (8 to 25 entries, across the apps).\n" +
    "- execution_and_data_flow: the steps from the person's action to the result, each marked as running on the device, our servers or an outside service, with evidence; the data created and where it is stored, whether it syncs, how it is kept or deleted; and how models and providers take part.\n" +
    "- access_and_usage: account requirement; permissions; subscription entitlement; limits and metering; feature flags; model compatibility; provider restrictions; and exactly what happens in Local mode. Write 'none found in the code' where the code has no rule.\n" +
    "- states_and_edge_cases: loading, empty, success, error, retry, cancel, timeout, offline, reconnect, recovery, and accessibility or app differences, where the code handles them; say 'not handled in the code' where you looked and found nothing.\n" +
    "- verification: existing test files that cover it and what each covers (search the test folders); 3 to 6 test scenarios with steps and the expected result; where to look when it fails (log lines, error names, tables).\n" +
    "- gaps: each difference between current and required behaviour: what, which users and apps it affects, the evidence, and the work needed.\n" +
    "- depends_on and relationships (at least 8 relationships with evidence), and unknowns.";
}
const chunks = await parallel(JOBS.map((job) => () => agent(prompt(job), { label: "F" + job.area + ":" + job.n + " " + job.slug.slice(4, 30), phase: "Features", schema: OUT, model: "sonnet" }).then((r) => ({ area: job.area, slug: job.slug, n: job.n, asked: job.features.map((f) => f.id), features: r ? r.features : [] }))));
const done = chunks.filter(Boolean);
log("feature pages returned: " + done.reduce((n, c) => n + c.features.length, 0) + " of " + JOBS.reduce((n, j) => n + j.features.length, 0));
return { chunks: done };
'''
size = (len(jobs) + PARTS - 1) // PARTS if jobs else 0
for p in range(PARTS):
    part = jobs[p * size:(p + 1) * size]
    if not part: continue
    out = KB / f"tools/workflows/features-{p + 1}.js"
    out.write_text(JS.replace("__PART__", str(p + 1)).replace("__JOBS__", json.dumps(part)))
    print(out.name, len(part), "agents,", sum(len(j["features"]) for j in part), "features,", out.stat().st_size, "bytes")
print("features still to write:", sum(len(j["features"]) for j in jobs), "| already written:", len(done))
