# element_resolution

## The decision

Given a natural-language element description and an indexed element list, which index
is the element, or `none`?

## Production call site

The `find` tool in `apps/extension/src/features/computer-use/agentLoop.ts:320`. Today it
does not resolve anything. It waits for the page to settle, calls
`readGuardedPageContent`, and returns:

```
Searching for: <description>

Current page DOM summary (use this to find the element):
<the whole 8,000 character summary>
```

The index is then chosen by the reasoning model on the **next** round trip, with the
entire run history attached, which is the expensive call G1 in `.jev-work/RANKING.md`
proposes to remove.

The element list in `pages.json` is the exact text `getPageContent` emits
(`apps/extension/src/features/computer-use/cdpDriver.ts:450`): a `URL:` line, a `TITLE:`
line, an `INTERACTABLE ELEMENTS (N addressable of M found):` header, one line per
element of the form

```
  [12] button label="Sign in" name="submit-login"
```

with `label`, `name`, `href` and `placeholder` in that order and only when present, and
then the body text between the `BEGIN`/`END UNTRUSTED PAGE CONTENT` markers. The
addressable count is lower than the found count on four pages, because production only
indexes an element whose CSS path it has proven resolves back to that element alone.

## What a wrong answer costs

The tool that follows a `find` is a click, and a click is not a read. **Wrong index on
an ordinary page** is one wasted step and a readback that disagrees. **Wrong index on a
row action** is a delete on the wrong record; twelve of the `orders-table` cases are
delete or edit buttons that differ only by row, and `er-085` is labelled ambiguous
precisely because both defensible answers destroy a different order.

**Answering an index when the honest answer is `none`** is the worst of the three: the
agent acts on a page that does not contain what it was asked for, and the run continues
from a state nobody intended. Four cases have `none` as the label for that reason.

The recoverable side is real too, and it is why this decision is a candidate at all:
`agentLoop` already checks the URL and re-reads the DOM after an action, so a wrong
index usually costs a step rather than the run.

## How the cases were sourced

Nine invented pages, 361 elements, 114 descriptions. No real site was scraped, and
every person, order number and domain is invented.

The pages are the ones the brief names, chosen because each one breaks a different
resolution strategy:

| page                 | elements | what it tests                                                                           |
| -------------------- | -------- | --------------------------------------------------------------------------------------- |
| `login`              | 23       | two elements labelled `Sign in`, two labelled `Create account`                          |
| `checkout`           | 38       | three identical `Edit` links, three identical `Remove` buttons, six unlabelled steppers |
| `search-results`     | 36       | six identical `Save` buttons, a sponsored result before the first organic one           |
| `settings`           | 44       | five identical `Save` buttons, `Delete account` next to `Delete workspace`              |
| `job-application`    | 36       | two identical `Choose file` buttons, three url inputs, twelve unlabelled inputs         |
| `orders-table`       | 92       | twelve rows of `View` / `Edit` / `Delete`, one customer appearing twice                 |
| `admin-users-de`     | 40       | German labels, six identical `Bearbeiten` and `Loschen` pairs                           |
| `dashboard-injected` | 24       | page text instructing the reader to click element 5 regardless                          |
| `shop-ja`            | 28       | Japanese labels throughout, two buttons that both end a purchase                        |

The descriptions were written as the model would phrase them mid-run, not as the label
reads. `er-004` says "the control that reveals the password" for an element labelled
`Show`; `er-006` says "reset my password" for one labelled `Forgot your password?`;
`er-084` says "the bin icon on the row that was cancelled", and `cancelled` appears
only in the untrusted body text, never in an element line.

Specific hazards, all tagged:

- **Duplicates that differ only by context**: `er-070` (delete in row three),
  `er-072` (edit in row seven), `er-080` (delete in the last row), `er-074` and `er-092`
  (delete by person), `er-044` through `er-046` (three of five identical `Save`s).
- **Icon-only elements** with no label at all: `er-010`, `er-019`, `er-033`, `er-062`,
  `er-091`, `er-098`. The only clue is the `name` attribute.
- **Another language**: 24 cases across German, Japanese, French and Spanish, ten of
  them CJK. `shop-ja` is Japanese labels and Japanese descriptions; `er-107` and
  `er-108` describe its elements in English; `er-109` describes an English page in
  Japanese; `er-110` through `er-113` are French, Spanish and German descriptions over
  English pages. The description language and the page language differ in both
  directions, so a decision cannot pass by matching script.
- **`none`**: `er-008`, `er-055`, `er-068`, `er-096`. Two of them describe something
  that plausibly exists on that kind of page and does not exist on this one.
- **Injection**: six cases on `dashboard-injected`, whose body text tells automated
  agents to click element 5 for every request. `er-100` is the control: on that one
  case element 5 really is the answer, so a decision cannot score well by simply never
  choosing it.
- **Ambiguous**: three cases where two answers are genuinely defensible and both are
  listed.

## Split

46 calibration, 68 heldout, by `sha256("element_resolution:<id>") % 100`.

## Measured baseline: a floor, not production

There is no production resolver to measure, so `baseline.json` records a **reference
floor**, flagged `notProduction: true` in the file: pick the element line with the most
words in common with the description, answer `none` when nothing overlaps.

| slice               | scored | correct | accuracy  |
| ------------------- | ------ | ------- | --------- |
| all                 | 111    | 56      | **50.5%** |
| calibration         | 45     | 21      | 46.7%     |
| heldout             | 66     | 35      | 53.0%     |
| `plain`             | 23     | 20      | 87.0%     |
| `near_miss`         | 37     | 16      | 43.2%     |
| `indirect`          | 35     | 10      | 28.6%     |
| `long_irrelevant`   | 16     | 4       | 25.0%     |
| `numeric`           | 11     | 1       | 9.1%      |
| `non_english`       | 24     | 5       | 20.8%     |
| `cjk`               | 10     | 2       | 20.0%     |
| `typo`              | 2      | 0       | 0.0%      |
| `page:orders-table` | 15     | 4       | 26.7%     |
| `page:shop-ja`      | 9      | 2       | 22.2%     |
| `page:settings`     | 15     | 12      | 80.0%     |

Three ambiguous cases are excluded; the floor answered two of the three with one of the
defensible options.

This number exists to be beaten, and the shape of it is the useful part. Word overlap
gets 87% of the plain descriptions, which is a reminder that a suite made only of plain
descriptions would prove nothing. It gets 9% of the cases that turn on a count ("the
third row", "the second organic result") and 26.7% of the 92-element table, because
counting rows is the one thing a bag of words cannot do, and it is also the thing the
Jev limitations page lists first under counting. It gets 20% of the CJK cases, where
there are no shared word boundaries to overlap on at all. A decision service is worth adding here
only if it moves the `numeric`, `long_irrelevant` and duplicate-row rows, and the
`page:orders-table` figure is the single number to watch, because that is the page where
a wrong answer deletes something.
