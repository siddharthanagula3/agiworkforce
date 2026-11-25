export const meta = {
  name: "kb-apply-review",
  description: "Apply the second reader's corrections to the data behind the reviewed pages, so the corrected statement replaces the wrong one",
  phases: [
    { title: "Features", detail: "one agent per reviewed feature page", model: "sonnet" },
    { title: "Pages", detail: "one agent per core page named in a contradiction", model: "sonnet" },
  ],
};
const FJOBS = ["F002-08", "F004-08", "F006-07", "F008-09", "F010-10", "F012-10", "F014-09", "F016-09", "F020-04", "F022-08", "F024-12", "F027-04", "F029-04", "F031-04", "F033-04", "F035-09", "F037-12", "F039-12", "F042-02", "F044-06", "F046-07", "F048-08", "F050-09", "F052-10", "F054-10", "F056-11", "F059-02", "F061-05", "F063-09", "F066-11", "F069-01", "F071-01", "F073-01", "F076-02", "F079-05", "F082-11", "F084-12", "F086-12", "F089-01", "F091-01", "F093-05", "F095-07", "F099-01", "F102-04", "F104-06", "F106-08", "F108-09", "F110-09"];
const DJOBS = ["SURF-web", "SURF-vscode", "SURF-cli", "SURF-desktop", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-local-inference", "SYS-model-catalog-and-routing", "REF-product-requirements-sources", "REF-glossary"];
const IN = "~/Desktop/agiworkforce/knowledge-base/data/review-inputs";
const REPO = "~/Desktop/agiworkforce";
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
const DOC = {
  type: "object",
  properties: {
    summary: { type: "string" },
    sections: { type: "array", items: { type: "object", properties: { heading: { type: "string" }, markdown: { type: "string" } }, required: ["heading", "markdown"] } },
    key_facts: { type: "array", items: { type: "object", properties: { fact: { type: "string" }, basis: { type: "string", enum: ["executed", "code", "requirement", "competitor", "inferred", "proposed", "unknown"] }, evidence: { type: "array", items: { type: "string" } } }, required: ["fact", "basis", "evidence"] } },
    relationships: { type: "array", items: { type: "object", properties: { from: { type: "string" }, rel: { type: "string", enum: ["implemented_by", "depends_on", "available_on", "uses_provider", "governed_by_subscription", "stores_data_in", "tested_by", "blocked_by", "exposes_api", "configured_by", "documented_in"] }, to: { type: "string" }, evidence: { type: "array", items: { type: "string" } } }, required: ["from", "rel", "to", "evidence"] } },
    open_questions: { type: "array", items: { type: "string" } },
    outdated_documents: { type: "array", items: { type: "object", properties: { document: { type: "string" }, what_is_outdated: { type: "string" }, what_the_code_says: { type: "string" }, evidence: { type: "string" } }, required: ["document", "what_is_outdated", "what_the_code_says", "evidence"] } },
  },
  required: ["summary", "sections", "key_facts", "relationships", "open_questions", "outdated_documents"],
};

const feats = parallel(FJOBS.map((id) => () => agent(
  "A page of a knowledge base about the AGI Workforce codebase was checked by a second reader. Read " + IN + "/" + id + ".json. It holds: 'feature' (the page's data, a JSON object), 'corrections' (statements found wrong or partly wrong, each with what the code shows, the evidence and the corrected statement) and 'missing_facts'.\n" +
  "Return the feature object again, complete and in the same shape, with every correction applied where the wrong statement appears (in whichever field holds it: current_implementation, execution_and_data_flow, access_and_usage, states_and_edge_cases, user_experience, implementation_map, verification or gaps) and each missing fact added to the field where it belongs, with its source in brackets. Change nothing else: keep every other statement, entry and the id exactly as they are. If a correction says a cited line is wrong, fix the citation. You may open the code at " + REPO + " (READ ONLY) to place a correction exactly; do not edit any file.",
  { label: "fix:" + id, phase: "Features", schema: FEATURE, model: "sonnet" }).then((r) => (r && r.id === id ? r : null))));
const docs = parallel(DJOBS.map((id) => () => agent(
  "A page of a knowledge base about the AGI Workforce product was checked for consistency with other pages. Read " + IN + "/" + id + ".json. It holds: 'page' (the page's data: summary, sections, key_facts, relationships, open_questions, outdated_documents) and 'issues' (contradictions with other pages, each saying which page is right and citing the code, and unclear or misleading statements with a fix).\n" +
  "For each issue that concerns THIS page (" + id + "): open the cited code at " + REPO + " (READ ONLY; never edit a file) and confirm it, then correct the page's summary, sections and key_facts so they say what the code shows. Where the issue says another page is right, bring this page into line. Use public plan names in prose with the stored id once in backticks. Change nothing else. Return the whole page in the same shape.",
  { label: "fix:" + id, phase: "Pages", schema: DOC, model: "sonnet" }).then((r) => (r ? { id, doc: r } : null))));
const [f, d] = await Promise.all([feats, docs]);
const fs = f.filter(Boolean), ds = d.filter(Boolean);
log("feature pages corrected: " + fs.length + " of " + FJOBS.length + "; core pages corrected: " + ds.length + " of " + DJOBS.length);
return { chunks: [{ features: fs }], pages: ds };
