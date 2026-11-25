#!/usr/bin/env python3
"""Render 20-features: one page per area, one page per feature, and the catalog.
Reads 20-features/registry.json, data/raw/feature-guide*.json (area pages) and
data/raw/features-deep-*.json (the ten-section pages). Safe to re-run."""
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kb_lib import *

reg = json.loads((KB / "20-features/registry.json").read_text())["features"]
areas = {}
for name in ("feature-guide-pilot", "feature-guide", "feature-guide-retry"):
    for p in (load_raw(name) or {}).get("pages", []):
        if p and p.get("guide") and (name != "feature-guide-pilot" or p.get("model") == "sonnet"):
            areas[p["slug"]] = p["guide"]
deep = {}
for f in sorted(RAW.glob("features-deep-*.json")):
    for chunk in (json.loads(f.read_text()).get("result") or {}).get("chunks", []):
        for x in chunk.get("features", []):
            deep[x["id"].strip()] = x
for x in ((load_raw("review-applied") or {}).get("chunks") or [{}])[0].get("features", []):
    if x and x.get("id"): deep[x["id"].strip()] = x; deep[x["id"].strip()]["_corrected"] = True
items = {it["id"]: it for it in ledger_items()}

def req_source(r, f):
    src = one_line(r["source"])
    if "area-briefs" in src or "area brief" in src.lower():
        ids = sorted(set(re.findall(r"S\d+\.\d+", r["statement"] + " " + src))) or f["items"]
        return "capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item " + ", ".join(ids)
    return src
review = {p["id"]: p["review"] for p in (load_raw("review") or {}).get("pages", []) if p and p.get("review")}
LABEL = {"built": "built", "partial": "partly built", "missing": "not built", "n/a": "does not apply"}


def bullets(xs, empty="none found"):
    xs = [x for x in (xs or []) if str(x).strip()]
    return [f"- {one_line(x)}" for x in xs] or [f"- {empty}"]


def numbered(xs, empty="not written"):
    xs = [x for x in (xs or []) if str(x).strip()]
    return [f"{i}. {one_line(x)}" for i, x in enumerate(xs, 1)] or [f"- {empty}"]


def status_table(f):
    led = f.get("implementation_ledger", f["implementation"]); pg = f.get("implementation_page")
    if not pg:
        rows = ["| App | In the code (ledger audit of 2026-09-26, updated since) | Seen working by a person |", "|---|---|---|"]
        return rows + [f"| {n} | {LABEL[led[k]]} | {f['verification'][k]} |" for k, n in APPS]
    rows = ["| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |", "|---|---|---|---|"]
    for k, n in APPS:
        mark = " **(disagrees with the ledger on whether it exists)**" if k in f.get("status_differs", []) else " (this page lists unfinished parts)" if k in f.get("status_unfinished_noted", []) else ""
        rows.append(f"| {n} | {LABEL.get(pg[k], 'not stated on this page')}{mark} | {LABEL[led[k]]} | {f['verification'][k]} |")
    rows += ["", "The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result."]
    if f.get("status_differs"):
        rows += ["Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md)."]
    return rows


def feature_file(f):
    return f"20-features/{f['area_slug']}/{f['id']}-{f['slug']}.md"


