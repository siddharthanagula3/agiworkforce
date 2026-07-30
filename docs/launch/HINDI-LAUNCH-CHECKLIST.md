# Hindi Launch Checklist

**Status:** Pre-launch (founder must complete scoring before claiming Hindi support in store copy)
**Scope:** v1 Hindi. Marathi / Bengali / Tamil are v1.1.
**Target model:** Qwen3-4B-Instruct-2507 (on-device, mobile)

---

## Founder action items (must complete before claiming "Hindi support")

### 1. Run the 60-prompt suite on a real device

- Enable: Settings → Performance → "Run Hindi QA test"
- This loads `tasks/research/HINDI-QA-MATRIX-2026-05-18.md` prompts into the QA harness
- Review each model output against the `expectedCriteria` in the matrix
- Fill in the scoring sheet at the bottom of that document

### 2. Set acceptance thresholds

Update `apps/mobile/services/languageQA.ts::HINDI_ACCEPTANCE_THRESHOLD` with:

```ts
export const HINDI_ACCEPTANCE_THRESHOLD = {
  minOverallHumanScore: X, // your chosen minimum (scale 0-3)
  minPerCategoryScore: Y, // minimum for any single category
  minBleu: 0.35, // translation category (spec default)
  minChrF: 0.55, // translation / summarization (spec default)
};
```

### 3. Score the 6 categories

| Category          | Prompts | Scoring method                 | Target                   |
| ----------------- | ------- | ------------------------------ | ------------------------ |
| Chat (A)          | 10      | Human 0–3                      | ≥ founder-defined        |
| Translation (B)   | 10      | BLEU / chrF + Human for idioms | BLEU ≥ 0.35, chrF ≥ 0.55 |
| Summarization (C) | 10      | Human 0–3                      | ≥ founder-defined        |
| Hinglish (D)      | 10      | Human 0–3                      | ≥ founder-defined        |
| Cultural (E)      | 10      | Human 0–3                      | ≥ founder-defined        |
| Technical (F)     | 10      | Human 0–3                      | ≥ founder-defined        |

---

## Acceptance gate

- [ ] Overall average human score ≥ threshold (set by founder after review)
- [ ] No single category average below per-category minimum
- [ ] Translation BLEU ≥ 0.35 for B-01, B-02, B-03, B-08, B-10
- [ ] Translation chrF ≥ 0.55 for B-04, B-05, B-09
- [ ] Cultural E-10 correct (6 ritu, not 4 Western seasons) — mandatory pass
- [ ] Cultural E-05 correct (Karan Johar, correct cast) — mandatory pass

If any mandatory-pass item fails, consider the model unacceptable regardless of overall score.

---

## Fallback decision tree

If Qwen3-4B Hindi quality is below threshold:

1. **Try Llama 3.2 3B** — run same 60-prompt suite, compare scores
2. **Try Gemma 3n** — run same 60-prompt suite, compare scores
3. **Apple Translate fallback** — for translation-only tasks (not chat/reasoning)
4. **Defer Hindi to v1.1** — revert store copy to English-only, re-evaluate with Qwen3-8B when available

Document which fallback was chosen and why in this file before launch.

**Chosen fallback (fill in):** **\*\***\_\_\_**\*\***

---

## App Store / Play Store copy gates

- [ ] Hindi quality gate above is passing
- [ ] In-app language picker shows Hindi (हिंदी) as selectable option
- [ ] Hindi UI labels deferred to v1.1 — current scope: system locale detection only
- [ ] Store listing copy reviewed: do NOT claim "full Hindi UI" in v1 — claim "Hindi language support in chat" only
- [ ] Apple Translate / Apple Intelligence Live Translation NOT relied upon for Hindi core functionality (own-it architecture)

---

## v1.1 deferred (do not block v1 launch on these)

- Marathi support
- Bengali support
- Tamil support
- Hindi UI labels (Devanagari navigation + menus)
- Hindi voice input (Speech framework Hindi locale)
- Hindi TTS output

---

## Signoff

| Role    | Date | Threshold set | Result      |
| ------- | ---- | ------------- | ----------- |
| Founder |      |               | PASS / FAIL |

After founder signoff, update `AGI_WORKFORCE.md` Hindi section and set store copy accordingly.
