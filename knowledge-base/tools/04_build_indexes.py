#!/usr/bin/env python3
"""Build everything that is derived from the pages and the data:
80-gaps (gap register), graph/ (nodes and edges), index.json and index.md,
90-meta/coverage.* and 90-meta/checks.* (links, identifiers, cited files). Safe to re-run."""
import collections, csv, json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kb_lib import *

reg = json.loads((KB / "20-features/registry.json").read_text())["features"] if (KB / "20-features/registry.json").exists() else []
feat = {f["id"]: f for f in reg}
feat_of_item = {i: f for f in reg for i in f["items"]}
items = {it["id"]: it for it in ledger_items()}
deep = {}
for f in sorted(RAW.glob("features-deep-*.json")):
    for chunk in (json.loads(f.read_text()).get("result") or {}).get("chunks", []):
        for x in chunk.get("features", []): deep[x["id"].strip()] = x
areas = {}
for name in ("feature-guide-pilot", "feature-guide", "feature-guide-retry"):
    for p in (load_raw(name) or {}).get("pages", []):
        if p and p.get("guide") and (name != "feature-guide-pilot" or p.get("model") == "sonnet"): areas[p["slug"]] = p["guide"]
capsf = KB / "50-competitors/capabilities.json"
caps = json.loads(capsf.read_text())["capabilities"] if capsf.exists() else []
NAME = dict(APPS)


def fpage(f):
    return f"20-features/{f['area_slug']}/{f['id']}-{f['slug']}.md"


# ---------------- gaps ----------------
gaps = []
def add(gid, kind, title, source, basis, apps=(), features=(), items_=(), evidence="", detail="", size=""):
    gaps.append({"id": gid, "kind": kind, "title": one_line(title)[:300], "detail": one_line(detail)[:900], "apps": list(apps), "features": list(features), "requirement_items": list(items_),
                 "source": source, "basis": basis, "evidence": one_line(evidence)[:400], "size": size, "status": "open"})

ledger_fix = []
for f in reg:
    for a in f.get("status_differs", []):
        ledger_fix.append({"feature": f["id"], "name": f["name"], "app": a, "ledger_says": f["implementation_ledger"][a], "page_says": f["implementation_page"][a], "quote": f.get("status_quotes", {}).get(a, ""), "items": f["items"]})
for f in reg:
    final = f["implementation"]; flips = set(f.get("status_differs", []))
    miss = {a: ([i for i in f["items"] if cell_status(items[i].get("cells"), a) == "missing"] if a not in flips else (list(f["items"]) if final[a] == "missing" else [])) for a in APP_KEYS}
    part = {a: [i for i in f["items"] if cell_status(items[i].get("cells"), a) in ("partial", "unverified")] for a in APP_KEYS}
    if any(miss.values()):
        add(f"GAP-{f['id']}-NOTBUILT", "not built on an app", f"{f['name']}: not built on " + ", ".join(NAME[a] for a in APP_KEYS if miss[a]), "capability ledger", "code",
            apps=[a for a in APP_KEYS if miss[a]], features=[f["id"]], items_=sorted({i for v in miss.values() for i in v}), detail="; ".join(f"{NAME[a]}: {', '.join(v)}" for a, v in miss.items() if v))
    if any(part.values()):
        notes = []
        for a in APP_KEYS:
            for i in part[a]:
                c = items[i]["cells"][a]; r = c.get("remaining") or c.get("miss")
                if r: notes.append(f"{NAME[a]} {i}: {r}")
        add(f"GAP-{f['id']}-PARTLY", "partly built", f"{f['name']}: partly built on " + ", ".join(NAME[a] for a in APP_KEYS if part[a]), "capability ledger", "code",
            apps=[a for a in APP_KEYS if part[a]], features=[f["id"]], items_=sorted({i for v in part.values() for i in v}), detail=" | ".join(notes))
    for n, g in enumerate((deep.get(f["id"]) or {}).get("gaps", []), 1):
        add(f"GAP-{f['id']}-{n:02d}", "current behaviour differs from required", g["gap"], "feature page (code reading)", "code", features=[f["id"]], evidence=g["evidence"], detail=f"Affects: {g['affects']}. Work needed: {g['work_needed']}")
for slug, g in areas.items():
    sec = str(int(slug[:3]))
    for n, w in enumerate(g["things_that_look_wrong"], 1):
        if re.search(r"\bbrief\b|\bledger\b", w["what"], re.I):
            ledger_fix.append({"feature": f"AREA-{int(sec):03d}", "name": area_title(sec), "app": "", "ledger_says": "", "page_says": one_line(w["what"]), "quote": one_line(w["where"]), "items": []}); continue
        add(f"GAP-AREA{int(sec):03d}-LW{n:02d}", "looks wrong in the code", w["what"], "area page (code reading)", "code", evidence=w["where"], detail=f"Area {sec}. {area_title(sec)}", features=[f"AREA-{int(sec):03d}"])
