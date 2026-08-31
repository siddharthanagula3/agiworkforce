# Chat UI parity: chatgpt.com and claude.ai, measured

Status: Current
Owner: Repository maintainers
Last updated: 2026-08-30

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
custom typeface doing the brand work. Its dark is not black — `rgb(21,21,21)`
against a `rgb(32,32,31)` composer is a warm near-neutral, and the composer is
distinguished by a 11-unit lightness step rather than by a shadow or a glow.
Half the control count of ChatGPT on the same screen.

Neither uses a gradient, a glow, a glass blur, or a coloured accent on the
primary surface. Both hold their identity with type, spacing and one neutral
step. That is the same position `AGENTS.md` already commits this product to, so
parity here is not imitation — it is the same conclusion reached independently.

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
the mobile design decision, and it is not a re-layout — it is a different set of
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
- 358px composer at 390px with 16px side margins — identical to ChatGPT's.
- 26px composer radius — within 2px of ChatGPT's 28/26.
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
