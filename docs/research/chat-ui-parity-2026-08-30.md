# Chat UI parity: chatgpt.com and claude.ai, measured

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-01

Measured directly in the browser on 2026-08-30 against the signed-in products,
not recalled from training data. Every number below came from
`getBoundingClientRect` and `getComputedStyle` on the live pages.

## What was measured, and what that limits

All three products were on their **new-chat / landing screen** in **dark
appearance**, at a desktop window of 1470x835 and a phone viewport of 390x844.
Nothing here describes a conversation in progress, light mode, or a signed-out
page. A single snapshot of a product that ships continuously is a dated
observation; re-measure before treating any row as still true.

Two metrics are deliberately narrow because the obvious version of them lies:

- **Visible button count** counts only `<button>` inside the viewport with a
  non-zero box. It undercounts anything built from `div[role=button]` and
  overcounts a rail of small icons. Read it as a rough density signal.
- **Touch targets** are judged only on icon-only controls, using
  `min(width, height)`. A first attempt flagged every wide-but-short list row
  in Claude's sidebar as a violation, which is not what the 44px guidance is
  about.

## Desktop, 1470x835

|                           | chatgpt.com                                           | claude.ai                             |
| ------------------------- | ----------------------------------------------------- | ------------------------------------- |
| Page background           | `rgb(0, 0, 0)`                                        | `rgb(21, 21, 21)`                     |
| Body typeface             | system stack (`-apple-system-body, ui-sans-serif, …`) | **`anthropic-sans`**, system fallback |
| Composer width            | **768px**                                             | **640px**                             |
| Composer height (resting) | 52px                                                  | 114px                                 |
| Composer radius           | **28px**                                              | **14px**                              |
| Composer fill             | `rgb(33, 33, 33)`                                     | `rgb(32, 32, 31)`                     |
| Input font size           | 16px / 26px line                                      | 16px                                  |
| Buttons on page           | **86**                                                | **41**                                |
| Dominant control radius   | mixed; pill (9999px) and 8px                          | **6px** (28 controls), 8px (12)       |

Two different postures, both coherent:

**ChatGPT** commits to a wide reading column and a single tall pill. Pure black,
no brand typeface, a large radius on the one element the eye lands on. Control
count is high because the surface exposes a lot at once.

**Claude** commits to a narrower column, a small consistent radius, and a
custom typeface doing the brand work. Its dark is not black, `rgb(21,21,21)`
against a `rgb(32,32,31)` composer is a warm near-neutral, and the composer is
distinguished by a 11-unit lightness step rather than by a shadow or a glow.
Half the control count of ChatGPT on the same screen.

Neither uses a gradient, a glow, a glass blur, or a coloured accent on the
primary surface. Both hold their identity with type, spacing and one neutral
step. That is the same position `AGENTS.md` already commits this product to, so
parity here is not imitation, it is the same conclusion reached independently.

## Phone, 390x844

|                     | chatgpt.com                       | claude.ai          | agiworkforce (local)   |
| ------------------- | --------------------------------- | ------------------ | ---------------------- |
| Page background     | `rgb(0, 0, 0)`                    | `rgb(21, 21, 21)`  | `rgb(0, 0, 0)`         |
| Composer box        | x=16, w=358, h=87                 | x=20, w=350, h=114 | x=16, w=358, **h=136** |
| Composer radius     | 26px                              | 14px               | 26px                   |
| Composer placement  | **docked, 24px above the bottom** | centred            | centred                |
| Visible buttons     | **13** (from 86 on desktop)       | 34                 | 8                      |
| Horizontal overflow | none                              | none               | none                   |

### The one number that matters most

ChatGPT drops from **86 visible controls on desktop to 13 on a phone**. That is
the mobile design decision, and it is not a re-layout, it is a different set of
controls. Claude does less of this, and keeps its sidebar reachable.

AGI Workforce's phone composer is **136px tall against ChatGPT's 87px**, and the
difference is not the input. It is what sits underneath it. Measured at 390px,
the text trailing the composer reads:

> Auto · Web search on · Managed cloud · AGI can make mistakes. Check important
> info. · Privacy · Feedback

Neither reference product shows anything comparable below its input on a phone.
This is the finding the browser audit filed as **M11**, confirmed here against
two competitors rather than against taste.

## Where this leaves AGI Workforce

Parity is already held on the things that are easy to get loudly wrong:

- Neutral-first dark surface, no gradient or glow on the primary surface.
- 358px composer at 390px with 16px side margins, identical to ChatGPT's.
- 26px composer radius, within 2px of ChatGPT's 28/26.
- No horizontal overflow at 390px.

The gaps are density and disclosure, not styling:

1. **Composer footer (audit M11).** 136px against 87px, and the difference is
   six pieces of disclosure text. Both references keep one compact status line
   or none. This is measured, not preference.
2. **Control density on small screens.** ChatGPT sheds 85% of its controls
   between desktop and phone. This session's M5 fix moved the panel toggles
   behind one control at phone widths for exactly this reason; the composer
   toolbar has not had the same treatment (audit C1, S3).
