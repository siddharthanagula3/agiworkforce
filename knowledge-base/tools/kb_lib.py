"""Shared helpers for the knowledge-base build scripts. Everything is rebuilt from
data/raw (workflow outputs), the project's capability ledger and the code; nothing here
edits the project outside knowledge-base/."""
import csv, datetime, json, pathlib, re, subprocess

KB = pathlib.Path(__file__).resolve().parent.parent
REPO = KB.parent
RAW = KB / "data/raw"
LEDGER = REPO / "audit/ledger/ecosystem-capability-ledger.jsonl"
LEDGER_META = json.loads((REPO / "audit/ledger/ecosystem-capability-ledger.meta.json").read_text())
APPS = [("web", "Web"), ("desktop", "Desktop"), ("mobile", "Mobile"), ("cli", "CLI"), ("vscode", "VS Code"), ("chrome", "Chrome")]
APP_KEYS = [k for k, _ in APPS]
BUILT_ON = datetime.date.today().isoformat()
_authored_file = KB / "data/authored.json"
_authored = json.loads(_authored_file.read_text()) if _authored_file.exists() else {}
# Page headers carry the date and commit the content was read against, not the date of the last rebuild.
TODAY = _authored.get("date", BUILT_ON)


def git(*args):
    return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True).stdout.strip()


BUILT_AT = git("rev-parse", "--short=10", "HEAD")
HEAD = _authored.get("revision", BUILT_AT)


def slugify(text, limit=60):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:limit].strip("-")


def area_slug(sec):
    return f"{int(sec):03d}-" + slugify(LEDGER_META["sections"].get(str(sec), f"section {sec}"))


def area_title(sec):
    return LEDGER_META["sections"].get(str(sec), f"Section {sec}")


def ledger_items():
    return [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]


def load_raw(name):
    """Workflow output saved as data/raw/<name>.json; returns its `result` object."""
    f = RAW / f"{name}.json"
    if not f.exists():
        return None
    data = json.loads(f.read_text())
    return data.get("result", data)


def one_line(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def yaml_value(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(yaml_value(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ", ".join(f"{k}: {yaml_value(x)}" for k, x in v.items()) + "}"
    s = one_line(v)
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def front_matter(**fields):
    lines = ["---"]
    for k, v in fields.items():
        if v is None:
            continue
        lines.append(f"{k}: {yaml_value(v)}")
    lines += ["---", ""]
    return "\n".join(lines)


def path_of(ref):
    """'apps/web/x.ts:120-140 (note)' -> 'apps/web/x.ts'"""
    ref = ref.strip().strip("`").strip("()")
    ref = re.split(r"[\s,;]", ref, maxsplit=1)[0]
    return re.split(r":\d", ref, maxsplit=1)[0].strip("`").strip()


def exists(ref):
    p = path_of(ref)
    return bool(p) and not p.startswith("http") and (REPO / p).exists()


def write(rel, text):
    f = KB / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(text if text.endswith("\n") else text + "\n")
    return f


def read_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def cell_status(cells, app):
    c = (cells or {}).get(app)
    return c["s"] if c else "n/a"


def roll_up(statuses):
    """Implementation status of a feature on one app, from the statuses of its items."""
    real = [s for s in statuses if s != "n/a"]
    if not real:
        return "n/a"
    if all(s == "done" for s in real):
        return "built"
    if all(s == "missing" for s in real):
        return "missing"
    return "partial"


def live_result(cells, app):
    lv = ((cells or {}).get(app) or {}).get("live")
    return lv.get("result") if isinstance(lv, dict) else None
