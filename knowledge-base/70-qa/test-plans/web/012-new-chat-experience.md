---
id: "PLAN-web-012"
type: "test-plan"
title: "Web · 12. New-chat experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "12"
---
# Web · 12. New-chat experience

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S12.01 Empty conversation canvas.

- **Expected:** Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7635; apps/web/features/chat/pages/WebChatPage.tsx:6651; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E001 [PASS; visible UI]: New chat renders personalized greeting, composer, and default model. Ordinary Project chip and recurring provider banner are absent. A draft-conflict toast was also visible and is tracked separately.
- **Where to find it:** Sidebar > New chat (labels found in the code)
- **Steps:**
  1. Sign in to the web app.
  2. Click "New chat" in the sidebar (or the same action in the collapsed sidebar rail).
  3. Look at the conversation area: it should show no earlier messages.
  4. Look at the composer at the bottom: it should be ready to type in, with the default model shown.

## S12.02 Personalized greeting where appropriate.

- **Expected:** The new-chat screen greets the signed-in user by their (preferred) name when one is known.
- **Code:** done. Evidence moved: apps/web/features/chat/components/GreetingBanner/useGreeting.ts:47; apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx:18; apps/web/features/chat/pages/WebChatPage.tsx:5650 (quoted code not found in the file now); apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E001 [PASS; visible UI]: New chat renders personalized greeting, composer, and default model. Ordinary Project chip and recurring provider banner are absent. A draft-conflict toast was also visible and is tracked separately.
- **Where to find it:** Sidebar > New chat (labels found in the code)
- **Needs:** an account with a name set
- **Steps:**
  1. Make sure your name is set: Settings > Personalization > "What should AGI call you?" (type a name and save).
  2. Click "Sidebar > New chat".
  3. Read the greeting above the composer.
  4. Compare: it should say a time-of-day greeting with your name, for example "Good morning, <name>" (the wording depends on the time of day and the date).

## S12.03 Neutral greeting when personalization is disabled.

- **Expected:** When personalization is off (or no name is known), the new-chat greeting is neutral and shows no personal details.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:606 (quoted code not found in the file now); apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts:14; apps/web/features/chat/components/GreetingBanner/useGreeting.ts:34
- **Where to find it:** Settings > Personalization > "What should AGI call you?" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and choose "Personalization".
  2. Clear the field "What should AGI call you?" (its hint says "Leave empty to skip names.") and save.
  3. Click "Sidebar > New chat".
  4. Compare: the greeting should have no name and no personal details in it.

## S12.04 Suggested prompts.

- **Expected:** The new-chat screen offers clickable suggested prompts that fill or send a message.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No suggested-prompt control was found on the new-chat screen. The only clickable starter prompts found are "Start with one of these" in the first-run wizard (apps/web/features/onboarding/components/StarterPrompts.tsx), which send a chosen prompt to chat.

## S12.05 Task-category shortcuts.

- **Expected:** The new-chat screen offers one-tap task-category shortcuts (e.g. write, research, image) that set up the next message.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7751
- **Where to find it:** not found in the code. No task-category shortcut row (write, research, image) was found on the new-chat screen. The use-case choices in the first-run wizard (apps/web/features/onboarding/lib/use-cases.ts) are a different feature. Searched the chat, onboarding and sidebar folders for the words.

## S12.06 Recent Project shortcuts.

- **Expected:** The new-chat screen offers shortcuts to the user's recent projects that open the project or start a chat in it.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:228; packages/ui/ui/src/sidebar/Sidebar.tsx:727; apps/web/features/chat/pages/WebChatPage.tsx:7182; apps/web/app/api/projects/route.ts:102; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/pages/WebChatPage.tsx:1658
- **Where to find it:** Sidebar > Projects (labels found in the code)
- **Needs:** at least one project
- **Steps:**
  1. Sign in and look at the "Projects" section in the sidebar.
  2. Click a project name to open it, or click "Show more" if more projects are listed.
  3. Hover a project and use its "New chat in project" action to start a chat in that project.
  4. Compare: the recent projects should be listed there, and the action should open the project or start a chat in it.

## S12.07 Recent-file suggestions.

- **Expected:** When starting a chat the user is offered their recently used files to attach in one step.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1285; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1016; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1023; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2585
- **Where to find it:** More composer options (+) > Add from library (labels found in the code)
- **Needs:** a file in your library
- **Steps:**
  1. On the new-chat screen, click the "+" button (labelled "More composer options").
  2. Click "Add from library" to expand the list.
  3. Click a file in the list to attach it.
  4. Compare: the list should show library files, and the attached file should appear in the composer.

