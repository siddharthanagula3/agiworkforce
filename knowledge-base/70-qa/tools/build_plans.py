#!/usr/bin/env python3
"""Build the per-app test plans, result sheets and code-status sheets from the
repository's capability ledger. Reads the project folder; writes only inside this
QA folder. Re-run any time: result sheets keep what a tester already filled in.

Usage: python3 -I tools/build_plans.py [path-to-project]   (default ~/Desktop/agiworkforce)
"""
import csv, json, pathlib, re, subprocess, sys, datetime

QA = pathlib.Path(__file__).resolve().parent.parent
REPO = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / "Desktop/agiworkforce")
LEDGER = REPO / "audit/ledger/ecosystem-capability-ledger.jsonl"
META = json.loads((REPO / "audit/ledger/ecosystem-capability-ledger.meta.json").read_text())
APPS = [("web", "Web"), ("desktop", "Desktop"), ("mobile", "Mobile"), ("cli", "CLI"), ("vscode", "VS Code"), ("chrome", "Chrome")]
CODE_ONLY = [("api", "API"), ("platform", "Platform")]
TESTABLE = {"done", "partial", "unverified"}
RESULT_FIELDS = ["id", "section", "feature", "expected", "code_status", "evidence_check", "earlier_live_check",
                 "result", "tested_on", "build_tested", "what_was_seen", "evidence_path"]
KEEP = ["result", "tested_on", "build_tested", "what_was_seen", "evidence_path"]

def git(*a):
    return subprocess.run(["git", "-C", str(REPO), *a], capture_output=True, text=True).stdout.strip()

HEAD = git("rev-parse", "--short=10", "HEAD")
DIRTY = len(git("status", "--porcelain").splitlines())
TODAY = datetime.date.today().isoformat()
_cache = {}

def text_of(path):
    if path not in _cache:
        f = REPO / path
        try:
            _cache[path] = f.read_text(errors="ignore") if f.is_file() else None
        except OSError:
            _cache[path] = None
    return _cache[path]

def squash(s):
    return re.sub(r"\s+", "", s or "")

def check_evidence(ev):
    """Return (verdict, detail). Verdict: present | moved | gone | none."""
    if not ev:
        return "none", "the ledger gives no code location"
    notes, worst = [], "present"
    for e in ev:
        p, anchor, lines = e.get("p", ""), e.get("a", ""), e.get("l") or []
        body = text_of(p)
        where = f"{p}:{lines[0]}" if lines else p
        if body is None:
            notes.append(f"{where} (file no longer exists)"); worst = "gone"; continue
        if not anchor:
            notes.append(f"{where} (file exists)"); continue
        if anchor in body:
            line = body[: body.index(anchor)].count("\n") + 1
            notes.append(f"{p}:{line}")
        elif squash(anchor) in squash(body):
            notes.append(f"{p} (text found, layout changed)")
        else:
            notes.append(f"{where} (quoted code not found in the file now)")
            if worst == "present": worst = "moved"
    return worst, "; ".join(notes)

def load_where(app):
    """Paths and steps written from the code, one JSON file per area: {item id: {...}}."""
    found = {}
    for f in sorted((QA / "test-plans" / app / "where").glob("*.json")):
        try: found.update(json.loads(f.read_text()))
        except ValueError: pass
    return found

def label_check(labels):
    ok, bad = [], []
    for lab in labels or []:
        text, path = (lab.get("text") or "").strip(), lab.get("file") or ""
        body = text_of(path)
        (ok if body is not None and text and text in body else bad).append(f'"{text}" in {path}')
    return ok, bad

def where_lines(w):
    if not w: return ["- **Where to find it:** not written yet"]
    out = []
    if w.get("reachable") == "not_from_ui":
        out.append(f"- **Where to find it:** no screen of its own. {w.get('note', '')}".rstrip())
    elif w.get("where"):
        ok, bad = label_check(w.get("labels"))
        mark = "labels found in the code" if ok and not bad else ("some labels not found in the code; trust the screen" if ok else "path not confirmed in the code; trust the screen")
        out.append(f"- **Where to find it:** {w['where']} ({mark})")
    else:
        out.append(f"- **Where to find it:** not found in the code. {w.get('note', '')}".rstrip())
    if w.get("needs") and w["needs"].lower() != "none": out.append(f"- **Needs:** {w['needs']}")
    if w.get("steps"):
        out.append("- **Steps:**")
        out += [f"  {i}. {st}" for i, st in enumerate(w["steps"], 1)]
    return out

def live_text(cell):
    lv = cell.get("live")
    if not isinstance(lv, dict): return ""
    return f"{lv.get('result', '')}: {re.sub(r'\\s+', ' ', lv.get('notes', '')).strip()}".strip(": ")

def slug(n, title):
    return f"{int(n):03d}-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]

