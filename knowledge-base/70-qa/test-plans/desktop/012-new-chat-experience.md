---
id: "PLAN-desktop-012"
type: "test-plan"
title: "Desktop · 12. New-chat experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "12"
---
# Desktop · 12. New-chat experience

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S12.01 Empty conversation canvas.

- **Expected:** Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7635; apps/web/features/chat/pages/WebChatPage.tsx:6651; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Sign in, then the first screen is the New chat screen (New chat) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in to the desktop app with any account.
  2. Look at the first screen: it should be New chat with no earlier messages in the middle area.
  3. Look at the message box at the bottom: it should be ready to type in, with the placeholder text 'How can I help you today?'.
  4. Compare with Expected: an empty conversation area and a ready composer.

## S12.02 Personalized greeting where appropriate.

- **Expected:** The new-chat screen greets the signed-in user by their (preferred) name when one is known.
- **Code:** done. Evidence moved: apps/web/features/chat/components/GreetingBanner/useGreeting.ts:47; apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx:18; apps/web/features/chat/pages/WebChatPage.tsx:5650 (quoted code not found in the file now); apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** New chat screen, under the top of the page (greeting line) (labels found in the code)
- **Needs:** a signed-in account with a name in the profile
- **Steps:**
  1. Sign in with an account that has a preferred name or name set in the profile.
  2. Open New chat.
  3. Look at the greeting line above the message box: it should use the first name, for example 'Good morning, <name>'.
  4. Compare with Expected: the greeting uses the name. The wording depends on the time of day and the day of the month, so it may not be 'Good morning'.

## S12.03 Neutral greeting when personalization is disabled.

- **Expected:** When personalization is off (or no name is known), the new-chat greeting is neutral and shows no personal details.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:606 (quoted code not found in the file now); apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts:14; apps/web/features/chat/components/GreetingBanner/useGreeting.ts:34
- **Where to find it:** not found in the code. The Settings section named Personalization exists, and the greeting checks an opt-out (useNameOptedOut.ts), but I did not find the visible label of the control that turns name use off, so the exact path is unknown.
- **Needs:** a signed-in account

## S12.04 Suggested prompts.

- **Expected:** The new-chat screen offers clickable suggested prompts that fill or send a message.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. I searched apps/web and packages/ui for 'suggest' and 'Suggested'. The hits were slash-command and composer files and i18n files, and no suggested-prompt cards on the New chat screen were found.
- **Needs:** a signed-in account

## S12.05 Task-category shortcuts.

- **Expected:** The new-chat screen offers one-tap task-category shortcuts (e.g. write, research, image) that set up the next message.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7751
- **Where to find it:** not found in the code. The plan's Code line points to apps/web/features/chat/pages/WebChatPage.tsx:7751, which is message-list wiring, not a category shortcut row. The closest controls are the + menu rows Deep Research, Create image and Create video (see S12.11 to S12.13), but no write, research or image shortcut row on the empty screen was found.
- **Needs:** a signed-in account

## S12.06 Recent Project shortcuts.

- **Expected:** The new-chat screen offers shortcuts to the user's recent projects that open the project or start a chat in it.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:228; packages/ui/ui/src/sidebar/Sidebar.tsx:727; apps/web/features/chat/pages/WebChatPage.tsx:7182; apps/web/app/api/projects/route.ts:102; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/pages/WebChatPage.tsx:1658
- **Where to find it:** Sidebar > Projects > click a project name (the sidebar has a Projects section; a project row also offers 'New chat in project') (labels found in the code)
- **Needs:** an account with at least one project
- **Steps:**
  1. Sign in and make sure the account has at least one project.
  2. Look at the sidebar on the left for the Projects section.
  3. Click a project name in that section.
  4. Compare with Expected: the project opens, or a new chat starts inside it.

## S12.07 Recent-file suggestions.

- **Expected:** When starting a chat the user is offered their recently used files to attach in one step.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1285; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1016; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1023; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2585
- **Where to find it:** Message box > 'Add attachments and tools' (+) > 'Add from library' (the list of library files opens under it) (labels found in the code)
- **Needs:** an account with files in the Library
- **Steps:**
  1. Open New chat and click the + button in the message box (its label is 'Add attachments and tools').
  2. Click 'Add from library'.
  3. Look at the list of files that appears under it.
  4. Compare with Expected: the list offers files you used recently to attach in one step. The list order was not verified in code.