comp_dir = KB / "50-competitors/data"
cap_by_cmp = collections.defaultdict(list)
for c in caps:
    for i in c["comparison_ids"]: cap_by_cmp[i.strip()].append(c)
    if c["gap"] and c["gap"].lower() not in ("none known", "none", "none known."):
        fs = sorted({feat_of_item[i]["id"] for i in c["ledger_ids"] if i in feat_of_item})
        add(f"GAP-{c['id']}", "behind a competitor", f"{c['name']}: {c['gap']}", "competitor trace", "competitor", features=fs, items_=c["ledger_ids"], detail=f"Claude {c['claude']}, ChatGPT {c['chatgpt']}; AGI {c['agi_status']}")
for fn, kind in (("missing-in-agi.csv", "missing compared with Claude or ChatGPT"), ("partly-there.csv", "partly there compared with Claude or ChatGPT")):
    if (comp_dir / fn).exists():
        for r in read_csv(comp_dir / fn):
            cs = cap_by_cmp.get(r["id"], [])
            fs = sorted({feat_of_item[i]["id"] for c in cs for i in c["ledger_ids"] if i in feat_of_item})
            add(f"CMP-{r['id']}", kind, r["feature"], "comparison of 2026-11-22", "competitor", apps=[r["app"].lower().replace(" ", "")], features=fs, detail=(r.get("gap") or "") + " " + (r.get("difference") or ""), evidence=r.get("evidence", ""), size="both leaders" if r.get("who_ships_it") == "Both" else r.get("who_ships_it", ""))
qd = KB / "70-qa/defects"
if (qd / "code-audit-defects.csv").exists():
    for n, r in enumerate(read_csv(qd / "code-audit-defects.csv"), 1):
        add(f"DEF-{n:03d}", "defect found by reading code", r["title"], "code audit of 2026-11-22", "code", apps=[r["surface"].lower()], evidence=r["location"], detail=f"Expected: {r['expected']} Actual: {r['actual']}", size=r["severity"])
if (qd / "web-problems-seen-in-browser.csv").exists():
    for n, r in enumerate(read_csv(qd / "web-problems-seen-in-browser.csv"), 1):
        add(f"SEEN-WEB-{n:03d}", "problem seen in the running app", r["title"], f"Web basics run {r['run']} ({r['basic']}, {r['mode']})", "executed", apps=["web"], evidence=r["evidence_folder"], detail=f"On screen: {r['exact_text_on_screen']} Steps: {r['steps_to_reproduce']}", size=r["size"])
write("80-gaps/gaps.jsonl", "\n".join(json.dumps(g) for g in gaps))
kinds = collections.Counter(g["kind"] for g in gaps)
o = [front_matter(id="GAPS", type="gap-register", title="Gap register", last_reviewed=TODAY, revision=HEAD) + "# Gap register", "",
     f"{len(gaps)} open gaps, each with an identifier, its source, the kind of evidence behind it, and the features and requirement items it affects. Machine-readable: [gaps.jsonl](gaps.jsonl). One page per product area is in [by-area/](by-area/).", "",
     "| Kind of gap | Count | Evidence |", "|---|---:|---|"]
basis_of = {"executed": "seen in a real run", "code": "read in the code", "competitor": "competitor evidence"}
for k, n in kinds.most_common():
    o.append(f"| {k} | {n} | {basis_of[next(g['basis'] for g in gaps if g['kind'] == k)]} |")
o += ["", "## Identifiers", "", "- `GAP-F013-02-01`: a gap written on that feature's page. `-NOTBUILT` and `-PARTLY` come from the capability ledger.", "- `GAP-AREA013-LW01`: something that looks wrong in the code of an area.",
      "- `GAP-CAP-<topic>-NN`: behind a competitor, from the competitor trace.", "- `CMP-W12`, `CMP-WP30`: lines of the comparison lists (`50-competitors/data`).", "- `DEF-001`: a defect found by reading code on 2026-11-22.", "- `SEEN-WEB-001`: a problem seen while using the Web app.", "",
      "A gap closes when the cause is fixed in the code and a person has seen the feature work. Then its line is removed here and the result is recorded in `70-qa/results`.", ""]
write("80-gaps/README.md", "\n".join(o))
by_area_g = collections.defaultdict(list)
for g in gaps:
    secs = {feat[x]["area"] for x in g["features"] if x in feat} | {str(int(x[5:])) for x in g["features"] if x.startswith("AREA-")}
    for s in secs: by_area_g[s].append(g)
