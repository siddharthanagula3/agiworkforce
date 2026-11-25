---
id: "PLAN-cli-040"
type: "test-plan"
title: "CLI · 40. Instructions, preferences, and personal style"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "40"
---
# CLI · 40. Instructions, preferences, and personal style

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S40.01 Preferred name or form of address.

- **Expected:** The user can tell the assistant what to call them, and replies address them that way.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:31; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set name <value> in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode; if it is not, type /model and switch to Cloud mode.
  2. Type /personalize set name Sam (any name up to 60 characters).
  3. Type /personalize show and check that the line labelled What to call you shows the name.
  4. Ask a question and check whether the reply uses that name, then compare with Expected.

## S40.02 Background information.

- **Expected:** The user can give the assistant background about themselves that it keeps in mind.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:45; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set about <text> in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set about I run a small bakery that sells online. (up to 1500 characters).
  3. Type /personalize show and check that the line labelled About you shows the text.
  4. Ask a question that depends on the background, such as what to name a new product, and compare the reply with Expected.

## S40.03 Role or profession.

- **Expected:** The user can state their role or profession and replies are tailored to it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:38; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set work <text> in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set work high school chemistry teacher (up to 120 characters).
  3. Type /personalize show and check that the line labelled Your work or role shows the text.
  4. Ask for help with a task from that job and check whether the reply is tailored to it.

## S40.05 Desired response style.

- **Expected:** The user can choose the response style they want, and replies follow that one choice.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5724; apps/cli/src/output_styles.rs:101; apps/cli/src/agent/mod.rs:1828
- **Where to find it:** Type /output-style in the chat to list the styles, then /output-style <name> to pick one (labels found in the code)
- **Steps:**
  1. Type /output-style and read the Available styles: list; the active one has a * beside it.
  2. Type /output-style concise.
  3. Ask a question such as How do I reverse a list in Python? and check the reply follows the chosen style.
  4. Type /output-style again and check the active style is the one you picked.

## S40.07 Formality preference.

- **Expected:** The user can choose a more or less formal register and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:52; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set style formal in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set style formal.
  3. Type /personalize show and check that the line labelled Response style shows formal.
  4. Ask a question and check whether the reply uses a more formal register, then compare with Expected.

## S40.08 Tone presets.

- **Expected:** The user can pick from named tone/style presets, and one chosen preset governs replies.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5724; apps/cli/src/output_styles.rs:101; apps/cli/src/agent/mod.rs:1828
- **Where to find it:** Type /output-style in the chat, then /output-style <name> (labels found in the code)
- **Steps:**
  1. Type /output-style and read the list: default, proactive, concise, explanatory, learning and study.
  2. Type /output-style study.
  3. Ask a question and check that one preset governs the reply.
  4. Type /output-style default to go back, and compare with Expected.

## S40.09 Warmth preference.

- **Expected:** The user can ask for warmer or cooler tone and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:93; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set warmth more in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set warmth more.
  3. Type /personalize show and check that the line labelled Warmth shows more.
  4. Ask a question and check whether the reply is warmer; then type /personalize set warmth less and ask again to compare.

## S40.10 Enthusiasm preference.

- **Expected:** The user can ask for more or less enthusiasm and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:100; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set enthusiasm less in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set enthusiasm less.
  3. Type /personalize show and check that the line labelled Enthusiasm shows less.
  4. Ask a question and check whether the reply is less enthusiastic, then compare with Expected.

## S40.11 Heading/list preference.

- **Expected:** The user can say whether replies should use headings and lists or prose, and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:107; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set headings less in the chat, or /personalize set formatting prose, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set formatting prose.
  3. Type /personalize show and check that the line labelled Formatting shows prose.
  4. Ask a question that has several parts and check whether the reply uses prose instead of headings and lists, then compare with Expected.

## S40.12 Emoji preference.

- **Expected:** The user can ask for more or less emoji and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:114; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set emoji less in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set emoji less.
  3. Type /personalize show and check that the line labelled Emoji shows less.
  4. Ask a question and check whether the reply has fewer or no emoji, then compare with Expected.