items = [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]
summary = []
for key, name in APPS + CODE_ONLY:
    human = (key, name) in APPS
    rows, by_section = [], {}
    for it in items:
        cell = (it.get("cells") or {}).get(key)
        if not cell or cell.get("s") not in TESTABLE: continue
        verdict, detail = check_evidence(cell.get("ev"))
        row = {
            "id": it["id"], "section": str(it["section"]), "feature": it["text"], "expected": it.get("criterion", ""),
            "code_status": cell["s"], "evidence_check": verdict, "evidence_detail": detail,
            "remaining": cell.get("remaining") or cell.get("miss") or "", "settle_by": cell.get("settleBy", ""),
            "resolved_by": cell.get("resolvedBy", ""), "earlier_live_check": live_text(cell),
            "decision_needed": bool(it.get("productDecisionNeeded")),
        }
        rows.append(row); by_section.setdefault(row["section"], []).append(row)
    counts = {s: sum(r["code_status"] == s for r in rows) for s in TESTABLE}
    ev = {v: sum(r["evidence_check"] == v for r in rows) for v in ("present", "moved", "gone", "none")}
    live = {}
    for r in rows:
        k = r["earlier_live_check"].split(":")[0] if r["earlier_live_check"] else "never"
        live[k] = live.get(k, 0) + 1
    summary.append((name, len(rows), counts, ev, live, human))

    cs = QA / "code-status"; cs.mkdir(exist_ok=True)
    with open(cs / f"{key}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["id", "section", "feature", "code_status", "evidence_check", "evidence_detail", "remaining", "resolved_by"])
        for r in rows: w.writerow([r["id"], META["sections"].get(r["section"], r["section"]), r["feature"], r["code_status"], r["evidence_check"], r["evidence_detail"], r["remaining"], r["resolved_by"]])
    if not human: continue

    plans = QA / "test-plans" / key; plans.mkdir(parents=True, exist_ok=True)
    where = load_where(key)
    for old in plans.glob("[0-9][0-9][0-9]-*.md"): old.unlink()
    index = [f"# {name}: test plan", "",
             f"Every capability the code says {name} has ({len(rows)} items), grouped by area. Built from the capability ledger on {TODAY} against the project folder at commit `{HEAD}` with {DIRTY} uncommitted files.",
             "", "| Area | Items | Never seen by a person | File |", "|---|---:|---:|---|"]
    for sec in sorted(by_section, key=lambda s: int(s)):
        title = META["sections"].get(sec, f"Section {sec}"); rs = by_section[sec]; fn = slug(sec, title) + ".md"
        never = sum(1 for r in rs if not r["earlier_live_check"].startswith("PASS"))
        index.append(f"| {sec}. {title} | {len(rs)} | {never} | [{fn}]({fn}) |")
        out = [f"# {name} · {sec}. {title}", "",
               f"{len(rs)} items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/{key}/results.csv` under the same ID.",
               "", "The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.", ""]
        for r in rs:
            out += [f"## {r['id']} {r['feature']}", "", f"- **Expected:** {r['expected'] or 'not written in the ledger'}",
                    f"- **Code:** {r['code_status']}. Evidence {r['evidence_check']}: {r['evidence_detail']}"]
            if r["remaining"]: out.append(f"- **Known to be unfinished:** {r['remaining']}")
            if r["settle_by"]: out.append(f"- **Needs:** {r['settle_by']}")
            if r["earlier_live_check"]: out.append(f"- **Earlier check in the running app:** {r['earlier_live_check']}")
            if r["decision_needed"]: out.append("- **Owner decision is open on this item.**")
            out += where_lines(where.get(r["id"])) + [""]
        (plans / fn).write_text("\n".join(out) + "\n")
    (plans / "README.md").write_text("\n".join(index) + "\n")

    res = QA / "results" / key; res.mkdir(parents=True, exist_ok=True)
    sheet, kept = res / "results.csv", {}
    if sheet.exists():
        for r in csv.DictReader(open(sheet)): kept[r["id"]] = {k: r.get(k, "") for k in KEEP}
    with open(sheet, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=RESULT_FIELDS); w.writeheader()
        for r in rows:
            base = {k: r.get(k, "") for k in RESULT_FIELDS if k not in KEEP}
            base["section"] = META["sections"].get(r["section"], r["section"])
            w.writerow({**base, **kept.get(r["id"], {k: "" for k in KEEP})})

lines = ["# Where the code stands, by app", "",
         f"Built {TODAY} from the capability ledger against the project folder at commit `{HEAD}` ({DIRTY} uncommitted files). The ledger's code audit dates from {META.get('auditedOn')} (commit `{str(META.get('auditedCommit'))[:10]}`) and has been updated since.",
         "", "**Reading the columns.** *Done, partial, unverified* are the code audit's verdicts. *Evidence present* means the exact code the audit quoted is still in the file today; *moved* means the file exists but that code is not found, so the item needs a fresh look; *gone* means the file was removed. *Seen by a person* counts items with a passing check in the running app.",
         "", "| App | Items to test | Done | Partial | Unverified | Evidence present | Moved | Gone | No location | Seen working by a person |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
for name, n, c, ev, live, human in summary:
    lines.append(f"| {name}{'' if human else ' (code only)'} | {n} | {c['done']} | {c['partial']} | {c['unverified']} | {ev['present']} | {ev['moved']} | {ev['gone']} | {ev['none']} | {live.get('PASS', 0)} |")
(QA / "code-status" / "summary.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines[4:]))