for old in (KB / "80-gaps/by-area").glob("*.md") if (KB / "80-gaps/by-area").exists() else []: old.unlink()
for sec, gs in by_area_g.items():
    o = [front_matter(id=f"GAPS-AREA-{int(sec):03d}", type="gap-list", title=f"Gaps: {area_title(sec)}", last_reviewed=TODAY, revision=HEAD) + f"# Gaps: {sec}. {area_title(sec)}", "", f"{len(gs)} open gaps that touch this area. Area page: [20-features/{area_slug(sec)}](../../20-features/{area_slug(sec)}/README.md).", ""]
    for g in sorted(gs, key=lambda g: g["id"]):
        links = ", ".join(f"[{x}](../../{fpage(feat[x])})" if x in feat else x for x in g["features"])
        o += [f"## {g['id']}", "", f"**{g['title']}**", "", f"- Kind: {g['kind']} ({basis_of.get(g['basis'], g['basis'])}; source: {g['source']})"] + ([f"- Apps: {', '.join(NAME.get(a, a) for a in g['apps'])}"] if g["apps"] else []) + \
             ([f"- Features: {links}"] if links else []) + ([f"- Requirement items: {', '.join(g['requirement_items'])}"] if g["requirement_items"] else []) + ([f"- Detail: {g['detail']}"] if g["detail"] else []) + ([f"- Evidence: {g['evidence']}"] if g["evidence"] else []) + [""]
    write(f"80-gaps/by-area/{area_slug(sec)}.md", "\n".join(o))

# ---------------- graph ----------------
nodes, edges = {}, []
def node(i, t, title="", path=""):
    if i not in nodes: nodes[i] = {"id": i, "type": t, "title": one_line(title), "path": path}
def edge(a, rel, b, evidence=(), basis="code", source=""):
    edges.append({"from": a, "rel": rel, "to": b, "evidence": [one_line(e) for e in (evidence if isinstance(evidence, (list, tuple)) else [evidence]) if e], "basis": basis, "source": source})
def typed(i):
    for p, t in (("surface:", "app"), ("mode:", "mode"), ("plan:", "plan"), ("file:", "file"), ("api:", "endpoint"), ("table:", "table"), ("store:", "store"), ("provider:", "provider"), ("test:", "test"), ("SYS-", "system"), ("SURF-", "app page"), ("ENG-", "engineering page"), ("F0", "feature"), ("F1", "feature"), ("S", "requirement item"), ("CAP-", "competitor capability"), ("PR-", "principle")):
        if i.startswith(p): return t
    return "other"
for k, n in APPS: node(f"surface:{k}", "app", n, f"30-surfaces/{k}.md")
for m in ("local", "own-key", "cloud"): node(f"mode:{m}", "mode", m)
for sec in sorted({str(it["section"]) for it in items.values()}, key=int): node(f"AREA-{int(sec):03d}", "area", area_title(sec), f"20-features/{area_slug(sec)}/README.md")
for it in items.values():
    node(it["id"], "requirement item", it["text"], f"10-requirements/capabilities/{area_slug(it['section'])}.md")
    edge(it["id"], "part_of", f"AREA-{int(it['section']):03d}", basis="requirement", source="capability ledger")
for f in reg:
    node(f["id"], "feature", f["name"], fpage(f)); edge(f["id"], "part_of", f"AREA-{int(f['area']):03d}", source="feature registry")
    for a in APP_KEYS:
        if f["implementation"][a] != "n/a": edges.append({"from": f["id"], "rel": "available_on", "to": f"surface:{a}", "evidence": [], "basis": "code", "source": f.get("status_basis", "capability ledger audit"), "status": f["implementation"][a], "ledger_status": f.get("implementation_ledger", f["implementation"])[a], "verification": f["verification"][a]})
    for i in f["items"]: edge(f["id"], "satisfies", i, basis="requirement", source="feature registry")
    files = collections.Counter()
    for i in f["items"]:
        for a, c in (items[i].get("cells") or {}).items():
            for e in c.get("ev") or []:
                if e.get("p"): files[e["p"]] += 1
    for p, _ in files.most_common(12):
        node(f"file:{p}", "file", p, p); edge(f["id"], "implemented_by", f"file:{p}", evidence=[p], source="capability ledger")
    d = deep.get(f["id"])
    if d:
        for m in d["implementation_map"]:
            p = path_of(m["path"])
            if p and exists(p): node(f"file:{p}", "file", p, p); edge(f["id"], "implemented_by", f"file:{p}", evidence=[m["path"]], source="feature page")
        for t in d["verification"]["existing_tests"]:
            p = path_of(t["path"])
            if p and exists(p): node(f"test:{p}", "test", p, p); edge(f["id"], "tested_by", f"test:{p}", evidence=[t["path"]], source="feature page")
        for x in d["depends_on"]:
            x = one_line(x).split(" ")[0]; node(x, typed(x)); edge(f["id"], "depends_on", x, source="feature page")
        for r in d["relationships"]:
            to = one_line(r["to"]); node(to, typed(to)); edge(f["id"], r["rel"], to, evidence=[r["evidence"]], source="feature page")
