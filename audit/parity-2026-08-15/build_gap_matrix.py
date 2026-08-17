#!/usr/bin/env python3
"""Assemble GapMatrix.md deterministically from the per-domain gap JSON files.

Deterministic assembly is deliberate: the master inventory must contain every
filed gap verbatim, with no model in the loop to drop, merge, or re-word rows.
"""
import json, glob, collections, os, sys, re

BASE = 'audit/parity-2026-08-15'
OUT = f'{BASE}/GapMatrix.md'
SEV_ORDER = {'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3}

DOMAIN_TITLES = {
    'shell-nav-ia': 'Application shell, navigation & information architecture',
    'composer': 'Composer',
    'rendering': 'Message rendering & response actions',
    'models': 'Models & reasoning',
    'search-research': 'Search & deep research',
    'projects-files': 'Projects, files & library',
    'artifacts': 'Artifacts & creation workspaces',
    'agentic-work': 'Agentic work & scheduled tasks',
    'memory': 'Memory & personalization',
    'extensibility': 'Skills, plugins & connectors',
    'voice-media': 'Voice, image & video',
    'backend-runtime': 'Backend & runtime architecture',
    'design-system': 'Design system & accessibility',
    'settings': 'Settings',
    'cross-surface': 'Cross-surface parity & shared architecture',
    'dead-code': 'Dead, disconnected code & reliability',
}

SURFACE_TITLES = {
    'web': 'Web', 'mobile': 'Mobile', 'desktop-tauri': 'Desktop (Tauri)',
    'desktop-electron': 'Desktop (Electron)', 'extension-chrome': 'Chrome extension',
    'extension-vscode': 'VS Code extension', 'cli': 'CLI', 'backend': 'Backend',
    'shared': 'Shared packages', 'cross-surface': 'Cross-surface',
}


def esc(s):
    """Make a value safe inside a markdown table cell."""
    if s is None:
        return ''
    s = str(s).replace('|', '\\|')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def load():
    rows, bad = [], []
    for f in sorted(glob.glob(f'{BASE}/gaps/domain-*.json')):
        try:
            data = json.load(open(f))
            if not isinstance(data, list):
                bad.append((f, 'not a list'))
                continue
            for r in data:
                r['_src'] = os.path.basename(f)
            rows += data
        except Exception as e:
            bad.append((f, repr(e)))
    return rows, bad


def main():
    rows, bad = load()
    if bad:
        print('PARSE FAILURES:', bad, file=sys.stderr)

    # Stable sort: severity, then domain, then id.
    rows.sort(key=lambda r: (SEV_ORDER.get(r.get('severity'), 9),
                             r.get('domain', ''), r.get('id', '')))

    sev = collections.Counter(r.get('severity', '?') for r in rows)
    dom = collections.Counter(r.get('domain', '?') for r in rows)
    surf = collections.Counter(r.get('surface', '?') for r in rows)
    typ = collections.Counter(r.get('gapType', '?') for r in rows)
    prior = [r for r in rows if r.get('priorArtId')]

    L = []
    A = L.append
    A('# GapMatrix — master gap inventory')
    A('')
    A('**Audit date:** 2026-08-15 · **Commit:** `e15df56e3` (`compliance/dpdp`), working tree clean')
    A('')
    A('This file is **generated deterministically** from the per-domain gap files in')
    A('`audit/parity-2026-08-15/gaps/domain-*.json` by')
    A('`scripts` in the audit scratchpad. No model rewrites it, so every filed gap')
    A('appears here verbatim. To change a row, change its domain JSON and regenerate.')
    A('')
    A('Each gap was filed by a domain analyst that read the benchmark evidence in')
    A('`research/`, read the repo inventory in `inventory/`, and then **verified the')
    A('claim in code** before filing. Rows carrying a `Prior art` id were already')
    A('tracked in `audit/ui-gaps.csv` and are cross-referenced rather than duplicated.')
    A('')

    A('## Totals')
    A('')
    A(f'**{len(rows)} gaps** across {len(dom)} domains and {len(surf)} surfaces.')
    A('')
    A('| Severity | Count | Meaning |')
    A('| --- | ---: | --- |')
    for s, meaning in [
        ('P0', 'Blocks a primary workflow or makes the product unsuitable for a serious demo'),
        ('P1', 'Major parity gap — functionality expected of a modern ChatGPT/Claude-class product'),
        ('P2', 'Product-quality gap — works, but below the benchmark'),
        ('P3', 'Enhancement, optimization or differentiation'),
    ]:
        A(f'| **{s}** | {sev.get(s, 0)} | {meaning} |')
    A('')
    A('> **Scoping note on the P0 count.** These counts cover gaps filed by *this*')
    A("> audit round's 16 domain analysts. They deliberately exclude P0s already")
    A('> tracked elsewhere and not re-derived here — notably **`GAP-P0-003`**')
    A('> ("production promotion has no successful proof for the current head") from')
    A('> `docs/current/gap-audit-2026-08-08.md`, which this round independently')
    A('> re-confirmed with fresh evidence in `inventory/deployment-state.md` and')
    A('> `inventory/prod-vs-source-drift.md`. Read this table as "new P0s found by')
    A('> this round", not "all P0s open against the product".')
    A('')

    A('### By surface')
    A('')
    A('| Surface | Gaps | P0 | P1 | P2 | P3 |')
    A('| --- | ---: | ---: | ---: | ---: | ---: |')
    for s, n in surf.most_common():
        c = collections.Counter(r.get('severity') for r in rows if r.get('surface') == s)
        A(f'| {SURFACE_TITLES.get(s, s)} | {n} | {c.get("P0",0)} | {c.get("P1",0)} | {c.get("P2",0)} | {c.get("P3",0)} |')
    A('')

    A('### By gap type')
    A('')
    A('| Gap type | Count |')
    A('| --- | ---: |')
    for t, n in typ.most_common():
        A(f'| {t} | {n} |')
    A('')

    A('### By domain')
    A('')
    A('| Domain | Gaps | P0 | P1 | P2 | P3 |')
    A('| --- | ---: | ---: | ---: | ---: | ---: |')
    for d, n in sorted(dom.items()):
        c = collections.Counter(r.get('severity') for r in rows if r.get('domain') == d)
        A(f'| {DOMAIN_TITLES.get(d, d)} | {n} | {c.get("P0",0)} | {c.get("P1",0)} | {c.get("P2",0)} | {c.get("P3",0)} |')
    A('')

    A(f'### Cross-referenced with prior art')
    A('')
    A(f'{len(prior)} of {len(rows)} gaps correspond to a row already tracked in')
    A('`audit/ui-gaps.csv`. They are recorded here with their existing id so the two')
    A('ledgers stay reconcilable rather than diverging.')
    A('')
    if prior:
        A('| Gap | Prior art | Title |')
        A('| --- | --- | --- |')
        for r in sorted(prior, key=lambda x: str(x.get('priorArtId'))):
            A(f'| `{esc(r.get("id"))}` | `{esc(r.get("priorArtId"))}` | {esc(r.get("feature"))} |')
        A('')

    # Index
    A('## Index — all gaps by severity')
    A('')
    A('| ID | Sev | Surface | Feature | Type |')
    A('| --- | --- | --- | --- | --- |')
    for r in rows:
        A(f'| [`{esc(r.get("id"))}`](#{str(r.get("id","")).lower()}) | {esc(r.get("severity"))} '
          f'| {esc(SURFACE_TITLES.get(r.get("surface"), r.get("surface")))} '
          f'| {esc(r.get("feature"))} | {esc(r.get("gapType"))} |')
    A('')

    # Full detail
    A('---')
    A('')
    A('## Full gap detail')
    A('')
    for d in sorted(dom):
        drows = [r for r in rows if r.get('domain') == d]
        A(f'### {DOMAIN_TITLES.get(d, d)}')
        A('')
        A(f'*{len(drows)} gaps · source: `gaps/domain-{d}.json` · narrative: `gaps/domain-{d}.md`*')
        A('')
        for r in drows:
            A(f'#### {r.get("id")}')
            A('')
            A(f'**{esc(r.get("feature"))}** — {r.get("severity")} · '
              f'{SURFACE_TITLES.get(r.get("surface"), r.get("surface"))} · `{r.get("gapType")}`'
              + (f' · prior art `{r.get("priorArtId")}`' if r.get('priorArtId') else ''))
            A('')
            if r.get('screen') and r['screen'] != 'n/a':
                A(f'*Screen/component:* {r["screen"]}')
                A('')
            A(f'**Current state.** {r.get("currentState","")}')
            A('')
            A(f'**Expected state.** {r.get("expectedState","")}')
            A('')
            if r.get('benchmarkRef'):
                A(f'**Benchmark.** {r["benchmarkRef"]}')
                A('')
            if r.get('evidence'):
                A(f'**Evidence.** {r["evidence"]}')
                A('')
            files = r.get('files') or []
            if files:
                A('**Files.**')
                A('')
                for f in files:
                    A(f'- `{f}`')
                A('')
            if r.get('recommendation'):
                A(f'**Recommendation.** {r["recommendation"]}')
                A('')
            A('')

    open(OUT, 'w').write('\n'.join(L) + '\n')
    print(f'wrote {OUT}: {len(rows)} gaps, {len(L)} lines')
    print('severity:', dict(sev))
    if bad:
        print('WARNING parse failures:', bad)


if __name__ == '__main__':
    main()