def render_feature(f):
    d = deep.get(f["id"])
    fm = front_matter(id=f["id"], type="feature", title=f["name"], aliases=(d or {}).get("aliases", []), area=f"{f['area']} {f['area_title']}",
                      available_on=f["available_on"], implementation=f["implementation"], verification=f["verification"], requirement_items=f["items"],
                      depends_on=(d or {}).get("depends_on", []), basis="code inspection" if d else "area draft, code not re-read per feature",
                      second_reader=(f"{sum(1 for c in review[f['id']]['checked'] if c['verdict'] == 'correct')} of {len(review[f['id']]['checked'])} sampled statements were correct; the others were corrected on this page" if f["id"] in review else "not sampled: statements are code readings that nobody has re-checked"),
                      last_reviewed=TODAY, revision=HEAD)
    o = [fm + f"# {f['id']} {f['name']}", "", (d or {}).get("summary") or f["use"], "",
         f"Area: [{f['area']}. {f['area_title']}](README.md). Requirement items: " + ", ".join(f"[{i}](../../10-requirements/capabilities/{f['area_slug']}.md#{i.lower().replace('.', '')})" for i in f["items"]) + ".", "",
         "## Status", "", "Two separate questions: is the code there, and has a person seen it work. \"Seen working\" comes only from results of real runs recorded in the project's ledger.", ""] + status_table(f) + [""]
    if not d:
        o += ["## Draft", "", "This page has only the area-level draft. The ten sections have not been written from the code for this feature yet.", "",
              "**Use.** " + f["use"], "", "**How people use it**", ""] + numbered(f["how_people_use_it"]) + ["", "**How it should work**", ""] + bullets(f["how_it_should_work"]) + ["", "**On each app.** " + (f["on_each_app"] or "not written"), ""]
        return "\n".join(o)
    p, ux, cur, req = d["purpose"], d["user_experience"], d["current_implementation"], d["required_behaviour"]
    o += ["## 1. Purpose and user value", "", f"**What it does.** {one_line(p['what_it_does'])}", "", f"**Why it exists.** {one_line(p['why_it_exists'])}", "", f"**Who uses it.** {one_line(p['who_uses_it'])}", "",
          "**Problems it solves**", ""] + bullets(p["problems_solved"]) + ["", "**Use cases**", ""] + bullets(p["use_cases"]) + [""]
    o += ["## 2. User experience", "", "**Where to find it**", ""] + bullets(ux["where_to_find_it"]) + ["", "**Before you start**", ""] + bullets(ux["prerequisites"], "nothing needed") + ["", "**Screens and controls**", ""] + bullets(ux["screens_and_controls"]) + \
         ["", "**Journey**", ""] + numbered(ux["journey"]) + ["", "**What the person sees and gets**", ""] + bullets(ux["feedback_and_outputs"]) + ["", "**Settings**", ""] + bullets(ux["settings"], "no settings") + [""]
    o += ["## 3. Current implementation", "", "From reading the code. Not a test result.", "", "**Working in the code**", ""] + bullets(cur["working"]) + ["", "**Incomplete**", ""] + bullets(cur["incomplete"], "nothing found") + \
         ["", "**Present but disconnected or switched off**", ""] + bullets(cur["disconnected_or_disabled"], "nothing found") + ["", "**Not available**", ""] + bullets(cur["not_available"], "nothing found") + [""]
    o += ["## 4. Required behaviour", "", "**Established requirements**", ""] + ([f"- {one_line(r['statement'])} (source: {req_source(r, f)})" for r in req["established"]] or ["- none recorded"]) + \
         ["", "**Acceptance criteria**", ""] + numbered(req["acceptance_criteria"]) + ["", "**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)", ""] + bullets(req["inferred"], "none") + \
         ["", "**Proposed improvements** (suggestions, not requirements)", ""] + bullets(req["proposed"], "none") + [""]
    o += ["## 5. Implementation map", "", "| Kind | Name | Path | Role |", "|---|---|---|---|"]
    for m in d["implementation_map"]:
        ok = exists(m["path"])
        o.append(f"| {m['kind']} | {one_line(m['name']).replace('|', '/')} | `{one_line(m['path'])}`{'' if ok else ' (not found)'} | {one_line(m['role']).replace('|', '/')} |")
    fl = d["execution_and_data_flow"]
    o += ["", "## 6. Execution and data flow", "", "| Step | Runs on | Source |", "|---|---|---|"]
    o += [f"| {one_line(s['what_happens']).replace('|', '/')} | {s['runs_on']} | {one_line(s['evidence']).replace('|', '/')} |" for s in fl["steps"]]
    o += ["", "**Data**", "", "| What | Stored in | Synced | Kept or deleted |", "|---|---|---|---|"]
    o += [f"| {one_line(x['what']).replace('|', '/')} | {one_line(x['where_stored']).replace('|', '/')} | {one_line(x['synced']).replace('|', '/')} | {one_line(x['retained_or_deleted']).replace('|', '/')} |" for x in fl["data"]] or ["| nothing stored | | | |"]
    o += ["", f"**Models and providers.** {one_line(fl['models_and_providers'])}", ""]
    a = d["access_and_usage"]
    o += ["## 7. Access and usage rules", "", "| Rule | What the code does |", "|---|---|"]
    for k, lab in (("account", "Account"), ("permissions", "Permissions"), ("subscription", "Subscription"), ("limits_and_metering", "Limits and metering"), ("flags", "Feature flags"), ("model_compatibility", "Model compatibility"), ("provider_restrictions", "Provider restrictions"), ("local_mode", "Local mode")):
        o.append(f"| {lab} | {one_line(a[k]).replace('|', '/')} |")
    o += ["", "## 8. States and edge cases", "", "| State | Behaviour | Source |", "|---|---|---|"]
    o += [f"| {one_line(s['state']).replace('|', '/')} | {one_line(s['behaviour']).replace('|', '/')} | {one_line(s['evidence']).replace('|', '/')} |" for s in d["states_and_edge_cases"]] or ["| none recorded | | |"]
    v = d["verification"]
    o += ["", "## 9. Verification", "", "What has actually been seen by a person is in the Status table above. This section lists what exists to check with.", "", "**Existing tests**", ""]
    o += [f"- `{one_line(t['path'])}`{'' if exists(t['path']) else ' (not found)'}: {one_line(t['covers'])}" for t in v["existing_tests"]] or ["- none found"]
    o += ["", "**Test scenarios**", ""]
    for s in v["scenarios"]:
        o += [f"- **{one_line(s['name'])}**"] + [f"  {i}. {one_line(st)}" for i, st in enumerate(s["steps"], 1)] + [f"  - Expected: {one_line(s['expected'])}"]
    o += ["", "**Where to look when it fails**", ""] + bullets(v["diagnostics"]) + ["", "**Hands-on test plans**", ""]
    has_plan = lambda k: (KB / "70-qa/test-plans" / k / f"{f['area_slug']}.md").exists()
    o += [f"- {n}: [70-qa/test-plans/{k}/{f['area_slug']}.md](../../70-qa/test-plans/{k}/{f['area_slug']}.md)" for k, n in APPS if f["implementation"][k] in ("built", "partial") and has_plan(k)] or ["- none: not built on any app"]
    no_plan = [n for k, n in APPS if f["implementation"][k] in ("built", "partial") and not has_plan(k)]
    if no_plan: o.append(f"- No hands-on plan yet for {', '.join(no_plan)}: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.")
    o += ["", "## 10. Gaps and dependencies", ""]
    o += [f"- **{one_line(g['gap'])}** Affects: {one_line(g['affects'])}. Evidence: {one_line(g['evidence'])}. Work needed: {one_line(g['work_needed'])}" for g in d["gaps"]] or ["- no gap found by reading the code"]
    missing_on = [n for k, n in APPS if f["implementation"][k] == "missing"]
    if missing_on: o.append(f"- Not built on: {', '.join(missing_on)} (from the capability ledger).")
    o += ["", "**Depends on**", ""] + bullets(d["depends_on"], "nothing recorded") + ["", "## Unknown", ""] + bullets(d["unknowns"], "nothing listed") + [""]
    rv = review.get(f["id"])
    if rv:
        bad = [c for c in rv["checked"] if c["verdict"] in ("wrong", "partly wrong")]
        o += ["## Second reader's check", "", f"A second reader checked {len(rv['checked'])} statements of this page against the code: {sum(1 for c in rv['checked'] if c['verdict'] == 'correct')} correct, {len(bad)} wrong or partly wrong, {sum(1 for c in rv['checked'] if c['verdict'] == 'could not check')} could not be checked. " + ("The statements found wrong were corrected on this page; they are listed here for the record." if d.get("_corrected") else "Where a statement above conflicts with a correction below, the correction is right."), ""]
        o += [f"- **{c['verdict'].capitalize()} (section {one_line(c['section'])}):** \"{one_line(c['claim'])}\" The code shows: {one_line(c['what_the_code_shows'])} ({one_line(c['evidence'])}). **Corrected:** {one_line(c['correction'])}" for c in bad] or ["- No wrong statement found in the sample."]
        if rv["missing_important_fact"]: o += ["", "**Facts the page missed**", ""] + bullets(rv["missing_important_fact"])
        o.append("")
    return "\n".join(o)