ef = KB / "data/built/edges-foundations.json"
for e in (json.loads(ef.read_text()) if ef.exists() else []):
    for x in (e["from"], e["to"]): node(one_line(x), typed(one_line(x)))
    edge(one_line(e["from"]), e["rel"], one_line(e["to"]), evidence=e["evidence"], source=e.get("source_page", ""))
for c in caps:
    node(c["id"], "competitor capability", c["name"], f"50-competitors/{c['topic']}.md")
    for i in c["ledger_ids"]:
        if i in items: edge(c["id"], "traced_to", i, evidence=c["urls"][:3], basis="competitor", source="competitor trace")
for g in gaps:
    if g["kind"] in ("missing compared with Claude or ChatGPT", "partly there compared with Claude or ChatGPT") and not g["features"]: continue
    node(g["id"], "gap", g["title"], "80-gaps/gaps.jsonl")
    for x in g["features"]:
        if x in nodes: edge(x, "blocked_by", g["id"], evidence=[g["evidence"]], basis=g["basis"], source=g["source"])
write("graph/nodes.jsonl", "\n".join(json.dumps(n) for n in nodes.values()))
write("graph/edges.jsonl", "\n".join(json.dumps(e) for e in edges))
rels = collections.Counter(e["rel"] for e in edges); types = collections.Counter(n["type"] for n in nodes.values())
write("graph/README.md", front_matter(id="GRAPH", type="relationship-map", title="Relationship map", last_reviewed=TODAY, revision=HEAD) + "# Relationship map\n\n" +
      f"{len(nodes)} nodes and {len(edges)} edges, built by `tools/04_build_indexes.py` from the pages and the capability ledger. One JSON object per line.\n\n" +
      "- [nodes.jsonl](nodes.jsonl): `id`, `type`, `title`, `path` (a page of this knowledge base or a file of the project).\n- [edges.jsonl](edges.jsonl): `from`, `rel`, `to`, `evidence` (files and lines, or web addresses), `basis` (code, requirement, competitor, executed), `source` (which page or data set stated it). `available_on` edges also carry `status` (built, partial, missing) and `verification`.\n\n" +
      "## Node types\n\n| Type | Count |\n|---|---:|\n" + "\n".join(f"| {t} | {n} |" for t, n in types.most_common()) + "\n\n## Relationships\n\n| Relationship | Count | Meaning |\n|---|---:|---|\n" +
      "\n".join(f"| {r} | {n} | {m} |" for r, n in rels.most_common() for m in [{"implemented_by": "the code that implements it", "depends_on": "needs this to work", "available_on": "the app has it (see status)", "uses_provider": "calls this inference provider package", "governed_by_subscription": "a plan or usage rule applies", "stores_data_in": "where its data is kept", "tested_by": "a test file that covers it", "blocked_by": "an open gap", "satisfies": "feature covers this requirement item", "part_of": "belongs to this area", "traced_to": "competitor capability maps to this requirement item", "exposes_api": "serves this endpoint", "configured_by": "a setting or flag controls it", "documented_in": "a project document describes it"}.get(r, "")]) +
      "\n\n## Identifier forms\n\n`F013-02` feature, `S13.10` requirement item, `AREA-013` area, `SYS-...` system page, `SURF-...` app page, `CAP-<topic>-NN` competitor capability, `GAP-...` gap, `surface:web` app, `mode:local` mode, `plan:<name>` plan, `file:<path>`, `api:<METHOD> <path>`, `table:<name>`, `store:<name>`, `provider:<folder>`, `test:<path>`.\n")

# ---------------- outdated project documents ----------------
odf = KB / "data/built/outdated-documents.json"
od = json.loads(odf.read_text()) if odf.exists() else []
byd = collections.defaultdict(list)
for x in od: byd[one_line(x["document"])].append(x)
o = [front_matter(id="META-outdated-documents", type="meta", title="Project documents found out of date", basis="code inspection", last_reviewed=TODAY, revision=HEAD) + "# Project documents found out of date", "",
     f"{len(od)} places in {len(byd)} project documents (and code comments) that no longer match the code, found while writing the system, app and engineering pages. Each names what is outdated, what the code says, and where. On the branch `claude/agent-contract` (not merged) 26 of these, in 23 documents, are corrected; each was confirmed against the code by a second reader. Sixteen other corrections were made and then taken back because they were not plain facts or did not hold. Findings about decision records, generated documents, the known-flaws register, the pinned design skill and `AGENTS.md` itself were not applied. The project's own register for such findings is `audit/doc-corrections/contradictions-register.md`.", ""]