## S12.09 Recommended connected apps.

- **Expected:** The new-chat screen recommends apps/connectors worth connecting or using for the next message.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/web/features and packages/ui/ui/src for recommended connector or app suggestions and found none. The ledger gives no code location.

## S12.10 Search entry.

- **Expected:** From the new-chat screen the user can explicitly start a web search for the next message.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/lib/slashCommands.ts:33; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx (text found, layout changed); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3190; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1925
- **Where to find it:** Composer > type / > /search (labels found in the code)
- **Steps:**
  1. On the new-chat screen, click the composer and type "/".
  2. Choose "/search" (described as "Search the web").
  3. Type a question and send it.
  4. Compare: the reply should use a web search for that message.

## S12.11 Research entry.

- **Expected:** From the new-chat screen the user can switch on a deep-research mode for the next message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2561; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1100; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** More composer options (+) > Deep Research (labels found in the code)
- **Steps:**
  1. On the new-chat screen, click the "+" button (labelled "More composer options").
  2. Switch on "Deep Research".
  3. Type a question and send it.
  4. Compare: the reply should run as deep research, with research progress shown.

## S12.12 Image-creation entry.

- **Expected:** From the new-chat screen the user can enter an image-creation mode whose send generates an image.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1300; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2584; apps/web/features/chat/pages/WebChatPage.tsx:7696; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** More composer options (+) > Create image (labels found in the code)
- **Needs:** an account that can generate images
- **Steps:**
  1. Click the "+" button (labelled "More composer options") on the new-chat screen.
  2. Click "Create image".
  3. Type a picture description and send it.
  4. Compare: the send should generate an image in the reply.

## S12.13 Video-creation entry.

- **Expected:** From the new-chat screen the user can enter a video-creation mode whose send starts a video generation.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1301; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2659; apps/web/features/chat/pages/WebChatPage.tsx:7697; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** More composer options (+) > Create video (labels found in the code)
- **Needs:** an account that can generate video
- **Steps:**
  1. Click the "+" button (labelled "More composer options") on the new-chat screen.
  2. Click "Create video".
  3. Type a description and send it.
  4. Compare: the send should start a video generation.

## S12.14 Voice entry.

