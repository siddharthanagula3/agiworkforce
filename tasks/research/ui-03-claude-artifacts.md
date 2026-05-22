# Research: Claude.ai Inline Tool-Call & Artifact UX

**Source corpus:** `~/Desktop/reference/ui/claude/claude-chat-artifacts-and-tools/` (27 PNGs, captured ~2026-03-28).
**Author:** Research team 3 of 18.
**Feeds polish item:** Inline tool-call UX — diffs in chat, terminal output in chat, browser screenshots in chat. No side panels for execution.

---

## 0. Visual context (so claims are calibratable)

Every chat screenshot uses a near-black canvas (~`#1A1A1A`) with a white-cream message text (`~#E8E5DE`, slightly warm — Claude calls this "Anthropic Cream"). User messages live in a dark grey rounded-rect bubble (~`#2A2A2A`) on the right; assistant responses are bare text on canvas, no bubble. The composer at the bottom is a slightly lighter grey rounded-rect (~`#252525`) with cream text and the model selector (e.g. "Sonnet 4.6 Extended" or "Opus 4.6 Extended") right-aligned with a microphone icon at the far right. A 24-px-wide left rail holds icons (search, history, projects, code-bracket, etc.) on a slightly darker stripe. The thumbnail user avatar (`SN`) sits bottom-left.

This is the canvas every tool-call rendering is layered onto. Anthropic uses **content density and typographic hierarchy** to disambiguate tool calls from prose, not boxed cards or color-coded panels. That is the central design choice we should match.

---

## 1. Tool Result Rendering Inline

### 1.1 The "Used X" group header (pattern)

Reference: `02_inline-tool-use_filesystem-results-summary.png`, `08_stacked-tool-status-messages_compact.png`, `10_inline-tool-steps_file-operations-html.png`.

Every tool-call sequence is wrapped in a single line at the top such as:

- `Used Filesystem integration, loaded tools v` (image 02)
- `Ran 5 commands, created a file, read a file v` (image 07)
- `Viewed a file, created a file, read a file v` (image 10)
- `Used Filesystem integration, loaded tools v` (image 02)

The `v` chevron is a subtle, low-contrast (~`#7A7A7A`) caret indicating "expand details". Microcopy is **past tense, plain English, comma-separated**. There is **no explicit "Tool" prefix word** — the verb carries the meaning. Crucially: when collapsed, this is the _only_ visible line; sub-steps are hidden, freeing the eye to read assistant prose around the tool call. When expanded (default state in most screenshots), each sub-step is rendered as its own row.

**Polish-item rule for us:** the chat needs a single grouped tool header per assistant turn that summarizes "Ran N commands / Edited M files" with a chevron toggle, not 14 individual cards stacked.

### 1.2 Filesystem **read** result — collapsed default

Image `02` shows the canonical pattern:

```
Used Filesystem integration, loaded tools v
[magnifier icon] Loading tools
                 [Result]            <- pill button, dark grey

[F file icon] List Allowed Directories
              [Result]               <- pill

[F file icon] List Directory
              [Result]
[F file icon] List Directory
              [Result]
[F file icon] List Directory
              [Result]
[checkmark]   Done
```

- **State:** collapsed by default (you see the action verb + a `Result` pill button, but not the result content).
- **Chrome:** small file icon (`F` glyph for "file"), action label (e.g. "List Directory"), then a small **rounded-rect "Result" pill** below. The pill has no fill, just a thin border (~`#3A3A3A`) on the canvas.
- **Truncation:** results are not even shown — pill is the gate. To see content, click pill → expanded view (image `03`).
- **Filename / icon:** when the tool deals with a specific file, the file name appears as a smaller pill _under_ the action label (image `10` shows `Siddhartha_Nagula_Anthropic_GrowthEngineer.html` as a sub-pill with `HTML` icon).

### 1.3 Filesystem **read** result — expanded

Image `03` and `04` show the expanded state. The `Result` pill is replaced by a **two-section panel** with cream text on the same dark canvas, separated by a faint divider:

