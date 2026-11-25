#!/usr/bin/env python3
"""Bring the documents that already exist into this folder: dated copies of the small
ones, links to the large ones and to anything another folder owns. Safe to re-run."""
import csv, json, pathlib, shutil, os, re, datetime

QA = pathlib.Path(__file__).resolve().parent.parent
HOME = pathlib.Path.home()
SRC = HOME / ".cache/agi-audit/leader-docs/2026-11-22"
RES = SRC / "results"
LANE = HOME / ".cache/agi-audit/web-lane"
TODAY = datetime.date.today().isoformat()
one = lambda s: re.sub(r"\s+", " ", str(s or "")).strip()

def link(name, target):
    name = QA / name; name.parent.mkdir(parents=True, exist_ok=True)
    if name.is_symlink() or name.exists(): name.unlink()
    os.symlink(target, name)

cmp_dir = QA / "../50-competitors/data"; cmp_dir.mkdir(exist_ok=True)
ids = {}
for f in ("missing-in-agi.csv", "partly-there.csv"):
    shutil.copy2(RES / "missing" / f, cmp_dir / f)
    for r in csv.DictReader(open(RES / "missing" / f)): ids[(r["app"].lower().replace(" ", ""), one(r["feature"]).lower())] = r["id"]
lists = cmp_dir / "lists-to-read"; lists.mkdir(exist_ok=True)
for f in (RES / "missing").glob("*.md"): shutil.copy2(f, lists / f.name)
rows = json.loads((RES / "page/rows.json").read_text())["rows"]
names = {"web": "web", "desktop": "desktop", "mobile": "mobile", "cli": "cli", "vscode": "vscode", "chrome": "chrome"}
fields = ["list_id", "area", "feature", "claude", "chatgpt", "agi", "difference", "leader_note", "our_code", "leader_source"]
for app in names:
    with open(cmp_dir / f"comparison-{app}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(fields)
        for r in rows:
            if r["surface"] != app: continue
            w.writerow([ids.get((app, one(r["feature"]).lower()), ""), r["area"], one(r["feature"]), r["claude"], r["chatgpt"], r["agi"], one(r["difference"]), one(r.get("leader_note")), one(r["evidence"]), one(r["source"])])
re_rows = [json.loads(l) for l in open(RES / "missing/reverse-engineer-new.jsonl") if l.strip()]
with open(cmp_dir / "reverse-engineer-extra.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["id", "app", "area", "feature", "who_ships_it", "agi", "gap", "release"])
    for r in re_rows: w.writerow([r["id"], r["surface"], r["area"], one(r["feature"]), r["leader"], r["agi"], one(r.get("gap")), r.get("release", "")])
link("../50-competitors/data/leader-catalog.jsonl", SRC / "catalog.jsonl")
link("../50-competitors/data/leader-pages-saved", SRC)

d = QA / "defects"; d.mkdir(exist_ok=True)
raw = json.loads((RES / "page/findings.json").read_text()); finds = raw if isinstance(raw, list) else raw.get("findings", [])
keys = ["unit", "surface", "area", "feature", "severity", "category", "title", "location", "expected", "actual", "impact", "fix", "verify", "review"]
with open(d / "code-audit-defects.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(keys)
    for x in finds: w.writerow([one(x.get(k)) for k in keys])
probs = json.loads((LANE / "baseline-problems.json").read_text())
with open(d / "web-problems-seen-in-browser.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["basic", "mode", "size", "kind", "title", "exact_text_on_screen", "steps_to_reproduce", "screenshot", "evidence_folder", "run"])
    for p in sorted(probs, key=lambda p: (["blocker", "major", "minor", "cosmetic"].index(p["size"]), int(p["basic"][2:]))):
        w.writerow([p["basic"], p["mode"], p["size"], p["kind"], one(p["title"]), one(p.get("visible_text")), " | ".join(one(s) for s in p.get("repro_steps", [])), p.get("screenshot", ""), p.get("dir", ""), p.get("run", "20261124T1946Z")])
rc = d / "root-causes"; rc.mkdir(exist_ok=True)
for f in (LANE / "wave2").glob("*.md"): shutil.copy2(f, rc / f.name)
shutil.copy2(LANE / "wave2/summary.json", rc / "summary.json")
shutil.copy2(LANE / "fix-checks-20261124.json", d / "fix-checks-2026-11-24.json")

link("results/basics", RES / "baseline")
link("evidence/basics-runs", RES / "baseline/runs")
link("evidence/web-fix-checks-2026-11-24", LANE / "runs/verify")
link("evidence/web-server-logs", LANE / "logs")
link("setup/web-local-kit", LANE)
print("comparison rows", len(rows), "| defects", len(finds), "| web problems", len(probs), "| root causes", len(list(rc.glob('*.md'))))