def render_area(sec, slug, fs):
    g = areas.get(slug)
    built = {k: sum(1 for f in fs if f["implementation"][k] in ("built", "partial")) for k in APP_KEYS}
    o = [front_matter(id=f"AREA-{int(sec):03d}", type="area", title=area_title(sec), features=[f["id"] for f in fs], basis="code inspection" if g else "not written", last_reviewed=TODAY, revision=HEAD) + f"# {sec}. {area_title(sec)}", ""]
    if g:
        o += [one_line(g["what_it_is_for"]), "", "**Who uses it.** " + one_line(g["who_uses_it"]), ""]
    o += ["## Features in this area", "", "| ID | Feature | " + " | ".join(n for _, n in APPS) + " |", "|---|---|" + "---|" * len(APPS)]
    short = {"built": "built", "partial": "partly", "missing": "no", "n/a": "n/a"}
    for f in fs:
        o.append(f"| [{f['id']}]({f['id']}-{f['slug']}.md) | {f['name']} | " + " | ".join(short[f["implementation"][k]] for k in APP_KEYS) + " |")
    o += ["", "Requirement items for this area: [10-requirements/capabilities/" + slug + ".md](../../10-requirements/capabilities/" + slug + ".md).", ""]
    if g:
        o += ["## How this area works in the code", ""]
        for i, s in enumerate(g["how_it_works"], 1):
            refs = ", ".join(f"`{r}`" + ("" if exists(r) else " (not found)") for r in s["code"])
            o.append(f"{i}. **{one_line(s['step'])}.** {one_line(s['detail'])} ({refs})")
        o += ["", "## Files to know", "", "| File | Role |", "|---|---|"] + [f"| `{k['path']}`{'' if exists(k['path']) else ' (not found)'} | {one_line(k['role']).replace('|', '/')} |" for k in g["key_files"]]
        o += ["", "## What is stored", ""] + ([f"- {one_line(x['what'])}: {one_line(x['where'])}" for x in g["data_kept"]] or ["- nothing found"])
        o += ["", "## Switches", "", "Plan gates, flags and settings that turn parts of this area on or off.", ""] + ([f"- **{one_line(x['name'])}**: {one_line(x['effect'])} ({one_line(x['where'])})" for x in g["switches"]] or ["- none found"])
        o += ["", "## Shared between apps", "", one_line(g["shared_code"]), "", "## Looks wrong in the code", "", "From reading only; not confirmed in the running app. Each line is also in the gap register.", ""]
        o += [f"- {one_line(w['what'])} ({one_line(w['where'])})" for w in g["things_that_look_wrong"]] or ["- nothing noticed"]
        o += ["", "## Not established", ""] + bullets(g["not_sure"], "nothing listed")
    return "\n".join(o) + "\n"