```
Request
    {
      "query": "filesystem list directory"
    }

Response
    Loaded 5 filesystem tools:
       filesystem:list_allowed_directories
       filesystem:list_directory:
         path: string
       filesystem:list_directory_with_sizes:
         ...
```

- **Typography:** monospace, slightly muted color (~`#B5B0A4` — slightly dimmer than prose).
- **Two labels:** `Request` and `Response` headers in slightly bolder cream text, sentence case, no colon.
- **Indentation:** standard 2-space indent for JSON; YAML-like indent for response keys.
- **Truncation:** image `04` shows the response visibly cut off mid-content with no "Show more" or "..." — instead, the natural scroll of the chat handles overflow. Long responses appear to be **truncated by max-height, not ellipsis**.

### 1.4 Filesystem **write/edit** (diff) — NOT FOUND in this corpus

None of the 27 screenshots show a red/green inline diff for a filesystem write. This is a real corpus gap. What I do see:

- Image `10`: `created a file` is displayed as a single-row line `[HTML icon] Siddhartha's tailored resume for Anthropic Growth Engineer role / [filename pill]` with no diff.
- Image `07`: `Build the DOCX resume` and `Validate the DOCX file` rows show only `Script` pill subtags (the script that ran), no diff.
- Images `22`, `23`, `27`: PDF generation flow shows `Install reportlab`, `Generate PDF 1`, `Fix charspace method`, `Fix syntax errors`, `Fix linedash` — i.e. iterative _script_ fixes, not file diffs.

**Conclusion:** Claude.ai's chat UX as captured here treats writes/edits as **opaque "I wrote a file" events**, not as inline diffs. Diffs apparently surface only when you open the artifact in the sidebar (and even there I see no red/green hunk view in this corpus). No "Apply / Reject" buttons appear anywhere — the file was _already_ written by the time you see the row.

**Polish-item implication:** This is a place where AGI Workforce should _exceed_ Claude.ai. If we ship inline red/green hunks with Apply/Reject in chat, we beat them on a feature they don't render at all.

### 1.5 Bash / shell / "Script" tool

References: `07`, `22`, `23`, `27`.

Each command shows up as one row:

```
[document/script icon] Build the DOCX resume
                        [Script]          <- small pill, label "Script"
```

- The `Script` pill is a **single shared label** for any code-execution tool (Python, bash, JS). It is **not language-specific** — the underlying script is hidden behind the pill click.
- **No terminal styling.** Output is _not_ shown as a green-on-black scrollback. It's hidden behind the pill or summarized as a one-line action label.
- **No streaming animation** is captured here, but image `02` shows a `Loading tools` row with a magnifier icon in what is clearly a transient state. Suggests the same pattern would apply to scripts: row appears in a "running" state with a spinner glyph, then resolves to `Script` pill.
- **Expand/collapse:** behaves like other tool rows — expand reveals Request/Response.

This is a notable design choice and one we should think hard about. Claude _de-emphasizes_ terminal scrollback in favor of the natural-language action verb. ChatGPT and Codex go the other direction (full code-block scrollback). For the unified Chat/Cowork/Code surface, we likely want _both_ — collapsed Claude-style for short commands, expanded terminal-style for long-running ones with stdout/stderr.

### 1.6 Web search / fetch result

Reference: `06_inline-web-search-results_with-favicons.png`.

This is the richest single tool-rendering screenshot. The pattern:

```
[magnifier icon] best software engineer resume design 2025 ATS friendly professional
                                                                           10 results

  [favicon] Professional ATS Resume Templates for Experienced Hires...   resumeworded.com
  [favicon] Optimizing Resume Design for Software Engineers in 2025 - Resumly resumly.ai
  [favicon] Software Engineer Resume Template & Examples [2026] - ATS-Optimized... mentorcruise.com
  [favicon] Best Resume Format for Software Engineers: Examples, Tips & Complete Guide  www.lockedinai.com
  [partial favicon] [partial title]
```

