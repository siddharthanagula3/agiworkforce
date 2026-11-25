#!/usr/bin/env python3
"""Render the pages that workflows wrote as structured data:
40-systems, 30-surfaces, 60-engineering, 00-start/glossary, 10-requirements/established-requirements
(from data/raw/foundations.json), 50-competitors (from data/raw/competitors.json) and
10-requirements/capabilities (from the capability ledger and the feature registry). Safe to re-run."""
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kb_lib import *

BASIS = {"executed": "seen in a real run", "code": "read in the code", "requirement": "stated requirement", "competitor": "competitor evidence", "inferred": "inferred", "proposed": "proposed", "unknown": "unknown"}
edges, outdated, facts_all = [], [], []

# ---------- foundations ----------
found = load_raw("foundations") or {"pages": []}
fixed = {p["id"]: p["doc"] for p in (load_raw("review-applied") or {}).get("pages", []) if p and p.get("doc")}
for p in found["pages"]:
    if p["id"] in fixed: p["doc"] = fixed[p["id"]]; p["consistency_corrected"] = True
for p in found["pages"]:
    d = p["doc"]
    fm = front_matter(id=p["id"], type=p["kind"], title=p["title"], basis="code inspection and project documents", second_reader=("challenged and corrected" if p.get("corrected") else "challenged, stood" if p.get("challenged") else "not challenged") + ("; corrected after the consistency check across pages" if p.get("consistency_corrected") else ""),
                      last_reviewed=TODAY, revision=HEAD)
    o = [fm + f"# {p['title']}", "", one_line(d["summary"]), ""]
    for s in d["sections"]:
        o += [f"## {one_line(s['heading'])}", "", s["markdown"].strip(), ""]
    o += ["## Key facts", "", "| Fact | Basis | Source |", "|---|---|---|"]
    for k in d["key_facts"]:
        src = "; ".join(f"`{e}`" + ("" if (exists(e) or e.startswith("http")) else " (not found)") for e in k["evidence"]) or "none"
        o.append(f"| {one_line(k['fact']).replace('|', '/')} | {BASIS.get(k['basis'], k['basis'])} | {src} |")
        facts_all.append({"page": p["id"], **k})
    o += ["", "## Open questions", ""] + ([f"- {one_line(q)}" for q in d["open_questions"]] or ["- none listed"])
    if d["outdated_documents"]:
        o += ["", "## Project documents found out of date", ""] + [f"- `{one_line(x['document'])}`: {one_line(x['what_is_outdated'])} The code says: {one_line(x['what_the_code_says'])} ({one_line(x['evidence'])})" for x in d["outdated_documents"]]
        outdated += [{"found_by": p["id"], **x} for x in d["outdated_documents"]]
    write(p["path"], "\n".join(o))
    for r in d["relationships"]:
        edges.append({"from": r["from"], "rel": r["rel"], "to": r["to"], "evidence": r["evidence"], "basis": "code", "source_page": p["id"]})

# ---------- competitors ----------
comp = load_raw("competitors") or {"topics": []}
caps, n_total = [], 0
known_urls = set()
cat_file = KB / "50-competitors/data/leader-catalog.jsonl"
if cat_file.exists():
    for line in cat_file.read_text().splitlines():
        if line.strip(): known_urls.add(json.loads(line).get("url", "").strip())
valid_items = {it["id"] for it in ledger_items()}
valid_cmp = set()
for fn in ("missing-in-agi.csv", "partly-there.csv", "reverse-engineer-extra.csv"):
    if (KB / "50-competitors/data" / fn).exists(): valid_cmp |= {r["id"] for r in read_csv(KB / "50-competitors/data" / fn)}
cchk = {"addresses_cited": 0, "addresses_not_in_saved_catalogue": 0, "ledger_ids_cited": 0, "ledger_ids_unknown": 0, "comparison_ids_cited": 0, "comparison_ids_unknown": 0, "unknown_examples": []}
def url_ok(u):
    u = one_line(u); cchk["addresses_cited"] += 1
    ok = u in known_urls or u.rstrip("/") in known_urls or u.split("#")[0] in known_urls
    if not ok:
        cchk["addresses_not_in_saved_catalogue"] += 1
        if len(cchk["unknown_examples"]) < 40: cchk["unknown_examples"].append(u)
    return ok