for doc in sorted(byd):
    o += [f"## `{doc}`", ""] + [f"- **Outdated:** {one_line(x['what_is_outdated'])} **The code says:** {one_line(x['what_the_code_says'])} ({one_line(x['evidence'])}; found by {x['found_by']})" for x in byd[doc]] + [""]
write("90-meta/outdated-documents.md", "\n".join(o))

# ---------------- review ----------------
rv = load_raw("review")
if rv:
    t = rv["totals"]; cons = rv.get("consistency") or {"contradictions": [], "unclear_or_misleading": [], "verdict": ""}
    o = [front_matter(id="META-review", type="meta", title="Review of the knowledge base", last_reviewed=TODAY, revision=HEAD) + "# Review of the knowledge base", "",
         f"Two checks were run after writing. **Accuracy:** a second reader took {t['pages']} feature pages (every 24th feature) and checked {t['claims']} statements against the code: {t['correct']} correct, {t['partly_wrong']} partly wrong, {t['wrong']} wrong, {t['could_not_check']} could not be checked. "
         f"That is {round(100 * t['correct'] / max(1, t['claims'] - t['could_not_check']))}% correct among the statements that could be checked. Each corrected statement is shown at the end of its feature page. The other pages were not sampled; treat their statements as read-in-code, not verified.", "",
         "**Consistency:** one reader read the overview, principles, core system pages, app pages and glossary together and listed where they disagree.", "", "## Wrong or partly wrong statements found", ""]
    for pg in rv["pages"]:
        for c in pg["review"]["checked"]:
            if c["verdict"] in ("wrong", "partly wrong"):
                o.append(f"- [{pg['id']}](../{pg['path']}) {c['verdict']}: \"{one_line(c['claim'])}\" Corrected: {one_line(c['correction'])} ({one_line(c['evidence'])})")
    o += ["", "## Contradictions between pages", ""] + ([f"- `{one_line(c['page_a'])}` says: {one_line(c['says_a'])} `{one_line(c['page_b'])}` says: {one_line(c['says_b'])} **Right:** {one_line(c['which_is_right'])} ({one_line(c['evidence'])})" for c in cons["contradictions"]] or ["- none found"])
    o += ["", "## Unclear or misleading", ""] + ([f"- `{one_line(c['page'])}`: {one_line(c['problem'])} Fix: {one_line(c['fix'])}" for c in cons["unclear_or_misleading"]] or ["- none found"])
    write("90-meta/review.md", "\n".join(o))

# ---------------- ledger corrections ----------------
per_feat = [x for x in ledger_fix if x["app"]]; per_area = [x for x in ledger_fix if not x["app"]]
exist_led_missing = [x for x in per_feat if x["ledger_says"] == "missing"]; exist_page_missing = [x for x in per_feat if x["page_says"] == "missing"]
unfinished = [{"feature": f["id"], "name": f["name"], "app": a_, "ledger_says": f["implementation_ledger"][a_], "page_says": f["implementation_page"][a_]} for f in reg for a_ in f.get("status_unfinished_noted", [])]
spot = (load_raw("final-verify") or {}).get("cases", [])
write("90-meta/ledger-corrections.json", json.dumps({"exists_but_ledger_says_not_built": exist_led_missing, "ledger_says_built_but_page_found_none": exist_page_missing, "page_lists_unfinished_parts": unfinished, "notes_from_area_pages": per_area, "spot_check": spot}, indent=1))
lab = {"built": "built", "partial": "partly built", "missing": "not built", "n/a": "does not apply"}
spot_line = ""
if spot:
    pr = sum(1 for c in spot if c["who_was_right"] == "feature page"); lr = sum(1 for c in spot if c["who_was_right"] == "ledger")
    spot_line = f" **Spot-check:** {len(spot)} of the existence cases were decided from the code by a separate reader: the feature page was right in {pr}, the ledger in {lr}, neither or unclear in {len(spot) - pr - lr}."
o = [front_matter(id="META-ledger-corrections", type="meta", title="Where the capability ledger and the feature pages disagree", basis="code inspection, 2026-11-24; unvalidated except for the spot-check", last_reviewed=TODAY, revision=HEAD) + "# Where the capability ledger and the feature pages disagree", "",
     "The project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`) was audited on 2026-09-26 and updated since. The feature pages were written from the code on 2026-11-24, and a second, cheaper pass then read each page and recorded what it says per app. That pass has its own errors, so treat this page as a list of things to check, not as a list of ledger mistakes." + spot_line, "",
     "| Kind of disagreement | Cases | What it means |", "|---|---:|---|",
     f"| The page describes it on an app where the ledger says not built | {len(exist_led_missing)} | The ledger may be behind the code |",
     f"| The ledger says built or partly built where the page found nothing | {len(exist_page_missing)} | The feature may be gone, or the page's writer did not find it |",
     f"| Both say it exists; the page lists unfinished parts where the ledger says built (or the reverse) | {len(unfinished)} | Usually a matter of degree. Not counted as a ledger error. Includes things switched off by decision, such as sales |",
     f"| Notes from the area pages that the brief or ledger is out of date | {len(per_area)} | Free-text notes |", "",
     "These are kept out of the gap register. Corrections to the ledger go through the project's own process. Machine-readable: [ledger-corrections.json](ledger-corrections.json).", ""]