- **Search query** is shown as plaintext at the top with a magnifier icon prefix. Right-aligned: `10 results` count.
- Each result is a **single-row card** within a **single faint-bordered dark container** (~`#1F1F1F` rounded-rect, lighter than canvas).
- Per row: 16-px favicon (left), title in cream-white truncated with ellipsis (middle), domain in muted grey (right, also truncated). Single-line height.
- **Click affordance:** entire row is the click target (the row hover state isn't visible in the static PNG, but the card layout is unambiguously row-level).
- **No expansion** for individual results — what you see is what you get. To dig deeper, Claude has presumably already absorbed snippets internally; the bullet list below ("Now I have a solid understanding...") is its own paraphrase.
- The **bulleted summary below** is rendered as a numbered list — `1. Single-column layout - Clean, no tables/complex formatting...` — with a `Show more` toggle at the bottom in muted grey.

**Citation pills:** I do _not_ see explicit footnote-number citation pills (like `[1]` `[2]`) tied back to the result list in this screenshot. The summary stands alone as Claude's synthesis.

### 1.7 Image attachments (user-supplied) — NOT FOUND

No screenshots show a user uploading an image. The user message bubble in image `14` shows a `PASTED` tag with text content, not a thumbnail. Open question — see §6.

### 1.8 Image generation (assistant-produced)

Reference: `05_chat-response_thumbnail-artifact-preview.png`.

A single thumbnail is shown floating at the upper-right of the assistant turn, BEFORE the actual response text. It looks like a **white postcard-style preview** with tiny faint grid lines and a dark text "Value this response highly..." caption barely legible.

Layout:

- Thumbnail size: roughly **64×80 px**, rounded-rect with faint border, white background.
- Position: top-right of the chat column, outside any containing card. It floats freely as the artifact preview.
- **No save / download icons visible on the thumbnail itself.** The thumbnail is a _reference card_ you click to open the full artifact in sidebar.

**This is critical:** Claude does _not_ render an inline preview of the artifact contents in chat. Instead, an "artifact card" is displayed as a labelled chip lower in the response (see §3 for the chip pattern; image `12` lower-left shows `Ideal resume anthropic growth / Code · HTML / [Open in Comet]`). The thumbnail in image `05` is a **lighter-weight inline summary**.

### 1.9 JSON / structured output

References: `03`, `04`.

JSON shown in expanded tool-result panels uses:

- Monospace font (likely SF Mono or similar).
- Slightly muted cream (~`#C8C0AE`).
- **No syntax highlighting** — keys, values, strings all the same color. Quotes and braces present but not colorized.
- **No collapse arrows** for nested objects (the JSON shown is shallow).
- **No copy button** visible in the expanded panel for the JSON itself.

This is a deliberately _minimal_ presentation. Claude trades scannability (syntax highlighting) for visual calm. We should consider: do we match this, or add lightweight monochrome syntax weighting (bold keys, italic strings)?

### 1.10 Long output

References: `02`, `15`, `25`, plus `04` (truncated JSON).

Long content is handled three ways:

1. **`Show more` link** at the bottom of bulleted lists (images `09`, `11`, `15`, `22`, `25`). Muted grey, plain text, left-aligned.
2. **Floating "scroll to bottom" button** (image `04`) — a small downward chevron in a circular button, centered horizontally near the bottom-third of the chat region.
3. **Natural max-height truncation with browser scroll** for tool-result panels.

There is **no "Show more results" pagination** for web-search results — it's a hard 10-result cap as shown.

---

## 2. Reasoning & Extended Thinking

### 2.1 The "thinking block" anatomy

References: `11`, `15`, `22`, `25`, `26`, `27`.

Reasoning is rendered as a **tightly grouped multi-row block**, not a separate sidebar. Each block has this structure:

```
[group header in muted grey]                   v      <- chevron right of label

[clock icon] Body of the reasoning, written in
             past tense. Sometimes includes lists,
             bolded names, or sub-bullets.

  Bullet point 1 with technical detail
  Bullet point 2 with citation
  Show more         <- link, muted grey
```

The **icon** on the left of every reasoning block is a **clock face icon** (~16 px, outlined, no fill) on its own short vertical column. The clock signifies "this is thinking time, not a tool call". Tool-call rows use a different glyph family (file, magnifier, document).

The **group header** text is short and reflective: examples from the screenshots —

- `Identified resume gaps and formulated targeted clarification questions` (image `11`)
- `Architected ideal candidate profile with growth metrics and technical stack` (image `14`)
- `Devised three visually distinct PDF designs with varied aesthetics` (image `22`)
- `Architected four distinct travel itineraries with varying paces and destinations` (image `25`)
- `Refined markdown formatting and ensured content completeness` (image `26`)

The header tone is **declarative-and-completed**, almost report-like. Always past tense. Usually noun-phrase rather than full sentence.

### 2.2 Default state

**Expanded by default**, contrary to the question's implicit assumption. The screenshots show reasoning as the dominant visual content — body text is fully visible, with `Show more` toggles only on the _long_ parts. Image `11` shows two thinking blocks back-to-back (`Prepared to solicit user clarification...` and `Reading the uploaded resume PDF...`), both fully visible.

There is **no "Show thinking" toggle** that hides the entire block. The chevron on the group header expands/collapses the _full block including the body_. Default = open. This is a strong stance: Claude _wants_ you to see its thinking.

### 2.3 Multiple reasoning steps

References: `15`, `22`, `25`, `26`.

Multiple reasoning blocks in one assistant turn are visually separated by:

- ~24 px of vertical whitespace.
- Each block has its own clock icon and short header.
- They are _not_ linked by an explicit timeline or "Step 1 / Step 2" labels.

Image `15` shows the clearest case: two thinking blocks with a `Reading frontend design skill` tool call sandwiched between them. This means **reasoning and tool calls interleave naturally** in the same flow — there's no enforced "thinking → tools → thinking" sequence. The flow follows the actual order events happened.

### 2.4 Reasoning vs tool-use vs final-answer distinction

The three states are visually distinguished by **icon family + indent + header text**:

| Element | Reasoning                                          | Tool call                                      | Final answer               |
| ------- | -------------------------------------------------- | ---------------------------------------------- | -------------------------- |
| Icon    | Clock (round, outlined, ~16 px)                    | File / magnifier / document glyph              | None — just plain text     |
| Header  | Italic-ish phrasing, declarative ("Architected X") | Past-tense verb summary ("Used Filesystem...") | None                       |
| Indent  | Body indented under icon                           | Sub-rows further indented                      | Flush left (canvas margin) |
| Color   | Slightly muted body                                | Action label cream + small pill subtag         | Full-cream prose           |
| Default | Expanded                                           | Collapsed (just header + Result pill)          | Always shown               |

The **final answer is always rendered as flush-left full-cream prose with full markdown** (bold, italic, code spans, bullet lists, h1/h2). Reasoning content uses the _same_ type styles but appears slightly muted in color and indented. This is subtle but consistent across the corpus.

---

## 3. Artifact Sidebar

### 3.1 When does the artifact panel open?

References: `12`, `13`, `16`, `18`, `19`, `20`, `21`, `24`.

Sidebar is **manually opened** by clicking the artifact card in chat. The card appears in the chat stream at the point in the response where the artifact was created. Card layout:

```
[file-icon] Ideal resume anthropic growth                  [Open in Comet]
            Code · HTML
```

- Card is a short, rounded-rect chip with a faint border, ~440 px wide.
- Left: small grey file-type icon.
- Middle: artifact title (cream) + small-caps subtype label `Code · HTML` (muted).
- Right: a button labelled `Open in Comet` (the "Comet" naming is Anthropic's internal preview pane name in this build — it's a render label not a brand they ship publicly). Image `21` shows `Open in Preview` for PDFs, image `20` shows `Open in TextEdit` for DOCX. So the right-hand button text is **type-aware**.

The sidebar panel does **not auto-open** based on the screenshots — image `17` shows multiple artifact cards (`Optiona grandtour`, `Optionb relaxedclassic`, `Optiond essentialamerica`) sitting in the chat with `[Open in Antigravity]` buttons next to each, _before_ any sidebar is opened. The chat is the primary surface; the sidebar is opt-in.

### 3.2 Sidebar layout (when open)

References: `12`, `13`, `16`, `18`, `19`, `20`, `21`, `24`.

Two-column split: chat (~40% width, left) and artifact viewer (~60% width, right). The chat area becomes narrower but remains fully interactive (composer at bottom is still visible). The artifact panel has its own toolbar.

**Toolbar layout (right side, ~48 px tall, dark grey bar):**

- Left: `[eye icon] [Title] [Subtype label like "HTML" or "MD" or "PDF"]`
- Right: `[Copy] [code-bracket toggle for source view] [download icon] [X close]`

Image `13` shows the toolbar zoomed; the order from right to left is: **X (close), download/share, code-toggle, Copy**. The `Copy` button is leftmost of the right cluster.

### 3.3 Multiple artifacts

References: `17`, `18`, `19`, `20`, `21`.

Chat shows artifact cards stacked vertically with a `Download all` link below them (image `17` is the canonical example):

```
[file-icon] Optiona grandtour                              [Open in Antigravity]
            Document · MD

[file-icon] Optionb relaxedclassic                         [Open in Antigravity]
            Document · MD

[file-icon] Optiond essentialamerica                       [Open in Antigravity]
            Document · MD

  [download arrow] Download all
```

- `Download all` is a plain-text link (no button styling) with a small download arrow icon, left-aligned, ~24 px gap below the last card.

**No tab bar across the sidebar top.** The sidebar shows one artifact at a time. To switch to a different artifact, you click its card in chat.

In image `24` we _do_ see a tabbed pattern, but the tabs are **inside** an artifact (a single HTML preview that has nav tabs for "The Grand Tour / West Coast Focus / Relaxed Classic / Essential America"), not Claude's chrome. So Claude's sidebar pattern is **one artifact at a time, no native tab switcher**.

### 3.4 Artifact types observed

| Type                          | Subtype label     | Sidebar render                       | Open-in button        |
| ----------------------------- | ----------------- | ------------------------------------ | --------------------- |
| HTML resume (image `12`)      | `Code · HTML`     | Live HTML preview, scrollable        | `Open in Comet`       |
| HTML source (image `16`)      | `Code · HTML`     | Source code with line numbers        | (toggle from preview) |
| Markdown preview (image `18`) | `Document · MD`   | Rendered markdown with H1/H2, tables | `Open in Antigravity` |
| Markdown source (image `19`)  | `Document · MD`   | Source with line numbers             | (toggle)              |
| Rich-text DOCX (image `20`)   | `Document · DOCX` | Rendered preview                     | `Open in TextEdit`    |
| PDF (image `21`)              | `Document · PDF`  | Page preview, dark mode              | `Open in Preview`     |
| Tabbed HTML (image `24`)      | `Code · HTML`     | Multi-tab HTML preview               | (in viewer)           |

**No SVG, no React component, no Streamlit-style interactive widget** in this corpus. Claude does support those generally — they're simply not represented in these 27 screenshots.

### 3.5 Source vs preview toggle

Image `16` vs `12`: same artifact, two views. The preview shows the rendered HTML; the source view shows the raw HTML with **line numbers in a left gutter** (~`#666` line numbers, `#E8E5DE` text). The toggle is the **`<>` code-bracket icon** in the toolbar (third from right in image `13`).

The source view shows **monospace code with selection-friendly line numbers** but no syntax highlighting in image `16` — it appears to use a single muted-cream tone. This is consistent with Claude's typographic-restraint design language.

### 3.6 Edit-artifact-from-chat flow — NOT EXPLICITLY CAPTURED

None of the 27 screenshots show a user typing "make the headline bigger" and the artifact updating in place. We can infer from the architecture (single-artifact sidebar, persistent across turns, with a stable `Open in X` chip) that the next turn would mutate it in place — but this is inference, not observation.

### 3.7 Close button + return-to-chat affordance

**X icon** at the far right of the artifact toolbar (image `13`). When clicked, the chat reflows back to full width. Mid-PNG state isn't captured, but based on the layout symmetry, the chat is always the primary surface and the sidebar is overlaid/expanded — closing it is just hiding it.

---

## 4. Errors & Retries

### 4.1 Iterative tool fixes

Reference: `23_inline-tool-iterative-fixes_python-pdf-script.png`.

The clearest evidence of error-handling lives here. Sequence:

```
[doc icon] Install reportlab                  [Script]
[doc icon] PDF 1 - Grand Tour - Dark luxury magazine aesthetic   [pdf1_grand_tour.py]
[doc icon] Generate PDF 1                     [Script]
[doc icon] Check letter spacing method name   [Script]
[doc icon] Fix charspace method               [Script]
[doc icon] Generate PDF 1 again               [Script]
[doc icon] Fix syntax errors                  [Script]
[doc icon] Fix linedash                       [Script]
[checkmark] Done
```

What we see:

- **No red error banner.** The fixes are written as their own action labels — `Fix charspace method`, `Fix syntax errors`, `Fix linedash` — same visual styling as any other tool call.
- **No "Try again" button.** The retry is autonomous; the user does not click anything.
- **No inline correction prompt.** Claude self-corrects and just shows the next step.
- The **only signal an error happened** is the action label text itself ("Fix X").

Same pattern in image `27` where after `Done` for one PDF, the flow continues with `Now PDF 3 — completely different, clean minimal style.` and another sequence.

**This is a strong design philosophy:** errors are silent unless they're terminal. Recovery is implicit. We should match this for our agentic loop — retries are part of the narrative, not a separate "error state".

### 4.2 Tool permission prompt — NOT IN CORPUS

No "Allow Claude to run X?" inline prompt is captured. Open question — see §6.

### 4.3 Network errors / timeouts — NOT IN CORPUS

Not captured. The closest signal is the `Loading tools` row in image `02`, which shows a magnifier-icon transient state but no failure mode.

---

## 5. Animation & Micro-UX

### 5.1 Tool-use progress indicator

Image `02` shows `[magnifier icon] Loading tools` with a slightly-larger Result-pill below. This is the in-progress state. The icon does not appear to be animated in the static screenshot, but its presence (and the dim "Loading" verb form) signals the state.

We can't confirm spinner type from PNGs. Likely a subtle pulse on the icon or the Result-pill outline, given Anthropic's broader minimalism.

### 5.2 Streaming text

Not captured directly (PNGs are post-completion). However, image `04` shows the floating scroll-to-bottom chevron, which only appears during active streaming or after manual scroll-up. So streaming UX includes:

- Auto-scroll to bottom (default).
- Floating chevron when user scrolls up.
- No visible cursor caret in the captured frames (if there is one, it's a thin vertical bar — typical of LLM chat clients).

### 5.3 Citation rendering

The web-search result list (image `06`) is a _grouped card_, not a footnote system. There are no `[1]` `[2]` numbered citations attached to specific sentences in Claude's prose. Instead the search-result card is shown once, and the synthesis below stands as Claude's own writing. Hover preview / click-for-source are unverifiable from a PNG.

### 5.4 Copy code button

The corpus does **not** show a `Copy` button on inline tool-result code blocks. The expanded JSON panels (images `03`, `04`) have no copy affordance. The `Copy` button only appears in the **artifact viewer toolbar** (image `13`).

The chat-level **`Copy response`** action is on the per-message hover toolbar (image `17` shows tiny icons below the message: copy, thumbs up, thumbs down, refresh — all as small grey glyphs with no labels).

### 5.5 What distinguishes Claude's chat-surface UX

After studying all 27 screenshots, my read on Claude's signature:

1. **Typographic restraint over chrome.** No colored boxes, minimal borders, no syntax highlighting in inline tool results. Hierarchy comes from indent, icon family, and font weight — not from cards/panels.
2. **Verbs as headers.** Every tool group leads with a past-tense English summary ("Used Filesystem integration"), not a tool name like `filesystem.list_directory`. Tool-name details are demoted to sub-pills.
3. **Default to expanded reasoning, default to collapsed tool results.** This is exactly inverse to ChatGPT (which collapses thinking, expands tools). Claude wants you to read its mind first.
4. **One artifact at a time in sidebar.** No tab bar — switching is via clicking the chat card. This forces conversation-as-source-of-truth.
5. **Errors are silent recoveries.** Iterative fixes are framed as "Fix X" steps in the same visual style as any other step. No red banners.
6. **`Open in Comet` / `Open in Antigravity` / `Open in TextEdit`** type-aware right-side button. Subtle product polish — the button knows what app to launch based on artifact type.
7. **Single-line tool group header with chevron** to collapse all sub-steps. Compact mode: just verbs (image `08`).

vs **ChatGPT** (per `chatgpt-desktop/17_chat_response-thought-blocks-expanded-tool-use.png` referenced in INDEX): ChatGPT uses card-style boxes with explicit borders for tool results and thinks-blocks. More chrome, less restraint.

vs **Codex / Gemini CLI**: terminal-style monospace rendering for everything. Codex has explicit Run/Reject buttons for shell commands. We should likely take Codex's safety affordances and Claude's typographic restraint.

---

## 6. Open Questions

These are the things this corpus _does not_ answer that I'd want before locking polish-item specs.

1. **Filesystem write/edit diffs.** No red/green hunk view in the 27 screenshots. Does Claude render diffs at all in chat, or only in the artifact viewer? If we want inline diffs to be a differentiator, we need at least one screenshot of Claude's actual diff render to know what bar to clear. **Where to investigate:** trigger a code-edit conversation in claude.ai and screenshot the diff state; check `claude/claude-code/` corpus (CLI surface may render diffs differently).

2. **Tool permission prompt UI.** The "Allow Claude to use X?" prompt is critical for our Cowork-grade isolation pitch but isn't shown. Specifically: is it a modal? Inline? Three-button (Allow / Always / Deny)? **Where to investigate:** any "first use of a connector" flow — image `33` of `claude/claude-desktop/` is described as "OAuth modal (Slack)" which may be analogous.

3. **Image attachments (user-supplied).** No upload-image-to-chat screenshot. We need to see thumbnail size, click-expand, multi-image grid behavior. **Where to investigate:** prompt with multiple attached images; check `claude-desktop/` composer screenshots.

4. **Streaming text / cursor caret.** Static PNGs cannot show animation. We can't confirm whether Claude uses a typing-cursor caret (▋), shimmer, or just letter-by-letter append. **Where to investigate:** record a video.

5. **Citation pills / footnote markers.** The web-search result list is a card, not a footnote system. Do citation pills like `[1]` `[2]` exist anywhere in Claude's prose? **Where to investigate:** prompt with research mode and look for inline citations in body text.

6. **Network / timeout error UI.** Genuinely missing from corpus. **Where to investigate:** kill network mid-stream and capture; check Anthropic status banners.

7. **Multi-artifact tab bar.** No screenshot shows tabs across the artifact sidebar — only stacked cards in chat. Is there a "previously used artifacts" history/tab UI we're missing? **Where to investigate:** generate 5+ artifacts in one session.

8. **Edit-artifact-from-chat flow.** We see artifacts and we see chat, but no transitional frame of "user said `make the headline bigger` → artifact mutated in sidebar". **Where to investigate:** prompt a known artifact-edit interaction and capture the transition.

9. **Copy-confirmation feedback.** When you click `Copy` on an artifact (image `13`), does it show "Copied!" toast? Inline label change? **Where to investigate:** click the button and observe.

10. **Long terminal output (multi-line stdout).** The "Script" pill model collapses everything. What if a script outputs 200 lines of stdout? Is there a different render? Or does it just truncate? **Where to investigate:** scripts that print large output.

---

## 7. Direct mapping to AGI Workforce polish-item

Based on this corpus, the inline tool-call UX polish item should ship with these specific patterns:

1. **Tool group header pattern** — single line `[verb] [count summary] v` with chevron toggle. Past tense English, not tool names. Match the Claude signature exactly.
2. **Reasoning blocks expanded by default; tool results collapsed by default.** Clock icon for thinking, file/magnifier/doc glyph for tool calls.
3. **Result pill for collapsed tool output.** Click to expand into Request/Response sections in monospace, no syntax highlighting (or minimal monochrome bolding of keys).
4. **Web-search results as a single grouped card** with favicon + title + domain rows, `N results` count top-right, no citation pills tied to prose.
5. **Artifact card in chat with type-aware Open-in button.** `Open in Editor` for code, `Open in Preview` for PDF, etc. Card is ~440 px, rounded-rect, faint border.
6. **Single artifact in sidebar, no tab bar.** Switch by clicking chat cards. Forces conversation-as-history.
7. **Toolbar in artifact viewer:** `[eye] Title Subtype` left, `[Copy] [code-toggle] [download] [X]` right.
8. **Iterative fixes as same-style action rows ("Fix X")**, no error banners.
9. **`Show more` link** for long bullet lists in reasoning blocks.
10. **Floating scroll-to-bottom chevron** when user scrolls up during streaming.

**Where to exceed Claude:** ship inline red/green diffs with Apply/Reject for code edits (Claude apparently does not), and add explicit Allow/Always/Deny permission inline prompts for tool calls (Cowork-grade isolation pitch). Both are absent from this corpus — if we ship them, we lead.

---

## 8. Citation index by question

| Question                           | Primary screenshots                      |
| ---------------------------------- | ---------------------------------------- |
| 1. Filesystem read collapsed       | `02`, `03`, `04`                         |
| 2. Filesystem write/edit diff      | NONE — gap, see §6.1                     |
| 3. Bash / shell                    | `07`, `22`, `23`, `27`                   |
| 4. Web search                      | `06`                                     |
| 5. User image attach               | NONE — gap, see §6.3                     |
| 6. Image generation                | `05` (thumbnail proxy only)              |
| 7. JSON / structured output        | `03`, `04`                               |
| 8. Long output                     | `02`, `04`, `09`, `11`, `15`             |
| 9. Reasoning block style           | `11`, `15`, `22`, `25`, `26`             |
| 10. Multi-step reasoning           | `15`, `22`, `25`                         |
| 11. Reasoning vs tool-use vs final | `11`, `14`, `15`, `25`                   |
| 12. Artifact panel auto-open       | `12`, `17` (negative evidence)           |
| 13. Close + return-to-chat         | `13`                                     |
| 14. Multiple artifacts             | `17`, `18`, `19`, `20`, `21`             |
| 15. Artifact types                 | `12`, `16`, `18`, `19`, `20`, `21`, `24` |
| 16. Edit-artifact-from-chat        | NONE — gap, see §6.8                     |
| 17. Iterative tool fixes           | `23`                                     |
| 18. Permission prompt              | NONE — gap, see §6.2                     |
| 19. Network errors                 | NONE — gap, see §6.6                     |
| 20. Progress indicator             | `02`                                     |
| 21. Streaming cursor               | NONE — static PNGs                       |
| 22. Citations                      | `06`                                     |
| 23. Copy code button               | `13` (artifact toolbar only)             |
| 24. Differentiators                | All — synthesis in §5.5                  |

---

End of findings.
