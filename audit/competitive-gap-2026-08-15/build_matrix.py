#!/usr/bin/env python3
"""Generate GapMatrix.md deterministically from domains/*.json.

No model rewrites the matrix, so every filed gap appears verbatim and the counts
in the synthesis can never drift from the underlying data. To change a row,
change the JSON and re-run this script.

Usage:  python3 build_matrix.py
"""

import glob
import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
SEV_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
EFFORT_ORDER = {"S": 0, "M": 1, "L": 2, "XL": 3}


def load():
    domains = []
    for path in sorted(glob.glob(os.path.join(HERE, "domains", "*.json"))):
        with open(path) as fh:
            domains.append(json.load(fh))
    return domains


def cell(text, limit=None):
    """Make a value safe for a markdown table cell."""
    if text is None:
        return ""
    s = str(text).replace("|", "\\|").replace("\n", " ").strip()
    if limit and len(s) > limit:
        s = s[: limit - 1] + "…"
    return s


def main():
    domains = load()
    gaps = []
    for d in domains:
        for g in d.get("gaps", []):
            g = dict(g)
            g["_domain"] = d["domain"]
            gaps.append(g)

    gaps.sort(
        key=lambda g: (
            SEV_ORDER.get(g.get("severity"), 9),
            EFFORT_ORDER.get(g.get("effort"), 9),
            g.get("_domain", ""),
        )
    )

    sev = Counter(g.get("severity") for g in gaps)
    state = Counter(g.get("ourState") for g in gaps)
    prior = Counter(g.get("priorAudit") for g in gaps)
    effort = Counter(g.get("effort") for g in gaps)

    out = []
    w = out.append

    w("# Competitive Gap Matrix — AGI Workforce vs ChatGPT · Claude · Gemini · Manus")
    w("")
    w("**Generated** by `build_matrix.py` from `domains/*.json`. Do not hand-edit — "
      "change the JSON and re-run, so the matrix and the synthesis can never drift apart.")
    w("")
    w("**Benchmark:** `~/Desktop/competitive-product-research` — 68 files recording a "
      "live browser session against the real production apps of ChatGPT (GPT-5.6 Sol), "
      "Claude (Sonnet 5), Gemini (3.1 Pro) and Manus on 2026-08-15. Every benchmark claim "
      "carries that corpus's own evidence label (OBSERVED / STRONGLY INFERRED / UNVERIFIED).")
    w("")
    w(f"**Totals:** {len(gaps)} gaps across {len(domains)} domains.")
    w("")

    w("| Severity | Count | | Our state | Count | | Vs prior audit | Count | | Effort | Count |")
    w("|---|---|---|---|---|---|---|---|---|---|---|")
    rows = max(len(sev), len(state), len(prior), len(effort))
    sv = sorted(sev.items(), key=lambda kv: SEV_ORDER.get(kv[0], 9))
    st = state.most_common()
    pr = prior.most_common()
    ef = sorted(effort.items(), key=lambda kv: EFFORT_ORDER.get(kv[0], 9))
    for i in range(rows):
        def pick(seq):
            return (seq[i][0], str(seq[i][1])) if i < len(seq) else ("", "")
        a = pick(sv); b = pick(st); c = pick(pr); d = pick(ef)
        w(f"| {a[0]} | {a[1]} | | {b[0]} | {b[1]} | | {c[0]} | {c[1]} | | {d[0]} | {d[1]} |")
    w("")

    w("## Reading the columns")
    w("")
    w("- **MISSING** — the capability does not exist.")
    w("- **BUILT_NOT_WIRED** — the code exists and works, but a link in the chain "
      "`UI → client → contract → network → handler` is absent, so no user can reach it. "
      "The highest-leverage class: usually small effort, large visible payoff.")
    w("- **PARTIAL** — reachable, but materially thinner than the benchmark.")
    w("- **PRESENT_WORSE** — we ship it, and ours is the weaker implementation.")
    w("- **DIFFERENT_BY_DESIGN** — a deliberate divergence, filed so the decision stays visible.")
    w("")

    for sname, label in (("P0", "P0 — users hit a broken or incorrect experience today"),
                         ("P1", "P1 — table-stakes capability the benchmark has and we lack or half-ship"),
                         ("P2", "P2 — real gap against the majority of the benchmark"),
                         ("P3", "P3 — single-product differentiator or polish")):
        sel = [g for g in gaps if g.get("severity") == sname]
        w(f"## {label} ({len(sel)})")
        w("")
        if not sel:
            w("_None._")
            w("")
            continue
        w("| ID | Gap | Domain | State | Effort | vs prior |")
        w("|---|---|---|---|---|---|")
        for g in sel:
            w(f"| `{cell(g.get('id'))}` | {cell(g.get('title'), 130)} | "
              f"{cell(g.get('_domain'), 34)} | {cell(g.get('ourState'))} | "
              f"{cell(g.get('effort'))} | {cell(g.get('priorAudit'))} |")
        w("")

    w("---")
    w("")
    w("## Full detail, every gap")
    w("")
    for g in gaps:
        w(f"### `{g.get('id')}` — {g.get('title')}")
        w("")
        w(f"**{g.get('severity')}** · {g.get('ourState')} · effort {g.get('effort')} · "
          f"{g.get('priorAudit')}"
          + (f" (`{g.get('priorAuditRef')}`)" if g.get("priorAuditRef") else "")
          + f" · _{g.get('_domain')}_")
        w("")
        w(f"**Benchmark.** {g.get('benchmark')}")
        w("")
        w(f"**Ours.** {g.get('ourEvidence')}")
        w("")
        w(f"**Recommendation.** {g.get('recommendation')}")
        w("")

    w("---")
    w("")
    w("## Where we match or beat all four benchmarked products")
    w("")
    for d in domains:
        ss = d.get("strengths") or []
        if not ss:
            continue
        w(f"### {d['domain']}")
        w("")
        for s in ss:
            w(f"- {s}")
        w("")

    w("---")
    w("")
    w("## Deliberately not copying")
    w("")
    w("The brief for this work said *\"Do not blindly clone either product.\"* These are "
      "benchmark behaviors we should decline on purpose, with the reason recorded so the "
      "decision does not get silently re-litigated as a gap later.")
    w("")
    for d in domains:
        nn = d.get("notWorthCopying") or []
        if not nn:
            continue
        w(f"### {d['domain']}")
        w("")
        for n in nn:
            w(f"- {n}")
        w("")

    path = os.path.join(HERE, "GapMatrix.md")
    with open(path, "w") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"wrote {path}")
    print(f"  {len(gaps)} gaps · {len(domains)} domains")
    print("  severity:", dict(sv))
    print("  state:   ", dict(st))
    print("  prior:   ", dict(pr))


if __name__ == "__main__":
    main()