3. **Typographic identity.** Claude carries a custom face; ChatGPT deliberately
   does not. Both are defensible. `ui-sans-serif` matches ChatGPT's posture, so
   this is a choice to make on purpose rather than a gap to close by default.

## What not to copy

The reference screenshots supplied with the audit are benchmarks for
**hierarchy and density**, not a visual target to reproduce. Two specifics:

- ChatGPT's mixed radius scale (pill and 8px in the same view) is not a system;
  Claude's single 6px step is. Prefer the latter shape of decision.
- Neither product's empty state should be copied wholesale. ChatGPT docks the
  composer with suggestions above it; Claude centres it under a greeting. The
  right answer here depends on what this product wants the first screen to say,
  which is a product question, not a parity question.

## Re-running this

The measurements come from `getBoundingClientRect` and `getComputedStyle` in a
signed-in browser tab. There is no fixture and no stored HTML: both products
change without notice, and a cached copy would go stale silently and be worse
than no record at all. Re-measure rather than trusting this file after any
significant redesign on either side.

## Re-measured 2026-09-01, after the frontend transition

AGI Workforce only. The competitor columns below are the 2026-08-30 readings
carried forward, chatgpt.com and claude.ai were **not** re-measured on this
pass, so treat those two columns as dated and re-measure before citing them.

Taken on `feat/frontend-parity-wave-1` against a local `next dev` build, signed
in as the QA account, dark appearance, new-chat screen, same
`getBoundingClientRect` / `getComputedStyle` method as above. The cookie consent
banner was dismissed first so it could not displace the composer. `#chat-composer`
is the measured element, which is the same box the 2026-08-30 phone row used
(x=16, w=358 reproduces exactly).

### Phone, 390x844

|                           | 2026-08-30     | 2026-09-01        | chatgpt.com       | claude.ai         |
| ------------------------- | -------------- | ----------------- | ----------------- | ----------------- |
| Composer height (resting) | **136px**      | **101px**         | 87px              | 114px             |
| Composer x / width        | 16 / 358       | 16 / 358          | 16 / 358          | 20 / 350          |
| Composer radius           | 26px           | 26px              | 26px              | 14px              |
| Composer fill             | not taken      | `rgb(33, 33, 33)` | `rgb(33, 33, 33)` | `rgb(32, 32, 31)` |
| Page background           | `rgb(0, 0, 0)` | `rgb(0, 0, 0)`    | `rgb(0, 0, 0)`    | `rgb(21, 21, 21)` |
| Footer row height         | not taken      | 20px              | ,                 | ,                 |
| Footer items              | 6              | **1**             | ,                 | ,                 |
| Visible buttons           | 8              | 6                 | 13                | 34                |
| Horizontal overflow       | none           | none              | none              | none              |

**M11 is substantially closed but not fully.** The composer dropped 35px, from
136px to 101px, and the six-item disclosure row collapsed to a single line. The
whole trailing text at 390px is now:

> AGI can make mistakes. Check important info.

Against the 2026-08-30 reading, "Auto · Web search on · Managed cloud · Privacy ·
Feedback" no longer render at phone width. What remains is the accuracy caveat
`lib/compliance/ai-act.ts` deliberately keeps, at 12px in a 20px row.

The remaining 14px over ChatGPT's 87px is not the footer, a 20px footer row plus
its 8px margin accounts for 28px of the 145px container, and the input box itself
is the 101px. Closing the rest means the input row, not the disclosure beneath it.

### Desktop, 1470x835

The 2026-08-30 desktop table had no AGI Workforce column. This is the first
reading for it.

|                           | agiworkforce (2026-09-01) | chatgpt.com       | claude.ai         |
| ------------------------- | ------------------------- | ----------------- | ----------------- |
| Composer width            | **736px**                 | 768px             | 640px             |
| Composer height (resting) | **127px**                 | 52px              | 114px             |
| Composer radius           | 26px                      | 28px              | 14px              |
| Composer fill             | `rgb(33, 33, 33)`         | `rgb(33, 33, 33)` | `rgb(32, 32, 31)` |
| Page background           | `rgb(0, 0, 0)`            | `rgb(0, 0, 0)`    | `rgb(21, 21, 21)` |
| Buttons on page           | 46                        | 86                | 41                |
| Horizontal overflow       | none                      | none              | none              |

Desktop keeps the full disclosure row, 24px tall:

> Web search on · Managed cloud · AGI can make mistakes. Check important info. ·
> Privacy · Feedback

Two observations, both measured rather than preferred. The composer width sits
between the two references and nearer ChatGPT's reading column than Claude's.
The resting height does not: at 127px it is 75px taller than ChatGPT's 52px and
13px taller than Claude's, so desktop is now the taller surface of the two this
product ships, the opposite of the phone result, where the work landed. Control
density (46 against ChatGPT's 86 and Claude's 41) is unchanged in posture.

### What limits this reading

A local `next dev` build is not a production build, and dev-only overlays or
unminified layout can move a box by a pixel or two; the 35px phone change is far
outside that margin, the 26px-vs-28px radius comparisons are not.