## S40.13 Technical-depth preference.

- **Expected:** The user can set how technical replies should be, and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:59; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set technical beginner in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set technical beginner.
  3. Type /personalize show and check that the line labelled Technical level shows beginner.
  4. Ask a technical question and check whether the reply is simpler, then compare with Expected.

## S40.14 Language preference.

- **Expected:** The user can set the language replies are written in (separate from the interface language), and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:86; apps/cli/src/cloud/personalization.rs:141 (quoted code not found in the file now); apps/cli/src/cloud/personalization.rs:204 (quoted code not found in the file now)
- **Where to find it:** Type /personalize set language fr in the chat, then /personalize show (labels found in the code)
- **Needs:** a signed-in AGI account in Cloud mode
- **Steps:**
  1. Check that the chat is signed in and in Cloud mode.
  2. Type /personalize set language fr.
  3. Type /personalize show and check that the line labelled Reply language shows fr.
  4. Ask a question in English and check whether the reply is written in French, then compare with Expected.
  5. Type /personalize set language auto to go back.

## S40.16 Persistent custom instructions.

- **Expected:** The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them.
- **Code:** done. Evidence moved: apps/cli/src/repl/registry.rs:1986; apps/cli/src/tui/tui_app.rs:3791 (quoted code not found in the file now); apps/cli/src/memory.rs:61 (quoted code not found in the file now); apps/cli/src/agent/mod.rs:582 (quoted code not found in the file now)
- **Where to find it:** Type /memory add global <text> in the chat; standing account custom instructions are set on the web under Settings > General, which /personalize show prints as a link (labels found in the code)
- **Needs:** none for the file instructions; a signed-in account for the web custom instructions
- **Steps:**
  1. Type /memory add global Always answer in short bullet points.
  2. Type /memory and check that the [global] entry under Memory Hierarchy: is found and shows a preview of the text.
  3. Start a new chat, ask a question, and check the reply follows the instruction.
  4. Look for a control that switches the instruction off without deleting it; none was found in the CLI, so compare with Expected and note the result.

## S40.17 Project instructions.

- **Expected:** The user can give a project its own instructions that apply to every chat in that project.
- **Code:** done. Evidence moved: apps/cli/src/repl/registry.rs:1986; apps/cli/src/memory.rs:87; apps/cli/src/agent/mod.rs:582 (quoted code not found in the file now)
- **Where to find it:** In the project folder, type /memory add project <text> in the chat (labels found in the code)
- **Needs:** a project folder with a git repository or project file
- **Steps:**
  1. Open a terminal in the project folder and start agi there.
  2. Type /memory add project Use metric units.
  3. Type /memory and check that the [project] entry is found with its path.
  4. Start a new chat in the same folder, ask a question that involves units, and check the reply follows the instruction.

## S40.18 Agent instructions.

- **Expected:** The user can define an agent with its own instructions that apply whenever that agent is used.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:5040 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:2032; apps/cli/src/agents.rs:6; apps/cli/src/agents.rs:98
- **Where to find it:** Type /agents create <name> in the chat, then /agents path <name> to find the file to write the instructions in (labels found in the code)
- **Steps:**
  1. Type /agents create reviewer (add --global for all projects).
  2. Type /agents path reviewer and open the file it names in a text editor.
  3. Write the instructions in the body of the file below the header lines, and save.
  4. Type /agents show reviewer and check the prompt body shows your instructions.
  5. Type /agents reviewer to apply it to this session, ask a question, and compare with Expected.

## S40.19 Conversation overrides.

- **Expected:** For one conversation the user can override their standing style/instructions without changing their defaults.
- **Code:** done. Evidence moved: apps/cli/src/claude_parity.rs:904 (quoted code not found in the file now); apps/cli/src/claude_parity.rs:1363
- **Where to find it:** Type /output-style <name> --session in the chat (labels found in the code)
- **Steps:**
  1. Type /output-style and note the active style and the saved default.
  2. Type /output-style learning --session.
  3. Ask a question and check the reply follows the session-only style.
  4. Start a new chat or type /output-style and check the saved default has not changed.