if spot:
    o += ["## Spot-check of existence cases", "", "| Feature | App | Found in the code | Right | Evidence |", "|---|---|---|---|---|"]
    o += [f"| {c['feature']} | {NAME.get(c['app'], c['app'])} | {c['verdict']} | {c['who_was_right']} | {one_line(c['evidence'])[:260].replace('|', '/')} |" for c in spot] + [""]
o += ["## The page describes it where the ledger says not built", "", "| Feature | App | The feature page says | From the page |", "|---|---|---|---|"]
o += [f"| [{x['feature']}](../{fpage(feat[x['feature']])}) {x['name']} | {NAME.get(x['app'], x['app'])} | {lab.get(x['page_says'], x['page_says'])} | {x['quote'][:200].replace('|', '/')} |" for x in exist_led_missing if x["feature"] in feat]
o += ["", "## The ledger says built where the page found nothing", "", "| Feature | App | Ledger says | From the page |", "|---|---|---|---|"]
o += [f"| [{x['feature']}](../{fpage(feat[x['feature']])}) {x['name']} | {NAME.get(x['app'], x['app'])} | {lab.get(x['ledger_says'], x['ledger_says'])} | {x['quote'][:200].replace('|', '/')} |" for x in exist_page_missing if x["feature"] in feat]
o += ["", "## Notes from the area pages", ""] + [f"- **{x['name']}:** {x['page_says']} ({x['quote']})" for x in per_area]
write("90-meta/ledger-corrections.md", "\n".join(o))

# ---------------- index of pages ----------------
docs, ids = [], collections.Counter()
FM = re.compile(r"^---\n(.*?)\n---\n", re.S)
for f in sorted(KB.rglob("*.md")):
    rel = f.relative_to(KB).as_posix()
    if rel.startswith(("data/", "tools/")) or f.is_symlink() or "/lists-to-read/" in rel: continue
    text = f.read_text(errors="ignore"); m = FM.match(text); meta = {}
    if m:
        for line in m.group(1).splitlines():
            k, _, v = line.partition(": ")
            meta[k.strip()] = v.strip().strip('"')
    title = meta.get("title") or (re.search(r"^# (.+)$", text, re.M) or [None, rel])[1]
    did = meta.get("id") or "DOC-" + slugify(rel, 90)
    ids[did] += 1
    docs.append({"id": did, "type": meta.get("type", "page"), "title": one_line(title), "path": rel, "words": len(text.split()), "has_metadata": bool(m), "last_reviewed": meta.get("last_reviewed", ""), "revision": meta.get("revision", "")})
FOLDERS = {"30-surfaces": ("Apps", "One page per app: what it is, how it is built, how it signs in, which of Local, own key and Cloud it supports, how to build and run it, and how it differs from the unified experience."),
           "40-systems": ("Systems", "Subsystems that cut across features and apps. Each page says how it works today, where the code is, the rules it applies, how it should work, and its gaps."),
           "60-engineering": ("Engineering", "Setup, configuration, build and test, deployment, release, migrations, monitoring, troubleshooting and recovery. Each page summarises and points to the project document that owns the procedure."),
           "50-competitors": ("Competitors to requirements", "One page per capability topic. Each capability is traced from Claude and ChatGPT evidence (official pages saved 2026-11-22) to an AGI requirement, the current implementation, the gap, acceptance criteria and verification. Claude Code and Codex are named as separate products wherever the evidence is about them. The comparison data the traces draw on is in `data/` (see `data/README.md`); all capabilities in one file: `capabilities.json`.")}
for folder, (title, intro) in FOLDERS.items():
    ds = [d for d in docs if d["path"].startswith(folder + "/") and d["path"].count("/") == 1 and not d["path"].endswith("README.md")]
    if ds:
        write(f"{folder}/README.md", front_matter(id="INDEX-" + folder, type="index", title=title, last_reviewed=TODAY, revision=HEAD) + f"# {title}\n\n{intro}\n\n| Page | Identifier |\n|---|---|\n" + "\n".join(f"| [{d['title']}]({d['path'].split('/', 1)[1]}) | `{d['id']}` |" for d in ds))
