#!/usr/bin/env python3
"""Give every feature a stable identifier.

Reads the area pages written by the feature-guide workflows (data/raw/feature-guide*.json)
and the capability ledger, and writes 20-features/registry.json. An identifier, once in the
registry, never changes: re-running keeps existing ids and only appends new features.
Every ledger item belongs to exactly one feature; items no page placed go to a catch-all
feature numbered 99 in their area."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kb_lib import *

reg_file = KB / "20-features/registry.json"
old = json.loads(reg_file.read_text()) if reg_file.exists() else {"features": []}
by_key = {(f["area"], f["name"].lower()): f for f in old["features"]}
used = {f["id"] for f in old["features"]}
items = ledger_items()
by_area = {}
for it in items:
    by_area.setdefault(str(it["section"]), []).append(it)
item_by_id = {it["id"]: it for it in items}

pages = {}
for name in ("feature-guide-pilot", "feature-guide", "feature-guide-retry"):
    res = load_raw(name)
    for p in (res or {}).get("pages", []):
        if p and p.get("guide") and (name != "feature-guide-pilot" or p.get("model") == "sonnet"):
            pages[p["slug"]] = p["guide"]

features, problems = [], []
for sec in sorted(by_area, key=int):
    slug = area_slug(sec); guide = pages.get(slug)
    if not guide:
        problems.append(f"no area page for {slug}"); continue
    seen, n = set(), 0
    for f in guide["features"]:
        ids = [i.strip() for i in f["ids"] if i.strip() in item_by_id and str(item_by_id[i.strip()]["section"]) == sec and i.strip() not in seen]
        seen.update(ids)
        if not ids:
            continue
        prev = by_key.get((sec, f["name"].lower()))
        if prev:
            fid = prev["id"]
        else:
            n = max([n] + [int(x["id"].split("-")[1]) for x in features if x["area"] == sec] + [int(i.split("-")[1]) for i in used if i.startswith(f"F{int(sec):03d}-") and not i.endswith("-99")]) + 1
            fid = f"F{int(sec):03d}-{n:02d}"
        used.add(fid)
        features.append({"id": fid, "area": sec, "area_slug": slug, "area_title": area_title(sec), "name": one_line(f["name"]), "slug": slugify(f["name"], 50), "items": ids,
                         "use": one_line(f["use"]), "how_people_use_it": f["how_people_use_it"], "how_it_should_work": f["how_it_should_work"], "on_each_app": one_line(f["on_each_app"])})
    left = [it["id"] for it in by_area[sec] if it["id"] not in seen]
    if left:
        features.append({"id": f"F{int(sec):03d}-99", "area": sec, "area_slug": slug, "area_title": area_title(sec), "name": f"Other items in {area_title(sec)}", "slug": "other-items", "items": left,
                         "use": "Items of this area that the area page did not place under a named feature.", "how_people_use_it": [], "how_it_should_work": [], "on_each_app": ""})

for f in features:
    its = [item_by_id[i] for i in f["items"]]
    f["implementation"] = {a: roll_up([cell_status(it.get("cells"), a) for it in its]) for a in APP_KEYS}
    f["server"] = {a: roll_up([cell_status(it.get("cells"), a) for it in its]) for a in ("api", "platform")}
    seen_ok = {a: sum(1 for it in its if live_result(it.get("cells"), a) == "PASS") for a in APP_KEYS}
    seen_bad = {a: sum(1 for it in its if live_result(it.get("cells"), a) in ("FAIL", "PARTIAL")) for a in APP_KEYS}
    testable = {a: sum(1 for it in its if cell_status(it.get("cells"), a) in ("done", "partial", "unverified")) for a in APP_KEYS}
    f["verification"] = {a: ("n/a" if not testable[a] else "seen failing" if seen_bad[a] else "seen working" if seen_ok[a] == testable[a] else f"partly seen ({seen_ok[a]} of {testable[a]})" if seen_ok[a] else "not seen by a person") for a in APP_KEYS}
    f["available_on"] = [a for a in APP_KEYS if f["implementation"][a] in ("built", "partial")]

MAP = {"built": "built", "partly built": "partial", "not built": "missing", "does not apply": "n/a"}
_pol = KB / "data/status-policy.json"
POLICY = json.loads(_pol.read_text()).get("prefer_page_reading_when_existence_differs", True) if _pol.exists() else True
page = {x["id"].strip(): x for x in (load_raw("status-from-pages") or {}).get("features", []) if x and x.get("id")}
for f in features:
    f["implementation_ledger"] = dict(f["implementation"])
    ps = page.get(f["id"])
    if not ps: f["status_basis"] = "ledger audit only"; continue
    read = {a: MAP.get(ps.get(a)) for a in APP_KEYS}
    led = f["implementation_ledger"]
    # The ledger decides whether a feature applies to an app at all; the page decides how much of it is built.
    use = {a: (read[a] if led[a] != "n/a" and read[a] in ("built", "partial", "missing") else None) for a in APP_KEYS}
    f["implementation_page"] = {a: ("n/a" if led[a] == "n/a" else use[a] or "not stated") for a in APP_KEYS}
    exists_differs = [a for a in APP_KEYS if use[a] and (use[a] == "missing") != (led[a] == "missing")]
    f["status_differs"] = exists_differs
    f["status_unfinished_noted"] = [a for a in APP_KEYS if use[a] and use[a] != led[a] and a not in exists_differs]
    f["implementation"] = {a: (use[a] if a in exists_differs and POLICY else led[a]) for a in APP_KEYS}
    f["status_quotes"] = {d["app"].lower().replace(" ", ""): one_line(d["quote"]) for d in ps.get("differs_from_status_table", [])}
    f["status_basis"] = "capability ledger audit of 2026-09-26 and later updates; where the feature page's reading of 2026-11-24 disagrees on whether the feature exists on an app, " + ("the page's reading is used" if POLICY else "the ledger is kept") + " and the case is listed in 90-meta/ledger-corrections.md"
    f["available_on"] = [a for a in APP_KEYS if f["implementation"][a] in ("built", "partial")]

reg_file.parent.mkdir(parents=True, exist_ok=True)
reg_file.write_text(json.dumps({"built_on": BUILT_ON, "built_at_commit": BUILT_AT, "content_read_on": TODAY, "content_read_at_commit": HEAD, "features": features}, indent=1))
placed = sum(len(f["items"]) for f in features)
print(f"{len(features)} features in {len({f['area'] for f in features})} areas; {placed} of {len(items)} ledger items placed; catch-all features: {sum(1 for f in features if f['id'].endswith('-99'))}")
for p in problems[:20]: print("  !", p)