## S12.09 Recommended connected apps.

- **Expected:** The new-chat screen recommends apps/connectors worth connecting or using for the next message.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan's Code line gives no location. I searched the composer and greeting files for 'recommended' and found no recommended-connectors area on the New chat screen.
- **Needs:** a signed-in account

## S12.10 Search entry.

- **Expected:** From the new-chat screen the user can explicitly start a web search for the next message.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/lib/slashCommands.ts:33; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx (text found, layout changed); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3190; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1925
- **Where to find it:** Message box > type / > choose /search (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open New chat and click into the message box.
  2. Type / to open the slash command menu.
  3. Choose '/search' (described as 'Search the web').
  4. Look at the message box: it should show /search, ready for the next message. Send a question and check that the answer uses web results.

## S12.11 Research entry.

- **Expected:** From the new-chat screen the user can switch on a deep-research mode for the next message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2561; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** Message box > 'Add attachments and tools' (+) > 'Deep Research' (switch) (labels found in the code)
- **Needs:** a signed-in account (the row can be disabled by plan)
- **Steps:**
  1. Open New chat and click the + button ('Add attachments and tools').
  2. Click the 'Deep Research' row to turn it on.
  3. Look at the row: it should show as checked.
  4. Type a question and send it, then compare with Expected: the message is sent in deep-research mode. The row may be disabled depending on the account, and its title explains why.

## S12.12 Image-creation entry.

- **Expected:** From the new-chat screen the user can enter an image-creation mode whose send generates an image.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1300; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2584; apps/web/features/chat/pages/WebChatPage.tsx:7696; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** Message box > 'Add attachments and tools' (+) > 'Create image' (labels found in the code)
- **Needs:** an account with image generation available
- **Steps:**
  1. Open New chat and click the + button ('Add attachments and tools').
  2. Click 'Create image'.
  3. Type a picture description in the message box and click send.
  4. Compare with Expected: the send creates an image, not a text answer. The row shows only when the account can generate images.

## S12.13 Video-creation entry.

- **Expected:** From the new-chat screen the user can enter a video-creation mode whose send starts a video generation.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1301; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2659; apps/web/features/chat/pages/WebChatPage.tsx:7697; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** Message box > 'Add attachments and tools' (+) > 'Create video' (labels found in the code)
- **Needs:** an account with video generation available
- **Steps:**
  1. Open New chat and click the + button ('Add attachments and tools').
  2. Click 'Create video'.
  3. Type a short video description and click send.
  4. Compare with Expected: the send starts a video generation. The row shows only when the account can generate videos.

## S12.14 Voice entry.

- **Expected:** From the new-chat screen the user can start a spoken (voice-mode) conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2085; apps/web/features/chat/pages/WebChatPage.tsx:5668 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** not found in the code. I found the composer's 'Start voice input' label, which reads like dictation. I did not find the label of the spoken voice-mode entry (onEnterVoiceMode in ChatComposerNew.tsx), so the exact path is unknown.
- **Needs:** a microphone

## S12.15 Agentic-work entry.

- **Expected:** From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6173; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2806; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3913; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** not found in the code. 'Agent Mode' and the Work mode (workMode, AGI_WORK_MODE) exist in code, but I did not trace which control on the New chat composer turns them on, so the exact path is unknown.
- **Needs:** a signed-in account

## S12.16 Coding entry.

- **Expected:** From the new-chat surface the user can start a coding session (a repository/workspace-aware coding agent).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:516; packages/ui/ui/src/sidebar/Sidebar.tsx:629; apps/web/features/chat/pages/WebChatPage.tsx:7140; apps/web/features/chat/pages/WebChatPage.tsx:7156; apps/web/app/code/page.tsx:11; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/pages/WebChatPage.tsx:1658
- **Where to find it:** Sidebar > Code (opens the coding area at /code) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and look at the sidebar on the left.
  2. Click 'Code'.
  3. Look at the coding screen: it should offer a repository or workspace-aware coding session.
  4. Start a session, then compare with Expected: a coding session starts, not a plain chat.

## S12.17 Temporary-chat control.

- **Expected:** Before or during a new chat the user can switch it to a temporary chat that is not kept in history.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1574; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1816; apps/web/features/chat/pages/WebChatPage.tsx:3855 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6000
- **Where to find it:** Message box > 'Add attachments and tools' (+) > 'Temporary chat' (switch) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open New chat and click the + button ('Add attachments and tools').
  2. Click the 'Temporary chat' row to turn it on.
  3. Read the explanation under it, then send a message.
  4. Compare with Expected: the chat is marked temporary and is not kept in history. The 'end temporary chat' control appears in the same menu while it is on.

## S12.18 Default-model display.

- **Expected:** The new-chat screen shows which model the next message will use before the user sends.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1296 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1059; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box footer > model name button (shows the model the next message will use) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open New chat and look at the footer of the message box before typing.
  2. Read the model name shown there.
  3. Click it to open the model list if you want to compare.
  4. Compare with Expected: the model shown is the one the next message uses. The name depends on the plan and on the Auto setting.

## S12.19 Default-workspace display.

- **Expected:** The new-chat screen shows which workspace (personal or organization) the new chat will belong to.
- **Code:** done. Evidence moved: apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:22; apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:28; apps/web/features/chat/pages/WebChatPage.tsx:6175 (quoted code not found in the file now)
- **Where to find it:** New chat screen, under the greeting: 'Workspace: <name>' (labels found in the code)
- **Needs:** an account that belongs to an organization
- **Steps:**
  1. Sign in to an account that belongs to an organization.
  2. Open New chat.
  3. Look for the line under the greeting that starts with 'Workspace:'.
  4. Compare with Expected: it names the workspace the new chat will use. The line does not appear for accounts without an organization.

## S12.20 Default-Project selection.

- **Expected:** Before sending, the user can pick the project a new chat will be created in.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5266 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2780; apps/web/features/chat/pages/WebChatPage.tsx:5015; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/components/WebChatRoot.tsx:25; apps/web/app/chat/page.tsx:16
- **Where to find it:** Message box > 'Project or folder' control (labels found in the code)
- **Needs:** an account with at least one project
- **Steps:**
  1. Open New chat and find the 'Project or folder' control in the message box area.
  2. Open it and pick a project from the list (there is a 'Search projects' field).
  3. Look at the control: it should show the chosen project.
  4. Send a message and check that the new chat is created in that project. The clear control is labelled 'Clear project or folder selection'.

## S12.21 Mode explanation and examples.

- **Expected:** The new-chat screen explains the available modes and gives examples of what each is for.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. I searched the new-chat code for mode explanations and found none on the New chat screen. The only related link is 'Learn how to use Work safely.' on the Work home screen, which is not the same thing.
- **Needs:** a signed-in account

## S12.22 First-use feature education.

- **Expected:** First-time users are shown a short introduction to the product's key features before or at their first chat.
- **Code:** done. Evidence moved: apps/web/app/welcome/page.tsx:32; apps/web/features/onboarding/components/OnboardingWizard.tsx:42; apps/web/app/signup/complete/page.tsx:12 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The routes apps/web/app/welcome/page.tsx and the OnboardingWizard component exist, but I did not read their visible step text, so the exact screens and words are unknown.
- **Needs:** a new account (first sign-up)

## S12.23 Resumption of an unsent draft.

- **Expected:** An unsent draft typed in a new chat is restored when the user returns (after navigation or reload).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4157; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124; apps/web/features/chat/components/Composer/composer-draft-storage.ts:188
- **Where to find it:** no screen of its own. The draft is kept in browser storage (apps/web/features/chat/components/Composer/composer-draft-storage.ts, key 'new-chat'); there is no control for it.
- **Steps:**
  1. Open New chat and type a sentence in the message box without sending.
  2. Go to another page in the app (for example Settings) and come back to New chat.
  3. Compare with Expected: the typed sentence is still in the message box.

## S12.24 Guest limitations and sign-in conversion.

- **Expected:** A signed-out visitor can use the product within stated guest limits and is prompted to sign in to lift them.
- **Code:** partial. Evidence present: apps/web/lib/guest-chat/guest-chat-access.ts:33
- **Known to be unfinished:** web: switch-on AGI_BOT_CHALLENGE_ENFORCED=1 and flag guest.chat (surface web), off by owner decision for now. desktop: declined (lead ruling 2026-09-28): guest chat is web-only; the ChatGPT and Claude desktop apps require sign-in
- **Where to find it:** not found in the code. Guest limit copy exists, but the guest chat path depends on the guest.chat flag, which the plan says is off, and I did not find the sign-in prompt text, so the path is unknown.
- **Needs:** a signed-out browser (web only; the desktop app requires sign-in)
