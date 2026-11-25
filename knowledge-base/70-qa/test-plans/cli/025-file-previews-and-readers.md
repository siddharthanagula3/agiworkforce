---
id: "PLAN-cli-025"
type: "test-plan"
title: "CLI · 25. File previews and readers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "25"
---
# CLI · 25. File previews and readers

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S25.02 Text-file reader.

- **Expected:** Plain-text files open in a readable in-product view.
- **Code:** done. Evidence present: apps/cli/src/cloud/library.rs:99; apps/cli/src/lib.rs:7318
- **Where to find it:** Terminal: agi library show <id> (get the id from agi library) (labels found in the code)
- **Needs:** a signed-in account with a plain text file in the Library, and a terminal
- **Steps:**
  1. Type agi library and note the id of a plain .txt item in the list.
  2. Type agi library show <id> with that id.
  3. Compare: the text prints in the terminal in a readable form, matching the Expected line. Plain .txt, .log, .csv and .tsv files print without any code block or styling.

## S25.03 Markdown reader.

- **Expected:** Markdown files render formatted in the product.
- **Code:** done. Evidence moved: apps/cli/src/cloud/library.rs:40; apps/cli/src/tui/markdown_renderer.rs:107 (quoted code not found in the file now)
- **Where to find it:** Terminal: agi library show <id> (get the id from agi library), for a .md item (labels found in the code)
- **Needs:** a signed-in account with a Markdown file in the Library, and a terminal
- **Steps:**
  1. Type agi library and note the id of a .md item in the list.
  2. Type agi library show <id> with that id in a real terminal window.
  3. Compare: headings and bold text show styled, not as raw # or ** marks. Styling only appears when output goes to a terminal; if the output is piped to a file, it prints plain text.

## S25.04 Source-code reader.

- **Expected:** Source-code files open with syntax-aware display.
- **Code:** done. Evidence moved: apps/cli/src/cloud/library.rs:40; apps/cli/src/tui/markdown_renderer.rs:107 (quoted code not found in the file now)
- **Where to find it:** Terminal: agi library show <id> (get the id from agi library), for a source-code item such as .rs or .py (labels found in the code)
- **Needs:** a signed-in account with a source-code file in the Library, and a terminal
- **Steps:**
  1. Type agi library and note the id of a source-code file such as .rs or .py.
  2. Type agi library show <id> with that id in a real terminal window.
  3. Compare: the code appears inside a block labelled with its file extension, with its lines intact. Check whether keywords or strings get different colours, as the Expected line asks.

## S25.26 Download original.

- **Expected:** Users can download the original file.
- **Code:** done. Evidence present: apps/cli/src/cloud/library.rs:103; apps/cli/src/cloud/client.rs:999
- **Where to find it:** Terminal: agi library download <id> (optional --out <folder>; get the id from agi library) (labels found in the code)
- **Needs:** a signed-in account with an item in the Library, and a writable folder
- **Steps:**
  1. Type agi library and note the id of an item.
  2. Type agi library download <id> --out <an existing folder on the Desktop>.
  3. Compare: the terminal prints a line starting with Saved, and the original file is in that folder under its own name (or under the item id if the server gives no name).
  4. Open the saved file and check it matches the original item.

## S25.29 Open in native application.

- **Expected:** Users can open a file in its native application.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3959
- **Where to find it:** Terminal: agi artifacts show <id> --out <folder> --open (get the id from agi artifacts list) (labels found in the code)
- **Needs:** a signed-in account with an artifact, and a Mac
- **Steps:**
  1. Type agi artifacts list and note the id of an artifact.
  2. Type agi artifacts show <id> --out ~/Desktop/qa-out --open, using a folder that exists.
  3. Compare: the file is written into that folder and opens in the Mac's default app for its type. If it does not open, the terminal prints the file path followed by (could not open it automatically).