## S40.23 Style reset.

- **Expected:** One action returns the user's style preferences to the defaults.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5724; apps/cli/src/output_styles.rs:150
- **Where to find it:** not found in the code. No single action that resets all style preferences was found; the nearest are /output-style default (back to the built-in default style) and /personalize clear <field> for one field at a time. Searched apps/cli for reset and clear actions.

## S40.24 Explanatory output style.

- **Expected:** The user can choose an explanatory style that explains reasoning and context, and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5724; apps/cli/src/output_styles.rs:41 (quoted code not found in the file now); apps/cli/src/agent/mod.rs:1828
- **Where to find it:** Type /output-style explanatory in the chat (labels found in the code)
- **Steps:**
  1. Type /output-style explanatory.
  2. Ask a question such as Why does Python use indentation?
  3. Check the reply explains its reasoning and adds insight blocks, then compare with Expected.

## S40.25 Learning-oriented output style.

- **Expected:** The user can choose a learning-oriented style (teaching, quizzing, step by step), and replies actually follow it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5724; apps/cli/src/output_styles.rs:50 (quoted code not found in the file now); apps/cli/src/agent/mod.rs:1828
- **Where to find it:** Type /output-style learning in the chat (labels found in the code)
- **Steps:**
  1. Type /output-style learning.
  2. Ask a question about a coding task and check the reply adds one optional learning exercise.
  3. Type /output-style study and ask the same question to compare the step-by-step teaching style.
  4. Compare what you see with Expected.

## S40.26 Concise output style.

- **Expected:** The user can choose a concise style and replies are short and direct.
- **Code:** done. Evidence present: apps/cli/src/output_styles.rs:46; crates/agiworkforce-agent-core/assets/output_styles/concise.md:1
- **Where to find it:** Type /output-style concise in the chat (labels found in the code)
- **Steps:**
  1. Type /output-style concise.
  2. Ask a question that could have a long answer, such as How do I install git on a Mac?
  3. Check the reply leads with the result with no preamble or recap, then compare with Expected.

## S40.27 Custom output-style creation.

- **Expected:** The user can create, name, edit and delete their own output style and use it in chats.
- **Code:** done. Evidence moved: apps/cli/src/output_styles.rs:208; apps/cli/src/output_styles.rs:241; apps/cli/src/output_styles.rs:135 (quoted code not found in the file now)
- **Where to find it:** Type /output-style new <name> <instructions> in the chat (labels found in the code)
- **Steps:**
  1. Type /output-style new brief-notes Keep every answer under three sentences.
  2. Type /output-style and check brief-notes is listed; the creation message gives the file path to edit.
  3. Type /output-style brief-notes, ask a question, and check the reply follows it.
  4. Type /output-style delete brief-notes and check the message says Deleted output style brief-notes.

## S40.28 Effective-instruction explanation where useful.

- **Expected:** The user can see which instructions and preferences are currently in effect and where each comes from.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:1378
- **Where to find it:** Type /output-style in the chat (no name), then /memory (labels found in the code)
- **Steps:**
  1. Type /output-style with no name.
  2. Check the In effect for this session: block shows the output style and where it comes from, and the Instructions lines list the memory files found.
  3. Type /memory and check the Memory Hierarchy: list shows which instruction files are found.
  4. Compare with Expected.

## S40.29 Import preferences from another assistant.

- **Expected:** The user can import their preferences and instructions from another assistant.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:7173; apps/cli/src/ecosystem.rs:587
- **Where to find it:** In a terminal outside the chat, run agi migrate --dry-run, then agi migrate (labels found in the code)
- **Needs:** Claude Code settings on this Mac
- **Steps:**
  1. In a terminal (not in the chat), type agi migrate --dry-run.
  2. Read the Claude Code migration dry run report, including the Source line and the MCP line.
  3. Type agi migrate to import for real.
  4. Check the report says Claude Code migration complete and that the imported items appear.
