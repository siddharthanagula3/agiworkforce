#!/usr/bin/env python3
"""Run every light repository check with this folder present and report any whose output
mentions the folder. The folder is kept out of git by a local ignore entry; this proves
that no repository check reads it anyway.  Usage: python3 -I tools/check_no_interference.py"""
import json, pathlib, re, subprocess, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kb_lib import KB, REPO, TODAY, HEAD, write

HEAVY = re.compile("car" + "go|\\bts" + "c\\b|vi" + "test|je" + "st|tur" + "bo|play" + "wright|pnpm --filter|es" + "lint|xcode|gradle|ex" + "po |ne" + "xt build")
scripts = json.loads((REPO / "package.json").read_text())["scripts"]
names = [n for n, c in scripts.items() if n.startswith("check:") and "run-guard-chain" not in c and not HEAVY.search(c)]
skipped = [n for n, c in scripts.items() if n.startswith("check:") and n not in names]
out, mention, failed = {}, [], []
for n in names:
    try:
        r = subprocess.run(["pnpm", "-s", n], cwd=REPO, capture_output=True, text=True, timeout=300)
        text = r.stdout + r.stderr
        out[n] = r.returncode
        if "knowledge-base" in text: mention.append(n)
        if r.returncode != 0: failed.append(n)
    except subprocess.TimeoutExpired:
        out[n] = "timeout"
write("90-meta/no-interference.json", json.dumps({"generated": TODAY, "revision": HEAD, "checks_run": len(names), "checks_skipped_as_heavy": skipped, "mention_this_folder": mention, "failing": failed, "results": out}, indent=1))
print(f"ran {len(names)} | skipped as heavy {len(skipped)} | mention knowledge-base: {mention} | failing: {failed}")