write("index.json", json.dumps({"built_on": BUILT_ON, "built_at_commit": BUILT_AT, "content_read_on": TODAY, "content_read_at_commit": HEAD, "documents": docs}, indent=1))
bt = collections.defaultdict(list)
for d in docs: bt[d["type"]].append(d)
o = [front_matter(id="INDEX", type="index", title="Index of every page", last_reviewed=TODAY, revision=HEAD) + "# Index of every page", "", f"{len(docs)} pages. Machine-readable: [index.json](index.json). Large generated sets are summarised, not listed.", ""]
for t in sorted(bt):
    ds = bt[t]
    o += [f"## {t} ({len(ds)})", ""]
    if len(ds) > 120: o += [f"- {len(ds)} pages under `{ds[0]['path'].split('/')[0]}/`; see that folder's README.", ""]
    else: o += [f"- [{d['title']}]({d['path']}) `{d['id']}`" for d in ds] + [""]
write("index.md", "\n".join(o))

# ---------------- checks ----------------
LINK = re.compile(r"\]\(([^)\s]+)\)")
broken, n_links = [], 0
CODE = re.compile(r"`((?:apps|packages|services|crates|infrastructure|scripts|docs|audit|\.agents|\.github)/[^`\s:]+)(?::[\d,\-– ]+)?`")
bad_refs, n_refs = collections.Counter(), 0
for d in docs:
    f = KB / d["path"]; text = f.read_text(errors="ignore")
    for l in LINK.findall(text):
        if l.startswith(("http", "mailto:", "#", "javascript:", "//")) or ("/" not in l and "." not in l): continue
        n_links += 1
        target = (f.parent / l.split("#")[0]).resolve()
        if not target.exists(): broken.append((d["path"], l))
    if d["path"].startswith("70-qa/test-plans/"): continue
    for r in CODE.findall(text):
        n_refs += 1
        if not (REPO / r).exists(): bad_refs[d["path"].split("/")[0]] += 1
dup = [i for i, n in ids.items() if n > 1]
checks = {"built_on": BUILT_ON, "built_at_commit": BUILT_AT, "content_read_on": TODAY, "content_read_at_commit": HEAD, "pages": len(docs), "pages_without_metadata": sum(1 for d in docs if not d["has_metadata"]), "duplicate_ids": dup[:50], "links_checked": n_links, "broken_links": [list(b) for b in broken[:200]], "broken_link_count": len(broken),
          "code_references_checked": n_refs, "code_references_not_found": dict(bad_refs), "graph_nodes": len(nodes), "graph_edges": len(edges), "gaps": len(gaps)}
write("90-meta/checks.json", json.dumps(checks, indent=1))

# ---------------- codebase coverage ----------------
units = []
for pat in ("apps/*", "packages/*/*", "packages/ai/providers/*", "services/*", "infrastructure/*", "crates/*"):
    units += sorted(str(d.relative_to(REPO)) for d in REPO.glob(pat) if d.is_dir() and not d.name.startswith(".") and d.name != "node_modules")
units = [u for u in dict.fromkeys(units) if u != "packages/ai/providers"]
feat_by_unit = collections.defaultdict(set)
for e in edges:
    if e["rel"] == "implemented_by" and e["to"].startswith("file:"):
        path = e["to"][5:]
        for u in units:
            if path.startswith(u + "/"): feat_by_unit[u].add(e["from"])
texts = {d["path"]: (KB / d["path"]).read_text(errors="ignore") for d in docs if d["path"].startswith(("30-surfaces/", "40-systems/", "60-engineering/", "00-start/"))}
rows_c, bare = [], []
for u in units:
    name = u.rsplit("/", 1)[1]
    pages = sorted(pth for pth, t in texts.items() if u in t or (u.startswith("packages/ai/providers/") and pth == "40-systems/inference-providers.md" and name in t))
    n = len(feat_by_unit[u])
    if not pages and not n: bare.append(u)
    rows_c.append(f"| `{u}` | {n} | {len(pages)} | {', '.join(f'[{x.split(chr(47))[-1][:-3]}](../{x})' for x in pages[:4]) or 'none'} |")
write("90-meta/codebase-coverage.md", front_matter(id="META-codebase-coverage", type="coverage", title="Codebase coverage", last_reviewed=TODAY, revision=HEAD) + "# Codebase coverage\n\n" +
      f"Every app, package, service and crate in the project ({len(units)} folders), with how many features cite code in it and which overview, app, system or engineering pages describe it. A folder with neither is not documented here yet.\n\n" +
      (f"**Not covered ({len(bare)}):** " + ", ".join(f"`{b}`" for b in bare) + "\n\n" if bare else "**Every folder is cited by at least one feature or page.**\n\n") +
      "| Folder | Features citing its code | Pages describing it | Pages |\n|---|---:|---:|---|\n" + "\n".join(rows_c))
