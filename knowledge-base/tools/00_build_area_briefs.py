#!/usr/bin/env python3
"""Write one brief per product area from the project's capability ledger: every item in the
area, what should happen, its status in each app and where its code is. The feature guide
is written from these briefs.  Usage: python3 -I tools/build_area_briefs.py"""
import json, pathlib, re, collections

QA = pathlib.Path(__file__).resolve().parent.parent
REPO = pathlib.Path.home() / "Desktop/agiworkforce"
META = json.loads((REPO / "audit/ledger/ecosystem-capability-ledger.meta.json").read_text())
items = [json.loads(l) for l in (REPO / "audit/ledger/ecosystem-capability-ledger.jsonl").read_text().splitlines() if l.strip()]
APPS = ["web", "desktop", "mobile", "cli", "vscode", "chrome", "api", "platform"]
out_dir = QA / "data/area-briefs"; out_dir.mkdir(parents=True, exist_ok=True)
by = collections.defaultdict(list)
for it in items: by[str(it["section"])].append(it)
index = []
for sec in sorted(by, key=int):
    title = META["sections"].get(sec, f"Section {sec}")
    slug = f"{int(sec):03d}-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]
    lines = [f"# Area {sec}. {title}", "", f"{len(by[sec])} items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).", ""]
    built = collections.Counter()
    for it in by[sec]:
        cells = it.get("cells") or {}
        status = ", ".join(f"{a} {cells[a]['s']}" for a in APPS if a in cells and cells[a]["s"] != "n/a")
        for a in APPS:
            if a in cells and cells[a]["s"] in ("done", "partial"): built[a] += 1
        lines += [f"## {it['id']} {it['text']}", f"- Should: {it.get('criterion', '')}", f"- Status: {status or 'not applicable anywhere'}"]
        files = []
        for a in APPS:
            for e in (cells.get(a) or {}).get("ev") or []:
                ref = f"{e.get('p')}:{(e.get('l') or [''])[0]}"
                if ref not in files: files.append(ref)
        if files: lines.append("- Code: " + "; ".join(files[:8]))
        rem = [f"{a}: {cells[a].get('remaining') or cells[a].get('miss')}" for a in APPS if a in cells and (cells[a].get("remaining") or cells[a].get("miss"))]
        if rem: lines.append("- Unfinished: " + " | ".join(rem)[:600])
        lines.append("")
    (out_dir / f"{slug}.md").write_text("\n".join(lines))
    index.append({"sec": sec, "title": title, "slug": slug, "items": len(by[sec]), "built": dict(built)})
(out_dir / "index.json").write_text(json.dumps(index, indent=1))
print(len(index), "areas;", sum(i["items"] for i in index), "items; largest:", max(index, key=lambda i: i["items"])["slug"], max(i["items"] for i in index))
