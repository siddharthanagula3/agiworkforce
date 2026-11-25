#!/usr/bin/env python3
"""Take the output file of a path-writing or setup-writing workflow and put it into
this folder: navigation paths under test-plans/<app>/where/, setup pages under setup/.
Then rebuild the plans.  Usage: python3 -I tools/apply_paths.py <workflow-output-file> [...]"""
import json, pathlib, subprocess, sys, datetime, collections

QA = pathlib.Path(__file__).resolve().parent.parent
NAMES = {"web": "Web", "desktop": "Desktop", "mobile": "Mobile", "cli": "CLI", "vscode": "VS Code", "chrome": "Chrome"}
TODAY = datetime.date.today().isoformat()
tally = collections.Counter()

def setup_page(s):
    low = s["app"].lower()
    app = next((k for k, words in (("vscode", ("vs code", "vscode", "visual studio")), ("chrome", ("chrome",)), ("mobile", ("mobile", "ios", "android")), ("cli", ("cli", "terminal")), ("desktop", ("desktop", "electron"))) if any(w in low for w in words)), low.split()[0])
    out = [f"# Running the {NAMES.get(app, s['app'])} app locally", "",
           f"Written {TODAY} from the project's own documents and scripts by reading them. **The commands below were not run by the session that wrote this page.** Each step names the file it came from; if a step fails, read that file.",
           "", "**Local web server:** wherever a step below starts the web app, use the compiled build described in `web.md` on port 3000. It is what the Web checks ran against and it behaves like the released app; a development server does not.",
           "", "## What it is", "", s["what_it_is"], "", "## Needed first", ""]
    out += [f"- {p}" for p in s["prerequisites"]] or ["- nothing listed"]
    out += ["", "## Steps", ""]
    for i, st in enumerate(s["steps"], 1):
        out.append(f"{i}. {st['what']}  (from `{st['source']}`)")
        if st.get("command"): out += ["", "   ```bash", f"   {st['command']}", "   ```", ""]
    out += ["", "## Signing in", "", s["sign_in"], "", "## Modes", "", "| Mode | How | From |", "|---|---|---|"]
    out += [f"| {m['mode']} | {m['how'].replace('|', '/')} | `{m['source']}` |" for m in s["modes"]]
    out += ["", "## How to tell it is running", "", s["how_to_tell_it_is_running"], "", "## Cannot be done on this computer", ""]
    out += [f"- {x}" for x in s["cannot_be_done_on_this_computer"]] or ["- nothing listed"]
    out += ["", "## Not found in the project's documents", "", "Steps a tester needs that the documents do not give. Work them out on first use and write them here.", ""]
    out += [f"- {x}" for x in s["not_found_in_the_docs"]] or ["- nothing listed"]
    (QA / "setup" / f"{app}.md").write_text("\n".join(out) + "\n"); tally[f"setup:{app}"] += 1

for arg in sys.argv[1:]:
    data = json.loads(pathlib.Path(arg).read_text())
    res = data.get("result", data)
    for chunk in res.get("paths", []):
        d = QA / "test-plans" / chunk["app"] / "where"; d.mkdir(parents=True, exist_ok=True)
        f = d / f"{chunk['slug']}.json"
        cur = json.loads(f.read_text()) if f.exists() else {}
        for it in chunk["items"]:
            cur[it["id"].strip()] = {k: v for k, v in it.items() if k != "id"}; tally[f"{chunk['app']}:{it['reachable']}"] += 1
        f.write_text(json.dumps(cur, indent=1, sort_keys=True))
        if len(chunk["items"]) != chunk.get("asked", len(chunk["items"])): tally[f"{chunk['app']}:short-areas"] += 1
    for s in res.get("setup", []): setup_page(s)
print(dict(sorted(tally.items())))
subprocess.run([sys.executable, "-I", str(QA / "tools/build_plans.py")], stdout=subprocess.DEVNULL, check=True)
