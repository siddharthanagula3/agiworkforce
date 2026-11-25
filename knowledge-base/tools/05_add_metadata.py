#!/usr/bin/env python3
"""Give every page that has no metadata header one, derived from where it sits.
Generated pages get theirs from their own builders; this covers hand-written and copied pages.
Idempotent. Run before 04_build_indexes.py."""
import pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from kb_lib import *

TYPES = [("70-qa/test-plans/", "test-plan"), ("70-qa/setup/", "setup"), ("70-qa/start-here/", "qa-method"), ("70-qa/defects/root-causes/", "root-cause"), ("70-qa/defects/", "defect-list"), ("70-qa/results/", "results"),
         ("70-qa/code-status/", "code-status"), ("70-qa/evidence/", "evidence"), ("70-qa/", "qa"), ("50-competitors/data/", "comparison-data"), ("50-competitors/", "competitor"), ("00-start/", "overview"),
         ("10-requirements/", "requirements"), ("90-meta/", "meta"), ("60-engineering/", "engineering"), ("40-systems/", "system"), ("30-surfaces/", "surface")]
n = 0
for f in sorted(KB.rglob("*.md")):
    rel = f.relative_to(KB).as_posix()
    if rel.startswith(("data/", "tools/")) or f.is_symlink(): continue
    text = f.read_text(errors="ignore")
    if text.startswith("---\n"): continue
    title = (re.search(r"^# (.+)$", text, re.M) or [None, f.stem.replace("-", " ")])[1]
    kind = next((t for p, t in TYPES if rel.startswith(p)), "page")
    extra = {}
    m = re.match(r"70-qa/test-plans/(\w+)/(\d{3})-", rel)
    if m: extra = {"app": m.group(1), "area": str(int(m.group(2)))}
    did = ("PLAN-" + m.group(1) + "-" + m.group(2)) if m else "DOC-" + slugify(rel[:-3], 90)
    f.write_text(front_matter(id=did, type=kind, title=title, last_reviewed=TODAY, revision=HEAD, **extra) + text); n += 1
print("metadata headers added:", n)
