#!/usr/bin/env python3
"""Count, per app, how many test-plan items have a path and how well it is confirmed."""
import json, pathlib, re, collections, sys
QA = pathlib.Path(__file__).resolve().parent.parent
for app in sys.argv[1:] or ["web", "desktop", "mobile", "cli", "vscode", "chrome"]:
    marks = collections.Counter(); n = 0
    for f in sorted((QA / "test-plans" / app).glob("[0-9]*.md")):
        t = f.read_text(); n += len(re.findall(r"^## S", t, re.M))
        for m in re.findall(r"\*\*Where to find it:\*\* (.*)", t):
            k = ("not written yet" if m.startswith("not written") else "no screen of its own" if m.startswith("no screen") else "not found in the code" if m.startswith("not found")
                 else "labels confirmed" if "labels found in the code" in m else "partly confirmed" if "some labels" in m else "path not confirmed")
            marks[k] += 1
    print(app, n, dict(marks))