for t in comp["topics"]:
    tr = t["trace"]; slug = t["slug"]
    o = [front_matter(id=f"COMP-{slug}", type="competitor-trace", title=t["title"], competitor_evidence_reviewed="2026-11-22", basis="official competitor pages saved 2026-11-22; AGI status from code inspection", last_reviewed=TODAY, revision=HEAD) + f"# {t['title']}: competitors to requirements", "",
         one_line(tr["summary"]), "", "**How the products divide this topic.** " + one_line(tr["scope_notes"]), "",
         "Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.", "",
         "| ID | Capability | Claude | ChatGPT | AGI today | Verified |", "|---|---|---|---|---|---|"]
    body = []
    for i, c in enumerate(tr["capabilities"], 1):
        cid = f"CAP-{slug}-{i:02d}"; n_total += 1
        o.append(f"| [{cid}](#{cid.lower()}) | {one_line(c['name']).replace('|', '/')} | {c['claude']['has']} | {c['chatgpt']['has']} | {c['current']['status']} | {c['verification']['status']} |")
        def ev(side):
            rows = [f"  - [{one_line(e['url'])}]({one_line(e['url'])})" + ("" if url_ok(e["url"]) else " (this address is not in the saved catalogue; treat as unverified)") + f": {one_line(e['says'])}" + (f" Plans: {one_line(e['plans'])}." if e.get("plans") else "") + (f" Apps: {one_line(e['surfaces'])}." if e.get("surfaces") else "") for e in side["evidence"]]
            return [f"- **{side['product'] or 'none'}: {side['has']}**"] + (rows or ["  - no page found in the saved documentation"])
        r = c["requirement"]; cur = c["current"]
        cchk["ledger_ids_cited"] += len(cur["ledger_ids"]); cchk["comparison_ids_cited"] += len(cur["comparison_ids"])
        found_l = sorted({m for i in cur["ledger_ids"] for m in re.findall(r"S\d+\.\d+[A-Za-z]?", i)})
        found_c = sorted({m for i in cur["comparison_ids"] for m in re.findall(r"\bR?[WDMXCV]P?\d+\b", i)})
        cur["comparison_rows"] = [one_line(i) for i in cur["comparison_ids"] if not re.search(r"\bR?[WDMXCV]P?\d+\b", i)]
        cchk["ledger_ids_unknown"] += sum(1 for i in found_l if i not in valid_items); cchk["comparison_ids_unknown"] += sum(1 for i in found_c if i not in valid_cmp)
        cchk["ledger_ids_cited"] += len(found_l) - len(cur["ledger_ids"]); cchk["comparison_ids_cited"] += len(found_c) - len(cur["comparison_ids"])
        cur["ledger_ids"] = [i for i in found_l if i in valid_items]; cur["comparison_ids"] = [i for i in found_c if i in valid_cmp]
        body += [f"## {cid} {one_line(c['name'])}", "", one_line(c["what_it_is"]), "", "**Competitor evidence** (reviewed 2026-11-22)", ""] + ev(c["claude"]) + ev(c["chatgpt"]) + ["",
                 f"**AGI requirement** ({BASIS.get(r['basis'], r['basis'])}; source: {one_line(r['source'])}). {one_line(r['statement'])}", "",
                 f"**With different models, providers and the one subscription.** {one_line(r['fit_with_models_providers_subscription'])}", "",
                 f"**Current implementation, as this trace read it on 2026-11-24: {cur['status']}.** {one_line(cur['by_app'])} The feature pages and the ledger may say otherwise per app; follow the item links.", "",
                 "- Capability ledger items: " + (", ".join(cur["ledger_ids"]) or "none matched"), "- Comparison list ids: " + (", ".join(cur["comparison_ids"]) or "none matched") + ("; rows without an id: " + "; ".join(cur["comparison_rows"][:6]) if cur.get("comparison_rows") else ""),
                 "- Code: " + ("; ".join(f"`{e}`" + ("" if exists(e) else " (not found)") for e in cur["evidence"]) or "none cited"), "",
                 f"**Gap.** {one_line(c['gap'])}", "", "**Acceptance criteria**", ""] + [f"{j}. {one_line(a)}" for j, a in enumerate(c["acceptance_criteria"], 1)] + ["",
                 f"**Verification: {c['verification']['status']}.** {one_line(c['verification']['evidence'])}", ""]
        caps.append({"id": cid, "topic": slug, "name": one_line(c["name"]), "claude": c["claude"]["has"], "claude_product": c["claude"]["product"], "chatgpt": c["chatgpt"]["has"], "chatgpt_product": c["chatgpt"]["product"],
                     "requirement_basis": r["basis"], "agi_status": cur["status"], "ledger_ids": cur["ledger_ids"], "comparison_ids": cur["comparison_ids"], "gap": one_line(c["gap"]), "verification": c["verification"]["status"],
                     "urls": [e["url"] for e in c["claude"]["evidence"] + c["chatgpt"]["evidence"]]})
    o += [""] + body + ["## Unresolved product choices", "", "Decisions this topic needs from the owner. Nothing here has been decided.", ""] + ([f"- {one_line(x)}" for x in tr["unresolved_product_choices"]] or ["- none listed"]) + \
         ["", "## Could not establish", ""] + ([f"- {one_line(x)}" for x in tr["could_not_establish"]] or ["- nothing listed"])
    write(f"50-competitors/{slug}.md", "\n".join(o))