by_area = {}
for f in reg: by_area.setdefault((f["area"], f["area_slug"]), []).append(f)
for (sec, slug), fs in by_area.items():
    d = KB / "20-features" / slug
    if d.exists():
        for old in d.glob("F*.md"): old.unlink()
    write(f"20-features/{slug}/README.md", render_area(sec, slug, fs))
    for f in fs: write(feature_file(f), render_feature(f))

cat = [{"id": f["id"], "name": f["name"], "aliases": (deep.get(f["id"]) or {}).get("aliases", []), "description": (deep.get(f["id"]) or {}).get("summary") or f["use"], "area": f["area"], "area_title": f["area_title"],
        "implementation": f["implementation"], "implementation_basis": f.get("status_basis", "ledger audit"), "implementation_ledger_audit": f.get("implementation_ledger", f["implementation"]), "existence_disagrees_with_ledger_on": f.get("status_differs", []), "page_lists_unfinished_parts_on": f.get("status_unfinished_noted", []), "implementation_page_reading": f.get("implementation_page", {}), "verification": f["verification"], "available_on": f["available_on"], "requirement_items": f["items"], "page": feature_file(f), "written": f["id"] in deep} for f in reg]
write("20-features/catalog.json", json.dumps({"built_on": BUILT_ON, "built_at_commit": BUILT_AT, "content_read_on": TODAY, "content_read_at_commit": HEAD, "features": cat}, indent=1))
o = [front_matter(id="CATALOG-features", type="catalog", title="Feature catalog", last_reviewed=TODAY, revision=HEAD) + "# Feature catalog", "",
     f"{len(reg)} features in {len(by_area)} product areas. Each has a stable identifier that never changes. Columns give the state of the code per app: built, partly, no (not built), n/a. Whether a person has seen it work is on each feature's page.", "",
     "Machine-readable copy: [catalog.json](catalog.json). Identifier registry: [registry.json](registry.json).", ""]
short = {"built": "built", "partial": "partly", "missing": "no", "n/a": "n/a"}
for (sec, slug), fs in sorted(by_area.items(), key=lambda kv: int(kv[0][0])):
    o += [f"## {sec}. {area_title(sec)}", "", f"[Area page]({slug}/README.md)", "", "| ID | Feature | " + " | ".join(n for _, n in APPS) + " |", "|---|---|" + "---|" * len(APPS)]
    o += [f"| [{f['id']}]({slug}/{f['id']}-{f['slug']}.md) | {f['name']} | " + " | ".join(short[f["implementation"][k]] for k in APP_KEYS) + " |" for f in fs] + [""]
write("20-features/README.md", "\n".join(o))
print(f"areas {len(by_area)} | features {len(reg)} | with ten-section page {sum(1 for f in reg if f['id'] in deep)}")
