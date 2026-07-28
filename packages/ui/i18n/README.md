# @agiworkforce/i18n

Status: Current
Owner role: Frontend platform
Last updated: 2026-07-27
Kind: ts-package
Criticality: medium

## Purpose

The single translation corpus for every surface, plus the language list and the
shared `i18next` init options.

## Why this exists

Web and Desktop each carried their own copy of the translations. Desktop's had
12 locales, web's had 3, so the same product offered a different set of
languages depending on which app you opened, and a string corrected in one
stayed wrong in the other. Mobile shipped none at all.

This package is the merge of both. Where the two disagreed, web's value won —
web is the canonical UI reference.

## What lives here

| path             | contents                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `locales/<lang>` | 8 namespace files per language: `common`, `chat`, `settings`, `auth`, `errors`, `models`, `pricing`, `v3` |
| `src/resources`  | every locale bundled for `i18next`                                                                        |
| `src/index`      | `SUPPORTED_LANGUAGES`, `baseInitOptions`, helpers                                                         |

## What does NOT live here

The `i18next` instances. Each app constructs its own, because the differences
are real: web needs the browser detector and an SSR hydration workaround,
desktop has no cookies inside a Tauri webview, and mobile has neither — it
reads `expo-localization` and persists through MMKV. Only the language list,
fallback rule and strings are shared.

## Adding a language

Add `locales/<code>/` with the eight namespace files, an import block in
`src/resources.ts`, and an entry in `SUPPORTED_LANGUAGES`. Set `rtl: true` for
right-to-left scripts — hosts read that to set `<html dir>`, and without it the
text renders in the wrong direction.

Untranslated keys fall back to English rather than rendering blank, so a
partial language is safe to ship.
