---
name: artifact-design
description: Design rules for a polished, self-contained interactive app, tool, game, page, website, calculator, dashboard, widget, timer, quiz, chart or visual built as an HTML or React artifact. Load it when asked to make, build, create or design one.
version: 1.0.0
---

# Artifact design

Use this skill before writing an app, tool, game, page or visual the user will open and use in the chat preview. The preview renders it live, inline in the message and in the Artifacts panel.

## Format

- Write exactly one fenced block: `html` for a page or app, `jsx` for a React component, `svg` for a static graphic, `mermaid` for a diagram.
- Put the artifact marker alone on the first line of the block, in that language's comment form: `<!-- @artifact -->` for HTML and SVG, `// @artifact` for JSX, `%% @artifact` for Mermaid. Without it the block is shown as code, not run.
- Name it: a `<title>` in HTML, or `// @title: Desk Calculator` on the second line of JSX. The name labels the artifact card.
- Keep everything in that one block. Inline every style and script. Load nothing from the network: no `fetch`, no external fonts, images, stylesheets or script CDNs. Use the system font stack, inline SVG icons and `data:` URIs.
- React: `React` and `ReactDOM` are already globals. Write no `import` or `export` lines, define a component named `App`, and use hooks as `React.useState`.

## Layout and type

- Design for a frame about 720px wide that can shrink to 320px. Use a centred container with a sensible `max-width`, fluid widths, and no horizontal scrolling at any width.
- Let the height follow the content. Do not size the outer layout with `height: 100vh` or `min-height: 100vh`; the inline preview fits its height to what you draw.
- Space on a 4px grid (4, 8, 12, 16, 24, 32, 48). Use one type scale (13, 15, 17, 20, 24, 32px), 1.5 line height for body text, and at most two weights.
- One accent colour for the primary action and the current state; neutrals for everything else. Prefer borders and subtle surface steps to heavy shadows.

## Theme, contrast and states

- Define colours as custom properties on `:root`, set `color-scheme: light dark`, and override them under `@media (prefers-color-scheme: dark)`. Give `body` an explicit background and text colour.
- Text needs 4.5:1 contrast against its background, large text and control boundaries 3:1. Never signal state by colour alone.
- Every control is a real `<button>`, `<input>`, `<select>` or `<label>`, with hover, active, disabled and a visible `:focus-visible` ring. Targets are at least 32px, and 44px under `@media (pointer: coarse)`.
- Handle the empty, error and edge cases in the interface itself (a division by zero, an empty list, an invalid entry) with a short message. Never use `alert`, `confirm` or `prompt`.
- Keep motion short and subtle, and turn it off under `@media (prefers-reduced-motion: reduce)`.

## Keyboard

- Everything works from the keyboard in a logical tab order.
- Bind the keys a user expects for the kind of app: digits, operators, Enter, Backspace and Escape for a calculator; arrows and Space for a game; Enter to add and Delete to remove in a list. Show the bindings in one quiet hint line.

## Data

- `localStorage` can be unavailable in a preview, so wrap every read and write in `try`/`catch` and keep working without it.

## The reply around the block

- One short sentence before the block saying what you built. After it, at most three short lines on how to use it, such as its keyboard shortcuts. Do not narrate the code.
