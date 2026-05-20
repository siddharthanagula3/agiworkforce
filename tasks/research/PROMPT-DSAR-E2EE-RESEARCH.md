# Research prompt — DSAR on E2EE hybrid local/cloud apps

**Date:** 2026-05-17 · **Target:** research agent (Explore-class with web tools) · **Output:** decision-grade memo + question list to brief a privacy attorney with.

---

## Mission

In 6-10 working hours, produce a memo that answers: **"For an app shaped like AGI — Local-mode data on the user's device (SQLCipher-encrypted, app-private) + opt-in Cloud sync with E2EE (server stores ciphertext only, key never leaves device) — what does GDPR-compliant DSAR satisfaction actually look like, and which regulator interpretations or case examples support that posture?"**

The memo is NOT a substitute for legal advice. It is the homework that maximizes the value of a $400-800 1-hour privacy-counsel consult. The deliverable lets you walk into that consult with a specific yes/no question list, not an open-ended "help me think about this."

## V4 PRD facts to ground in (don't re-decide)

- Local mode = SQLCipher SQLite on device, no server copy, BYOK keys in Keychain
- Cloud sync = opt-in only, user passphrase + Argon2 → key, server stores ciphertext only, key never sent
- AGI launches in EU on/about 2026-08-06 (Mobile public launch window)
- EU AI Act Article 50 ships pre-2026-08-02 (PRD §10 lock #26)
- Data subject is global; AGI is a US LLC (Texas)

## Specific questions to answer

### Q1 — Article 20 (portability)

- Does "personal data" under Art. 20 mean (a) data the controller can access, or (b) all data including ciphertext the controller cannot read?
- Has any EU Data Protection Authority published an opinion or decision on this for an E2EE app?
- What does "structured, commonly used, machine-readable format" mean when the data is encrypted client-side? Is the ciphertext blob sufficient?
- Recital 39 + Recital 71 commentary — quote the relevant passages.

### Q2 — Article 17 (erasure / "right to be forgotten")

- Does Art. 17 apply to data the controller cannot decrypt?
- Is "uninstall the app" sufficient for device-side data?
- Must AGI also wipe the encrypted server-side rows? With what retention guarantee?
- Tombstone records for compliance audit — what does Art. 17(3) require?

### Q3 — Article 11 (processing not requiring identification)

- Does Art. 11(2) provide an "out" for E2EE apps where the controller genuinely cannot link ciphertext to a specific user?
- What about Article 11(1) "identifiable natural person" — if the user is identifiable only via their account (not the data content), does that affect DSAR scope?

### Q4 — Reference implementations

Read the privacy policies + Data Processing Agreements + Help Center articles of **all eight** of these E2EE-shaped apps:

- **Signal** (Signal Messenger LLC, US) — signal.org/legal/
- **Proton Mail / Proton Drive** (Proton AG, Switzerland) — proton.me/legal
- **Standard Notes** (Standard Industries, US) — standardnotes.com/help/63
- **Cryptee** (Cryptee LLP, Estonia) — crypt.ee/about
- **Tutanota** (Tutao GmbH, Germany) — tuta.com/privacy-policy
- **Bitwarden** (Bitwarden Inc., US) — bitwarden.com/help/data-portability/
- **Anytype** (Any Association, Switzerland) — anytype.io/privacy
- **1Password** (AgileBits, Canada) — 1password.com/legal/privacy

For each, extract:

- Verbatim DSAR policy / data-export procedure
- Whether they hand the user ciphertext, plaintext, or both
- Erasure procedure: device-only, server-only, or both
- Stated legal basis for their interpretation
- Any disclosed regulator interaction or enforcement (look for fines / opinions / settlements)

### Q5 — Regulator decision databases

Search for E2EE-related DSAR decisions or guidance in:

- **CNIL** (France) — cnil.fr/en/case-law
- **ICO** (UK; GDPR-aligned post-Brexit) — ico.org.uk/about-the-ico/our-information/decisions-and-fines/
- **Garante** (Italy) — garanteprivacy.it
- **Hamburg DPA / BfDI** (Germany) — datenschutz-hamburg.de, bfdi.bund.de
- **Datatilsynet** (Norway, EEA — strong E2EE positions historically) — datatilsynet.no
- **EDPB** (European Data Protection Board) — edpb.europa.eu/our-work-tools/our-documents
- **DPC Ireland** (where most US tech companies are EU-headquartered) — dataprotection.ie

Look specifically for: (a) opinions on Signal/Proton-shaped apps, (b) any fines for E2EE app DSAR non-compliance, (c) guidelines on "data the controller cannot access."

### Q6 — US state law variations

Same DSAR question but under:

- **CCPA / CPRA** (California) — oag.ca.gov/privacy/ccpa
- **Colorado Privacy Act**
- **Connecticut Data Privacy Act**
- **Virginia CDPA**
- **Texas TRAIGA (HB 149)** — effective Jan 1 2026

Note any state that diverges from GDPR on E2EE specifically.

## Methodology

Four passes:

1. **Primary regulator pages** (Q5 + Q6) — official decisions, fines, opinions only.
2. **Reference-impl privacy policies** (Q4) — capture verbatim, not paraphrase.
3. **Academic + IAPP commentary** — Berkeley Tech LJ, Journal of Privacy Law, IAPP knowledge base. Filter to ≤2 years old.
4. **GDPR.eu + EUR-Lex** for treaty text + recitals.

## Deliverable

Single markdown file at `tasks/research/dsar-e2ee-research-2026-05-17.md`, ~3000-4500 words:

1. **Executive verdict** — what AGI's DSAR posture should be, three sentences.
2. **Q1-Q3 answers** with verbatim regulator/treaty citations.
3. **Q4 reference-impl comparison table** — 8 apps × {export shape, erasure shape, legal basis, regulator interaction}.
4. **Q5-Q6 regulator decision survey** — every relevant decision with date + outcome + jurisdiction.
5. **Three risk scenarios** AGI could face (most-likely + medium + worst-case) with citation backing.
6. **Question list for the attorney** — 5-10 specific, yes/no-or-bounded questions to put to a GDPR-licensed privacy attorney in the 1-hour consult. Each should be answerable in 5-10 minutes and produce a written opinion to file at `docs/legal/dsar-opinion-2026-XX.md`.
7. **Sources** — every URL with retrieved-date.

## Quality bar

- Every numeric claim or regulator citation has a primary-source URL with date.
- Verbatim quotes for treaty text + regulator decisions; paraphrase OK for commentary.
- Counter-evidence logged (e.g., if Hamburg DPA holds one view and CNIL another, log both).
- No invented case names. No "in theory" arguments unless sourced.
- If no public answer exists, log `awaiting-counsel` — don't speculate.

## Stop criteria

- After Q4 returns 5+ reference impls' policies → switch to Q5.
- After Q5 returns 3+ relevant DPA decisions → switch to synthesis.
- If 8 hours elapsed and no decisive regulator opinion found, ship what you have + flag the gap as "the attorney must opine on this."

---

_End of brief. Self-contained. This memo gates the EU launch decision — it is the highest-leverage research item in V5._
