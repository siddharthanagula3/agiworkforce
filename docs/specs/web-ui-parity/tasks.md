# Web UI parity: tasks

Status: In progress
Owner: Web chat
Last updated: 2026-10-27

The order to work in, from the owner's reports of 2026-10-27. Each task lands with tests and,
for anything visible, a check in the local web app at desktop, narrow-panel and phone widths
(390, 360 and 320 px). Evals run on GPT-6 Luna only: the owner does not want Anthropic models
used for tests. See `spec.md` for the design and `contracts/rendering-elements.md` for every
element.

## 1. Broken now

- [x] 1.1 Composer controls overlapped when the chat column was narrow ("Balanced" drawn over
      the microphone): the footer could shrink while the effort control could not. Labels now
      collapse into their icons by composer width (effort below 32rem, model name below
      26rem, palette below 24rem).
- [x] 1.2 The chat header kept its desktop layout, with labels, whenever the window was wide,
      so with the Artifacts panel open the title was squeezed out. The header switches layout
      by its own width (compact below 40rem, labels from 52rem).
- [x] 1.3 Dragging the Artifacts panel stopped where the chat column hit 360px. The chat may
      now narrow to 320px, where every composer control still fits as an icon.

## 2. Tool misuse and rendering choice

- [ ] 2.1 The server forces a web search when "latest", "today", a current year and similar
      words appear anywhere in a message, including pasted material and requests to rewrite,
      echo or translate it. Read only the user's request, and never force search for a
      transformation request; explicit search and source requests still force it.
- [ ] 2.2 Document every rendering element: what ChatGPT shows, what we render, the exact
      syntax, behavior and surfaces (`contracts/rendering-elements.md`), and record the
      observed ChatGPT elements in `docs/research/competitor-surfaces-2026-10-24.md`.
- [ ] 2.3 Renderers to match ChatGPT, on web and desktop, Chrome and VS Code, and mobile:
      text-syntax charts drawn like JSON charts (axes, grid, tooltip; bar, line, pie, donut);
      `stats`; `card` (Markdown body, tags); `form`; `carousel`; titled command list with a
      Copy per row; status notes and icons; timeline dates; checklist progress bar; actions
      that send; citation "Visit host" link; tags.
- [ ] 2.4 chat.system@15: chat.system@14 plus the full element catalog and when to use inline
      versus an artifact, and a refusal rule for fiction and role-play frames. Eval against
      chat.system@6 on GPT-6 Luna, three samples; move the pin only if refusal and jailbreak
      hold.

## 3. Every screen on a phone

- [ ] 3.1 Inventory every web route.
- [ ] 3.2 Automated sweep, signed in, at 390, 360 and 320 px and at 768 and 1024 px:
      horizontal overflow, overlapping controls, clipped text, screenshots of each route.
- [ ] 3.3 Fix each finding, collapsing labels into icons rather than wrapping or clipping, and
      re-run the sweep until clean.

## 4. Registered defects from the screenshots

- [ ] 4.1 A user's own message renders Markdown headings; show it as written, like ChatGPT.
- [ ] 4.2 A turn waiting on approvals looks finished.
- [ ] 4.3 "Stopping…" and "Preparing" show at once.
- [ ] 4.4 An answer that generated an image is credited to the image model.
- [ ] 4.5 Long replies and artifacts end early; find where the output budget cuts them.
- [ ] 4.6 Sources chip under answers with no text; "?" and "F" step icons; request JSON cut
      off in error details; follow-up styling; no rating on image-only or failed answers;
      unlabeled header badges; Recents Today empty; Enterprise usage 0%; Projects twice.

## 5. Needs the owner

- [ ] 5.1 Table style: ChatGPT draws row rules only, no grid or header fill, numbers
      right-aligned; ours has a grid and the grey header the owner liked for code blocks.
- [ ] 5.2 Claude answer lost after a denied tool (provider rejected the request). Needs a Claude
      chat; the Anthropic key is held by its spend limit until 2026-11-01.