if caps: write("50-competitors/capabilities.json", json.dumps({"built_on": BUILT_ON, "evidence_reviewed": "2026-11-22", "capabilities": caps}, indent=1))

# ---------- requirement items per area ----------
regf = KB / "20-features/registry.json"
feat_of = {}
if regf.exists():
    for f in json.loads(regf.read_text())["features"]:
        for i in f["items"]: feat_of[i] = f
caps_by_item = {}
for c in caps:
    for i in c["ledger_ids"]: caps_by_item.setdefault(i.strip(), []).append(c["id"])
by_area = {}
for it in ledger_items(): by_area.setdefault(str(it["section"]), []).append(it)
index = []
for sec in sorted(by_area, key=int):
    slug = area_slug(sec); its = by_area[sec]
    o = [front_matter(id=f"REQ-AREA-{int(sec):03d}", type="requirements", title=f"Requirement items: {area_title(sec)}", basis="established: acceptance criteria recorded in the project's capability ledger", source="audit/ledger/ecosystem-capability-ledger.jsonl", last_reviewed=TODAY, revision=HEAD) +
         f"# Requirement items: {sec}. {area_title(sec)}", "", f"{len(its)} items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.", ""]
    for it in its:
        cells = it.get("cells") or {}; f = feat_of.get(it["id"])
        o += [f"## {it['id']}", "", f"**{one_line(it['text'])}** {one_line(it.get('criterion', ''))}", ""]
        o.append("- Status in the code (capability ledger, audit of 2026-09-26 and later updates): " + ", ".join(f"{n} {cell_status(cells, k)}" for k, n in APPS if cell_status(cells, k) != "n/a") or "- Status in the code: does not apply to any app")
        lives = [f"{n} {live_result(cells, k)}" for k, n in APPS if live_result(cells, k)]
        if lives: o.append("- Seen in a real run: " + ", ".join(lives))
        if f: o.append(f"- Feature: [{f['id']} {f['name']}](../../20-features/{f['area_slug']}/{f['id']}-{f['slug']}.md)")
        if caps_by_item.get(it["id"]): o.append("- Competitor trace: " + ", ".join(caps_by_item[it["id"]]))
        if it.get("productDecisionNeeded"): o.append("- An owner decision is open on this item.")
        o.append("")
    write(f"10-requirements/capabilities/{slug}.md", "\n".join(o))
    index.append(f"| {sec} | [{area_title(sec)}](capabilities/{slug}.md) | {len(its)} |")
