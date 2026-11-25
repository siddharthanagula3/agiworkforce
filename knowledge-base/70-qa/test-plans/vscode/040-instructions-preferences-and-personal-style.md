---
id: "PLAN-vscode-040"
type: "test-plan"
title: "VS Code · 40. Instructions, preferences, and personal style"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "40"
---
# VS Code · 40. Instructions, preferences, and personal style

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S40.01 Preferred name or form of address.

- **Expected:** The user can tell the assistant what to call them, and replies address them that way.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:134 (quoted code not found in the file now); apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > What should AGI call you? (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click What should AGI call you? and type a name, then press Enter.
  3. Check the row now shows that name instead of Not set.
  4. Send a new chat message and check the reply uses that name.

## S40.02 Background information.

- **Expected:** The user can give the assistant background about themselves that it keeps in mind.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:139 (quoted code not found in the file now); apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > What do you do? (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click What do you do? and type a short background, up to 120 characters, then press Enter.
  3. Check the row shows that text instead of Not set.
  4. Send a chat message that depends on that background and check the reply keeps it in mind.

## S40.03 Role or profession.

- **Expected:** The user can state their role or profession and replies are tailored to it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:139 (quoted code not found in the file now); apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > What do you do? (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click What do you do? and type a role, such as a job title, then press Enter.
  3. Check the row shows the role.
  4. Send a question in that field of work and check the reply fits that role.

## S40.05 Desired response style.

- **Expected:** The user can choose the response style they want, and replies follow that one choice.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:145; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Style (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Style, then pick Concise, Explanatory, Learning, Formal or Default.
  3. Check the Style row shows the chosen name.
  4. Send a question and compare the reply with the style chosen.

## S40.07 Formality preference.

- **Expected:** The user can choose a more or less formal register and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:145; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Style > Formal (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Style and pick Formal.
  3. Check the Style row shows Formal.
  4. Send a question and check the reply uses a formal register.

## S40.08 Tone presets.

- **Expected:** The user can pick from named tone/style presets, and one chosen preset governs replies.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:145; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Style (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Style and look at the named choices: Default, Concise, Explanatory, Learning, Formal.
  3. Pick one preset, then check the Style row shows it.
  4. Send a question and check the reply follows that one preset.

## S40.09 Warmth preference.

- **Expected:** The user can ask for warmer or cooler tone and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:65; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Tone > Warmth (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Under the Tone heading, click Warmth.
  3. Pick Warm and personable, or Neutral and businesslike, or Default.
  4. Check the Warmth row shows the choice, then send a question and compare the tone of the reply.

## S40.10 Enthusiasm preference.

- **Expected:** The user can ask for more or less enthusiasm and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:66; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Tone > Enthusiasm (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Under the Tone heading, click Enthusiasm.
  3. Pick Energetic and encouraging, or Measured, or Default.
  4. Check the Enthusiasm row shows the choice, then send a question and compare the reply.

## S40.11 Heading/list preference.

- **Expected:** The user can say whether replies should use headings and lists or prose, and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:68; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Formatting (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Formatting and pick Prose, or Headings and bullet lists, or another option.
  3. Check the Formatting row shows the choice.
  4. Send a question and compare whether the reply uses headings and lists or flowing prose.

## S40.12 Emoji preference.

- **Expected:** The user can ask for more or less emoji and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:73; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Tone > Emoji (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Under the Tone heading, click Emoji.
  3. Pick No emoji or Emoji welcome.
  4. Check the Emoji row shows the choice, then send a question and check whether the reply uses emoji.

## S40.13 Technical-depth preference.

- **Expected:** The user can set how technical replies should be, and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:159; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Technical level (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Technical level and pick Beginner, Intermediate or Expert.
  3. Check the Technical level row shows the choice.
  4. Send the same technical question and compare the depth of the reply.

## S40.14 Language preference.

- **Expected:** The user can set the language replies are written in (separate from the interface language), and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:200; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Language (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Language, type a tag such as de, then press Enter.
  3. Check the Language row shows de.
  4. Send a question in English and check the reply is written in German.

## S40.16 Persistent custom instructions.

- **Expected:** The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1675; apps/extension-vscode/src/core/commandSetup.ts:741 (quoted code not found in the file now); apps/extension-vscode/src/features/instructions/customInstructions.ts:105; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2648 (quoted code not found in the file now)
- **Where to find it:** Settings > Instructions & editor > Custom instructions > Host default (labels found in the code)
- **Steps:**
  1. Click the Code: Open Settings command (or Sidebar > Settings).
  2. Click Instructions & editor in the left list.
  3. Under Custom instructions, type a standing instruction in Host default, then click Save host instructions.
  4. Open a new chat and check the reply follows it; the Effective turn prelude box should show the text.

## S40.17 Project instructions.

- **Expected:** The user can give a project its own instructions that apply to every chat in that project.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1702; apps/extension-vscode/src/core/commandSetup.ts:741 (quoted code not found in the file now); apps/extension-vscode/src/features/instructions/customInstructions.ts:85 (quoted code not found in the file now); apps/extension-vscode/src/data/projectInstructions.ts:4 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Projects > (select a project) > Edit > Instructions (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one project
- **Steps:**
  1. Open the sidebar menu and click Projects, then select a project.
  2. In the project list under Edit, click Instructions.
  3. Type project instructions in Project instructions and press Enter.
  4. Open a new chat in that project and check the reply follows the instructions; the Instructions row should now show Set.

## S40.24 Explanatory output style.

- **Expected:** The user can choose an explanatory style that explains reasoning and context, and replies follow it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:145; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Style > Explanatory (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Style and pick Explanatory.
  3. Check the Style row shows Explanatory.
  4. Ask a how-to question and check the reply explains the reasoning and context.

## S40.26 Concise output style.

- **Expected:** The user can choose a concise style and replies are short and direct.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/personalization/personalization.ts:145; apps/extension-vscode/src/features/personalization/personalization.ts:264 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2667
- **Where to find it:** Sidebar > Personalization > Style > Concise (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the sidebar menu and click Personalization.
  2. Click Style and pick Concise.
  3. Check the Style row shows Concise.
  4. Ask a question and check the reply is short and direct.

## S40.28 Effective-instruction explanation where useful.

- **Expected:** The user can see which instructions and preferences are currently in effect and where each comes from.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1727; apps/extension-vscode/src/core/commandSetup.ts:741 (quoted code not found in the file now); apps/extension-vscode/src/features/settings/SettingsPanel.ts:274
- **Where to find it:** Settings > Instructions & editor > Effective turn prelude (labels found in the code)
- **Steps:**
  1. Click the Code: Open Settings command (or Sidebar > Settings).
  2. Click Instructions & editor in the left list.
  3. Read the Effective turn prelude box; it shows the exact instruction block added to new turns, with its scope in the header.
  4. Read the Runtime-discovered project sources list and compare the named sources with Expected.
