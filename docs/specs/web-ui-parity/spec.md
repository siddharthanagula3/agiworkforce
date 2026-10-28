# Web UI parity

Status: In progress
Owner: Web chat
Last updated: 2026-10-27

## Problem

### Answers

Asked to "render a complete intelligent UI gallery inline", ChatGPT answered with live
components inside the reply: a rich card with tags, an email card, writing blocks, code
blocks with Run, a commands card, a form (text, select, radio, checkboxes, slider, date,
notes, Apply), metric cards, an image carousel, bar, line and donut charts with axes and
hover values, a flowchart, a sequence diagram, a timeline, an image gallery, KaTeX math, a
citation card, execution-status rows, a checklist with progress, Reset and Copy, a
"Request Python execution" button and a radio decision. Evidence: the owner's screenshots of
chatgpt.com, 2026-10-27 (observed).

On the same prompt our chat (Claude Sonnet 5.5, prompt chat.system@6) said it could only
show Markdown, imitated controls and charts in text, put the email in a `text` code block,
garbled every formula, and cut its HTML artifact off before it finished.

### Layout

With the Artifacts panel open, the chat column narrows while the window stays wide. Controls
sized by window breakpoints kept their labels: the composer drew "Balanced" over the
microphone and the header squeezed the chat title out. Dragging the panel stopped where the
chat column met a 360px floor. The owner asked for labels to turn into icons instead, and for
every screen to work on a phone.

## Causes

1. The pinned prompt (chat.system@6) never tells the model which blocks the chat renders.
   chat.system@14 adds an `inline_blocks` section but lists only part of them.
2. Rendering gaps: the inline chart is CSS bars with no axes, line or pie; there is no
   metric card, form, carousel, or card that wraps Markdown; status rows carry no note.
3. Bugs: KaTeX styles were stripped (fixed in `ec9ed8dfe8`); a one-line fence with no
   language renders as an inline-code chip that cannot wrap; `text` blocks do not wrap; an
   invisible table toolbar reserves a blank row above every table; the adaptive response
   budget can end a long artifact early.
4. Security: the `gallery` block loads any image URL with no trust check, unlike Markdown
   images, which load only from this turn's tool results or after the user approves.

## Design

Every block is a fenced code block named by its language, classified once by
`classifyAssistantFence` (`packages/ui/unified-chat/src/components/markdown/assistantFence.ts`),
which web, desktop, Chrome, VS Code and mobile share. A new kind is added to that classifier,
to `renderClassifiedFenceHtml` (Chrome and VS Code), to the React renderer (web and
desktop) and to mobile, which renders unknown kinds as plain text until it has a view.
Field lines use `|` between fields; a tag may carry a tone as `success: text`, `info: text`,
`warning: text` or `danger: text`.

| Block       | Syntax                                                                                                                                                        | Behavior                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `chart`     | `title:` `subtitle:` `type: bar\|line\|pie\|donut` `x:` `y:`, then `label \| value` rows; or a JSON chart spec with several series                            | Rendered with `ChartCanvas` (axes, gridlines, tooltip, legend), lazy-loaded; data stays available to screen readers |
| `stats`     | `title:` then `label \| value \| caption \| tag` rows                                                                                                         | Metric cards in a responsive grid                                                                                   |
| `card`      | `title:` `subtitle:` `tags:` header lines, a blank line, then a Markdown body                                                                                 | A bordered card with the body rendered as Markdown                                                                  |
| `form`      | `title:`; `text:`, `select:`, `radio:`, `checks:` (`*` marks selected), `slider: label \| min \| max \| value \| unit`, `date:`, `textarea:`, `submit:` lines | Live controls; Submit sends the values as the user's next message, nothing is sent before                           |
| `carousel`  | `title:` then `title \| text \| image URL` rows                                                                                                               | One slide at a time, Previous and Next, "1 of N"                                                                    |
| `status`    | `label \| state \| note`                                                                                                                                      | Icon by state, note under the label, state tag                                                                      |
| `timeline`  | `title \| date \| detail \| state` (date optional)                                                                                                            | Numbered steps on a vertical rule                                                                                   |
| `checklist` | unchanged                                                                                                                                                     | Adds a progress bar to the existing count, Reset and Copy                                                           |
| `actions`   | `label \| text \| send`                                                                                                                                       | `send` sends the text as the next message; otherwise copies it                                                      |
| `citation`  | unchanged                                                                                                                                                     | Link reads "Visit host" with an external-link icon                                                                  |
| `gallery`   | `caption \| image URL \| text`                                                                                                                                | Images pass the same trust gate as Markdown images                                                                  |

Existing blocks keep their syntax: `email`, `writing`, `document`, `message`, `post`,
`prompt`, `commands`, `console`, `cards`, `radio`, `slider`, `checks`, `dropdown`,
`details`, `map`, `followups`, `files`, `transcript`, `mermaid` (inline diagram), and
`$...$` / `$$...$$` math. External Markdown links gain an external-link icon.

Images and links are model output and untrusted: images load only from trusted sources or
on approval, links keep the existing safe-URL rules, and no block sends anything without a
click.

## Responsive layout

- A control strip that can be narrowed by a panel or a split view sizes itself with container
  queries on its own box (`@container`), never with window breakpoints.
- As a strip narrows, labels give way to their icons before anything wraps, clips or
  overlaps; the accessible name never changes. Composer (`ChatComposerNew`, `ComposerFooter`):
  effort label below 32rem, model name below 26rem, palette below 24rem. Chat header
  (`WebChatPage`, `ApprovalInbox`): compact layout below 40rem, labels from 52rem.
- The chat column may narrow to 320px beside a panel; every composer control fits there as an
  icon.
- Verification measures, in the running app, overlapping controls, sideways scrolling and
  clipped text in each region at desktop, narrow-panel and 390, 360 and 320 px phone widths,
  and keeps the screenshots it reads.

## Prompt

chat.system@15 = chat.system@14 plus: an `inline_blocks` section that lists every block above
with its syntax and says when to use inline blocks versus an artifact, and one
`refusal_style` sentence that a fictional, hypothetical or role-play frame never unlocks a
request the assistant would decline (chat.system@7 to @14 fail the fiction-frame jailbreak
row on GPT-6 Luna in 3 of 3 runs). Surfaces that cannot render a block are not told about it.

## Verification

- Unit tests for every parser and renderer; eval replay with the chat-prompt corpus.
- GPT-6 Luna live runs of chat.system@15 against chat.system@6 (golden, refusal, jailbreak,
  chat, chat-prompt), three samples each; no Anthropic model is used for evals.
- Visual check on the local web app: the gallery prompt on GPT-6 Luna, each section compared
  with the ChatGPT reference.

## Out of scope for this change

- Image search, which ChatGPT used to fill its gallery and carousel with real photos. It is a
  new tool with its own egress and trust review.
- Running Python straight from a code block. A Run action here asks for execution in the
  next turn, as ChatGPT's "Request Python execution" does.