write("10-requirements/capability-index.md", front_matter(id="REQ-INDEX", type="index", title="Requirement items by area", last_reviewed=TODAY, revision=HEAD) + "# Requirement items by area\n\n" +
      f"{sum(len(v) for v in by_area.values())} requirement items in {len(by_area)} areas. Identifiers (for example `S13.10`) are the project's own and are used everywhere in this knowledge base.\n\n| # | Area | Items |\n|---:|---|---:|\n" + "\n".join(index))

write("data/built/competitor-checks.json", json.dumps(cchk, indent=1))

# ---------- open product choices ----------
o = [front_matter(id="REQ-open-product-choices", type="requirements", title="Open product choices", basis="collected from the competitor traces and the system, app and engineering pages; none decided", last_reviewed=TODAY, revision=HEAD) + "# Open product choices", "",
     "Decisions the product needs that nobody has made. Nothing on this page is decided. Each line comes from the page named above it. The owner's standing decisions are in [established-requirements.md](established-requirements.md).", "",
     "## Conflicts with the product principles", "",
     "- **PR-4 and Desktop.** The principle says supported local inference on mobile and desktop needs no paid subscription. The public Desktop app has no Local chat: it refuses every local-model command, citing the owner's decision of 2026-09-15 (`docs/decisions/2026-09-15-founder-decisions.md`). Local models reach Desktop only through AGI Code, which runs the CLI. Either that decision changes, or the principle means AGI Code only. See [SYS-local-inference](../40-systems/local-inference.md).",
     "- **PR-4 and the shared composer.** The shared composer hides the Local option from Free-plan users, which would tie Local to a paid plan wherever that code runs. See [SYS-local-inference](../40-systems/local-inference.md), Gaps.",
     "- **PR-3 and plan logic outside the subscription system.** Places where an app decides plan rules itself are listed in [SYS-subscriptions-entitlements-and-usage](../40-systems/subscriptions-entitlements-and-usage.md).",
     "- **PR-1 and model promotion.** Several live model defaults were promoted without the evaluation gate the rules require. See [SYS-model-catalog-and-routing](../40-systems/model-catalog-and-routing.md).", "",
     "## Asked of the owner on 2026-11-24, not answered", "",
     "- May view-only members chat in a project shared with them? (Main allows it since 2026-11-24.)", "- Should idle sign-out be off by default? (Main sets it to Never since 2026-11-24.)", "- Should a paid plan granted by hand never lapse by date?",
     "- Should Web also offer Local mode? The principle names mobile and desktop.", "- Are individuals the first customers, with teams and enterprise after?", "- Is free local inference plus own key the whole difference from the competitors?", "",
     "## From the competitor traces", ""]
for t in comp["topics"]:
    if t["trace"]["unresolved_product_choices"]:
        o += [f"### [{t['title']}](../50-competitors/{t['slug']}.md)", ""] + [f"- {one_line(x)}" for x in t["trace"]["unresolved_product_choices"]] + [""]
o += ["## From the system, app and engineering pages", ""]
for p in found["pages"]:
    if p["doc"]["open_questions"]:
        o += [f"### [{p['title']}](../{p['path']})", ""] + [f"- {one_line(x)}" for x in p["doc"]["open_questions"]] + [""]
write("10-requirements/open-product-choices.md", "\n".join(o))

write("data/built/edges-foundations.json", json.dumps(edges, indent=1))
write("data/built/outdated-documents.json", json.dumps(outdated, indent=1))
write("data/built/key-facts.json", json.dumps(facts_all, indent=1))
print("competitor checks", {k: v for k, v in cchk.items() if k != "unknown_examples"})
print(f"foundation pages {len(found['pages'])} | competitor topics {len(comp['topics'])} with {n_total} capabilities | requirement areas {len(by_area)} | edges {len(edges)} | outdated documents {len(outdated)}")