The database behind this run is one migration behind the branch
(`0156_message_thread_variants`), so sending a message 500s. That does not touch
these numbers, every reading here is the resting new-chat screen with no turn in
flight, but it does mean no conversation-in-progress state was measured, which
was already outside the 2026-08-30 scope.

### Desktop, 1470x835, first agiworkforce reading (2026-09-01)

|                     | agiworkforce      | chatgpt.com (08-30) | claude.ai (08-30) |
| ------------------- | ----------------- | ------------------- | ----------------- |
| Composer box        | w=736, **h=127**  | w=768, h=52         | w=640, h=114      |
| Composer radius     | 26px              | 28px                | 14px              |
| Composer fill       | `rgb(33, 33, 33)` | `rgb(33, 33, 33)`   | `rgb(32, 32, 31)` |
| Footer row          | h=24              | ,                   | ,                 |
| Visible buttons     | 46                | 86                  | 41                |
| Horizontal overflow | none              | none                | none              |

The 2026-08-30 desktop table carried no agiworkforce column, so this is the
baseline. The phone result inverted: at 390px this product now sits under both
competitors, while on desktop the resting composer is **127px against
ChatGPT's 52px**, their single collapsed pill against our permanently visible
second control row. Whether desktop should collapse to one resting row is a
design decision, not a defect; it is queued as one.

## Streaming markdown parse cost, before and after the block splitter (2026-09-01)

The streaming renderer used to hand the whole accumulated message to remark on
every flush, so a long answer paid for its own length on every token. The block
splitter in `packages/ui/unified-chat/src/components/markdown/splitMarkdownBlocks.ts`
freezes every settled top-level block and reparses only the live tail. This is
the measurement of that change, not an estimate of it.

Both columns come from the same harness, the same document and the same flush
boundaries, so they differ only in what is parsed. **After** is
`createMarkdownBlockSplitter().update(content)`. **Before** is the identical
parse-only remark processor run over the full accumulated string at the same
flush, the pre-change behaviour, reconstructed rather than recalled.

| accumulated chars | before: full reparse | after: tail split | tail parsed | samples |
| ----------------- | -------------------- | ----------------- | ----------- | ------- |
| 1,000             | 1.055ms              | **0.075ms**       | 48 chars    | 320     |
| 10,000            | 8.259ms              | **0.078ms**       | 39 chars    | 320     |
| 50,000            | 46.605ms             | **0.175ms**       | 225 chars   | 320     |
| 100,000           | 97.637ms             | **0.149ms**       | 94 chars    | 320     |

Median per-flush wall time, 5 measured iterations after a discarded warm-up,
320 split samples and 25 reparse samples per size.

**The exit criterion holds.** From 10k to 100k chars, a tenfold longer message.
the full reparse grows **x11.82** and the tail split grows **x1.90**. The reparse
slope is linear in message length, as an O(message) cost must be. The split's
x1.90 is not a size effect at all: the tail it parsed grew from 39 to 94 chars
over the same range, so cost tracked the tail by roughly the ratio the tail
itself moved. Normalised, the split costs 2.01ms per tail kilochar at 10k and
1.58ms at 100k, flat to slightly falling. At 100k the split is **656x cheaper
per flush** than the reparse it replaced.

### What this measurement excludes, and why

Three limits worth stating before anyone treats a row as a budget:

- **The streaming buffer's own cost is outside the timed region.** The harness
  slices the finished document at each flush boundary instead of growing a
  string with `+=`, because concatenating 100KB per flush costs more than either
  parse and is unchanged by the splitter. Timing it would have hidden the thing
  being compared. An earlier run that left it in reported the split growing
  x4.60 rather than x1.90, all of it buffer flattening.
- **Only documents the splitter can settle are measured.** The harness derives
  that set at run time rather than hardcoding it: 23 of the 28 corpus documents
  qualify. The five excluded ones, an unterminated fence, trailing open display
  math, an unbalanced raw HTML container, and two carrying reference or footnote
  definitions, are cases where the splitter deliberately refuses to settle and
  `StreamingMarkdownContent` falls back to rendering the message as one unit.
  Those keep the old O(message) cost by design, and this table does not describe
  them.
- **Absolute milliseconds are machine and load bound.** These were taken at load
  average ~2. The same harness on the same commit at load average 35 reported
  3252ms for the 100k reparse against 97.6ms here, a 33x inflation. The ratios
  held: x10.17 against x2.07. Compare slopes across runs, never absolutes.

### Reproducing it

```
pnpm --filter @agiworkforce/unified-chat test:bench
```

Roughly 15s on an idle machine, and it prints the table above. The harness is
`packages/ui/unified-chat/src/components/markdown/__tests__/streamingParseCost.ts`,
driven by the `streamingParseCost.bench.ts` beside it through
`packages/ui/unified-chat/vitest.bench.config.ts`, which is kept out of the
ordinary `test` run so CI time does not grow.

The regression gate does run in CI. `streamingParseCost.test.ts` executes the
same harness at a reduced 1k-to-8k profile in about 0.7s and fails if the split
slope exceeds x4, or if the full reparse slope drops below x4, the second
assertion being what stops a harness that has quietly stopped measuring anything
from reporting a flat line as a pass.