checks["codebase_folders"] = len(units); checks["codebase_folders_not_covered"] = bare
ccf = KB / "data/built/competitor-checks.json"
if ccf.exists(): checks["competitor_evidence"] = {k: v for k, v in json.loads(ccf.read_text()).items()}
write("90-meta/checks.json", json.dumps(checks, indent=1))

# ---------------- coverage ----------------
plans = collections.Counter(); confirmed = collections.Counter()
for a in APP_KEYS:
    for f in (KB / "70-qa/test-plans" / a).glob("[0-9]*.md"):
        t = f.read_text(); sec = str(int(f.name[:3])); plans[(sec, a)] += len(re.findall(r"^## S", t, re.M)); confirmed[(sec, a)] += t.count("labels found in the code")
rows = []
for sec in sorted({f["area"] for f in reg} | {str(it["section"]) for it in items.values()}, key=int):
    fs = [f for f in reg if f["area"] == sec]
    its = [it for it in items.values() if str(it["section"]) == sec]
    seen = sum(1 for it in its for a in APP_KEYS if live_result(it.get("cells"), a) == "PASS")
    testable = sum(1 for it in its for a in APP_KEYS if cell_status(it.get("cells"), a) in ("done", "partial", "unverified"))
    rows.append({"area": sec, "title": area_title(sec), "requirement_items": len(its), "features": len(fs), "area_page": area_slug(sec) in areas, "feature_pages_written": sum(1 for f in fs if f["id"] in deep),
                 "test_items": sum(plans[(sec, a)] for a in APP_KEYS), "test_items_with_confirmed_path": sum(confirmed[(sec, a)] for a in APP_KEYS), "cells_built_in_code": testable, "cells_seen_working": seen, "open_gaps": len(by_area_g.get(sec, []))})
write("90-meta/coverage.json", json.dumps({"built_on": BUILT_ON, "built_at_commit": BUILT_AT, "content_read_on": TODAY, "content_read_at_commit": HEAD, "areas": rows}, indent=1))
T = lambda k: sum(r[k] for r in rows)
o = [front_matter(id="COVERAGE", type="coverage", title="Coverage checklist", last_reviewed=TODAY, revision=HEAD) + "# Coverage checklist", "",
     "What has been documented, read in the code, tested by a person, and what is still open. Rebuilt by `tools/04_build_indexes.py`. Machine-readable: [coverage.json](coverage.json).", "",
     "| Measure | Count |", "|---|---:|", f"| Product areas | {len(rows)} |", f"| Requirement items | {T('requirement_items')} |", f"| Features with a stable identifier | {T('features')} |", f"| Area pages written from the code | {sum(1 for r in rows if r['area_page'])} |",
     f"| Feature pages with all ten sections | {T('feature_pages_written')} |", f"| Hands-on test items (item x app) | {T('test_items')} |", f"| ...with a path whose labels are confirmed in the code | {T('test_items_with_confirmed_path')} |",
     f"| Built in the code (item x app) | {T('cells_built_in_code')} |", f"| ...seen working by a person | {T('cells_seen_working')} |", f"| Open gaps linked to an area | {T('open_gaps')} |", "",
     "## By area", "", "| # | Area | Items | Features | Area page | Feature pages | Test items | Path confirmed | Built in code | Seen working | Gaps |", "|---:|---|---:|---:|---|---:|---:|---:|---:|---:|---:|"]
o += [f"| {r['area']} | [{r['title']}](../20-features/{area_slug(r['area'])}/README.md) | {r['requirement_items']} | {r['features']} | {'yes' if r['area_page'] else 'no'} | {r['feature_pages_written']} | {r['test_items']} | {r['test_items_with_confirmed_path']} | {r['cells_built_in_code']} | {r['cells_seen_working']} | {r['open_gaps']} |" for r in rows]
o += ["", "## Checks on this knowledge base", "", f"- Pages: {checks['pages']} ({checks['pages_without_metadata']} without a metadata header).", f"- Links checked: {n_links}; broken: {len(broken)}.", f"- References to project files checked: {n_refs}; not found: {sum(bad_refs.values())} ({dict(bad_refs)}).",
      f"- Duplicate identifiers: {len(dup)}.", f"- Relationship map: {len(nodes)} nodes, {len(edges)} edges.", "", "Details: [checks.json](checks.json)."]
write("90-meta/coverage.md", "\n".join(o))
print(f"gaps {len(gaps)} {dict(kinds)}\nnodes {len(nodes)} edges {len(edges)} | pages {len(docs)} without metadata {checks['pages_without_metadata']} | links {n_links} broken {len(broken)} | code refs {n_refs} not found {sum(bad_refs.values())} | duplicate ids {len(dup)}")
for b in broken[:8]: print("  broken:", b)