- **Expected:** From the new-chat screen the user can start a spoken (voice-mode) conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2085; apps/web/features/chat/pages/WebChatPage.tsx:5668 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > "Start voice mode" button (at the right end of the empty composer) (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. On the new-chat screen, leave the composer empty.
  2. Find the voice button at the right end of the composer (its label is "Start voice mode").
  3. Click it.
  4. Compare: the app should enter a spoken (voice-mode) conversation.

## S12.15 Agentic-work entry.

- **Expected:** From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6173; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2806; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3913; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Composer > Chat | Work switch > Work (labels found in the code)
- **Needs:** an account that can use Work
- **Steps:**
  1. On the new-chat screen, click "Work" in the Chat | Work switch above the composer.
  2. Type a task and send it.
  3. Compare: the chat should run as an agentic (multi-step, tool-using) task.

## S12.16 Coding entry.

- **Expected:** From the new-chat surface the user can start a coding session (a repository/workspace-aware coding agent).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:516; packages/ui/ui/src/sidebar/Sidebar.tsx:629; apps/web/features/chat/pages/WebChatPage.tsx:7140; apps/web/features/chat/pages/WebChatPage.tsx:7156; apps/web/app/code/page.tsx:11; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/pages/WebChatPage.tsx:1658
- **Where to find it:** Sidebar > Code (labels found in the code)
- **Steps:**
  1. Sign in and click "Code" in the sidebar.
  2. Look for the coding screen (the page at /code).
  3. Compare: it should offer a coding session tied to a repository or workspace.

## S12.17 Temporary-chat control.

- **Expected:** Before or during a new chat the user can switch it to a temporary chat that is not kept in history.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1574; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1816; apps/web/features/chat/pages/WebChatPage.tsx:3855 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** More composer options (+) > Temporary chat (labels found in the code)
- **Steps:**
  1. On the new-chat screen, click the "+" button (labelled "More composer options").
  2. Click "Temporary chat".
  3. Type a message and send it.
  4. Compare: the chat should not appear in the sidebar history afterwards.

## S12.18 Default-model display.

- **Expected:** The new-chat screen shows which model the next message will use before the user sends.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1296 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1059; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E001 [PASS; visible UI]: New chat renders personalized greeting, composer, and default model. Ordinary Project chip and recurring provider banner are absent. A draft-conflict toast was also visible and is tracked separately.
- **Where to find it:** Composer footer > model button ("Auto (Recommended)") (labels found in the code)
- **Steps:**
  1. On the new-chat screen, read the composer footer before sending.
  2. Note the model shown on the model button (by default "Auto (Recommended)").
  3. Click it to open the model list.
  4. Compare: the shown model should be the one the next message uses.

## S12.19 Default-workspace display.

- **Expected:** The new-chat screen shows which workspace (personal or organization) the new chat will belong to.
- **Code:** done. Evidence moved: apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:22; apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:28; apps/web/features/chat/pages/WebChatPage.tsx:6175 (quoted code not found in the file now)
- **Where to find it:** New chat > line under the greeting "Workspace: <name>" (labels found in the code)
- **Needs:** an account that is a member of an organization
- **Steps:**
  1. Sign in to an account that belongs to an organization.
  2. Click "New chat" in the sidebar.
  3. Read the line under the greeting: it shows a building icon and "Workspace: <name>" for an organization, or "Personal" when the personal workspace is active.
  4. Compare with the workspace the chat will be saved into.

## S12.20 Default-Project selection.

- **Expected:** Before sending, the user can pick the project a new chat will be created in.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5266 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2780; apps/web/features/chat/pages/WebChatPage.tsx:5015; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** New chat > composer project picker ("Project or folder") (labels found in the code)
- **Needs:** at least one project
- **Steps:**
  1. Click "New chat" in the sidebar.
  2. Click the project picker in the composer (it shows "Project or folder" when Work is available, otherwise "Project").
  3. Pick a project from the list.
  4. Send a message and compare: the new chat should be created in that project.

## S12.21 Mode explanation and examples.

- **Expected:** The new-chat screen explains the available modes and gives examples of what each is for.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No mode explanation or example text was found in the composer or chat folders. The ledger says live-web.

## S12.22 First-use feature education.

- **Expected:** First-time users are shown a short introduction to the product's key features before or at their first chat.
- **Code:** done. Evidence moved: apps/web/app/welcome/page.tsx:32; apps/web/features/onboarding/components/OnboardingWizard.tsx:42; apps/web/app/signup/complete/page.tsx:12 (quoted code not found in the file now)
- **Where to find it:** After sign-up > welcome page (/welcome) (labels found in the code)
- **Needs:** a new account that has not finished onboarding
- **Steps:**
  1. Create a new account and finish sign-in.
  2. On the welcome page, read "What should we call you?" and click "Continue".
  3. On "What do you want to do first?", look for the "How this works" section.
  4. Click "Finish" or a starter prompt, then compare: the short introduction should cover the key features.

## S12.23 Resumption of an unsent draft.

- **Expected:** An unsent draft typed in a new chat is restored when the user returns (after navigation or reload).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4157; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124; apps/web/features/chat/components/Composer/composer-draft-storage.ts:188
- **Where to find it:** no screen of its own. The draft is stored in apps/web/features/chat/components/Composer/composer-draft-storage.ts; a draft-conflict toast can appear.
- **Steps:**
  1. On the new-chat screen, type text in the composer but do not send it.
  2. Go to another page in the app, or reload the page.
  3. Return to the new chat.
  4. Compare: the typed text should be back in the composer.

## S12.24 Guest limitations and sign-in conversion.

- **Expected:** A signed-out visitor can use the product within stated guest limits and is prompted to sign in to lift them.
- **Code:** partial. Evidence present: apps/web/lib/guest-chat/guest-chat-access.ts:33
- **Known to be unfinished:** web: switch-on AGI_BOT_CHALLENGE_ENFORCED=1 and flag guest.chat (surface web), off by owner decision for now. desktop: declined (lead ruling 2026-09-28): guest chat is web-only; the ChatGPT and Claude desktop apps require sign-in
- **Where to find it:** not found in the code. Guest chat is behind the 'guest.chat' switch (apps/web/lib/guest-chat/config.ts), which the owner has left off. The guest-limit copy ("Without an account you can send ... messages a day.") is in packages/ui/i18n/locales/en/chat.json but no consumer was found in apps/web. No sign-in prompt for guests was found.
- **Needs:** a signed-out browser
