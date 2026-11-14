# Founder decisions, 2026-11-13

Status: Current
Owner: Founder, recorded by the mobile parity work
Last updated: 2026-11-13

The founder's mobile decisions of 2026-11-13, in the shape of
`2026-11-12-founder-decisions.md`. He made them after reading the feature
comparison in `docs/research/mobile-layout-2026-11-12/feature-comparison.md`,
which lists every feature his screenshots of the ChatGPT, Claude, Perplexity and
Gemini iPhone apps show and whether the mobile app has it. The open work these
decisions create is tracked in
`audit/live-check/mobile-feature-gaps-2026-11-13.md`.

## D-2026-11-13-01 The features most of the four apps share are built on mobile

- Decision: the mobile app gets every feature the comparison found that three or
  four of the apps have, or that both ChatGPT and Claude have, and that the app
  lacks or has in part: a second account and switching between accounts, search
  in coding sessions, a switch to wrap long lines in code and diffs, a separate
  notification switch for scheduled tasks, a product updates notification with a
  sender behind it, pinning a project, deleting all chats in Local mode, a Terms
  link and a notice that the assistant can make mistakes on the first-run
  screens, an explanation of the usage limits, a coding settings page with
  sorting and state filters for sessions, more kinds in the Library filter, and
  filters and a more-actions menu for projects.
- Decision: from the features two apps share, these are built too: adding a
  photo or file during a voice conversation, a glow that shows listening or
  speaking, a hint that introduces voice, a Completed filter for scheduled
  tasks, email and calendar as personal sources, and a notice when a reply is
  ready.
- Not built: a greeting with the user's name on the home screen, image style
  templates, an Images page, and any change to two-step sign-in.
- Why: the founder's call, in his words "yes to all" and "except: no need of 12,
  16, 17, 20(no changes)", the numbers being those of the list he was shown.
- Deviation: design rule 6 of `.agents/skills/agiworkforce-design` forbids
  decorative glow. The voice glow is allowed because it carries state; it
  appears only on the voice surfaces and only while a voice session is active.
- Limit: a part of a feature is built only where the data or the server really
  supports it. What was left out for that reason stays listed in the tracker.

## D-2026-11-13-02 A phone can hold more than one account

- Decision: a user can add a second account in the mobile app and switch between
  signed-in accounts, as all four apps allow.
- Why: the founder's call, "yes to all", to the question "More than one account
  on a phone".
- Needs before it works: the sign-in provider's setting that allows several
  sessions on one device, on the development and the production instance. That
  is an account setting and stays the founder's step.

## D-2026-11-13-03 Users can allow their chats and voice recordings to be used to improve models

- Decision: Settings gets two switches, one for using the user's chats to
  improve the company's models and one for voice recordings. Both are off until
  the user turns them on.
- Why: the founder's call, in his words "in future we can develop our own LLM,
  orelse i can sell the mobile, web, desktop app to a company which may need
  it". All four apps have the first switch and three have the second.
- Supersedes: the decline recorded in rows GAP-032, GAP-160 and GAP-176 of
  `audit/registers/ui-gaps.csv`, which rested on the company never training on
  customer content. It also answers the opt-in half of item 2 in
  `audit/decisions/founder-decisions.md`.
- Unchanged: the switch "Only use models that do not train on your chats" keeps
  its meaning. It limits which outside model providers a chat may go to and is
  not a consent to anything.
- Limit: today nothing uses customer content to improve a model. The switches
  record a choice; any future use must read it and must treat a missing or
  unreadable choice as no.
- Open before release: a lawyer reviews the switch wording and every change to
  the privacy policy and the store privacy declarations that it requires.

## D-2026-11-13-04 The app language row returns to Settings

- Decision: Settings, General has an App language row again, with Match device
  as the default.
- Why: the founder's call, "yes to all", to the question "Keep following the
  phone, or bring it back". ChatGPT and Perplexity both show such a row in his
  screenshots (IMG_1215 and IMG_1323).
- Amends: the display language part of `D-2026-09-27-02`, which said the mobile
  apps follow the device as ChatGPT and Claude do. Text size and reduced motion
  still follow the device.
- Limit: the picker offers only the languages the app ships as reviewed.

## D-2026-11-13-05 The side panel shows a short list and folds the rest

- Decision: the symbol and search are the first row of the mobile side panel
  and the Local and Cloud switch sits directly under them. Then come New chat
  and a short list of
  destinations: Projects and Library, and in Cloud also Code and Schedules. The
  other destinations (Work, Published sites, Agents, Reports) are Cloud only and
  open from a More row that unfolds in place, folds again from the same row and
  remembers its state. Remote was among them until `D-2026-11-13-06` moved it
  into Code the same day. Where fewer than two destinations would be
  folded, they are shown and there is no More row.
- Local shows only what works on the phone with no account. Remote is Cloud
  only because pairing a computer needs a signed-in account and travels through
  the relay, so in Local it is not in search and not in Settings; a pairing
  link still opens it. Which destination is Cloud only is
  owned by `apps/mobile/src/features/shell/destinationScope.ts`, which the side
  panel, search and the coding settings page read; a destination nobody has
  classified is treated as Cloud, and the tests fail until it is classified. The Projects section folds from its heading, pinned
  chats have their own heading above Recents, and the choice between one list
  and by project moved from the header to the Recents heading. Settings is the
  only row at the bottom.
- Removed from the side panel: Help and About, Notifications, Usage remaining,
  the workspace switch, the Chats row and the Cloud tag on rows. Each is still
  reached from Settings: Help Center and About, Notification preferences (which
  now link to the list of recent notifications), Usage and Workspace. See all
  chats stays under Recents.
- Why: the founder's call, in his words "you also need to learn how to collapse
  in the side bar of more options, we need to change the UX and UI of the
  sidebar, check the sidebars of the competitors" and "i dont think Help &
  About, Notifications, Usage is needed outside of settings, also we can simply
  keep the Local | Cloud on very top and stripe down unnecessary things". The
  first build put the switch above the symbol; on seeing it he corrected the
  order the same day: "no no no, the logo should be on the top". Seeing Remote
  in the Local list he then asked "i dont get it why there is remote in local
  mode?"; taking it out of the Local list is the answer to that question, not
  an instruction he gave in those words. The first answer removed only the side
  panel row and left Remote in Local search and Settings; he replied "why are
  you not using your brain?", and the rule above is the agent's reading of
  that.
- Reference: ChatGPT shows a short list whose Explore row opens the rest in
  place, a hairline, then chats with See all (IMG_1140, IMG_1141), and Pinned
  and Recents headings (IMG_1197). Gemini ends its list with a More row
  (IMG_1347). Perplexity folds Projects from a chevron on the heading and puts
  the list filter beside the Sessions heading (IMG_1311). None of the three
  shows help, notifications or usage rows in the panel list.
- Amends: `D-2026-11-12-01` (the side panel carries navigation only), which
  this narrows further, and the placement in `D-2026-11-10-02`; the switch
  still spans the panel's width in two equal halves. New chat stays a row with
  its name, and Customize stays in Settings, as decided on 2026-11-12.
- Kept though not asked about: an Upgrade button beside Settings for a Free
  account, shown only once in-app purchases are switched on, so it does not
  appear in version 1.
- Unknown: the pictures do not show how ChatGPT's list closes again.

## D-2026-11-13-06 Code is one list, and a session on the computer reads as a conversation

- Decision: on the phone, Code holds everything about coding in one place. It
  opens with a Devices section (the paired computer, the account's other
  computers, and Add device while no computer is paired) and then one Sessions
  list that mixes Cloud sessions with the sessions running on the paired
  computer, newest first, each row marked with where it runs. Remote is no
  longer a destination in the side panel or in search; the pairing page still
  exists and opens from a device row, from Add device and from a pairing link.
  New session offers the cloud or the paired computer.
- Decision: a session on the computer opens as a conversation, like a Cloud
  session: the user's messages as bubbles, the reply as text, the steps of a
  turn folded into one line above its reply, the thinking in a row that
  unfolds, approvals and questions as cards, a pill for changed files and test
  results above a pinned message box, and Stop in the send slot while a turn
  runs. A question with choices is answered on the phone.
- Decision: the computer sends what that needs. The remote code protocol gained
  the turn each step and message belongs to, the thinking text, the choices of
  a question, an answer request, the number of running sub-tasks and the text
  of a message the phone sent. The fields are optional and the protocol version
  is unchanged, so an older Desktop still works and its questions keep the line
  "Answer on your computer".
- Decision: a table in a message is shown whole. It takes the width of the
  message and wraps its text inside the cells without splitting a word; it
  scrolls sideways only when its columns cannot all keep their longest word.
  On the phone it has no outer box and no vertical lines. The same rule holds
  in the web renderer, which a phone browser, the Desktop app and the two
  browser and editor extensions share: a column is never narrower than its
  longest word, and only a token too long to keep whole (a link, a path, a
  hash) may break.
- Why: the founder's calls of 2026-11-13. To the question "Build Code the way
  Claude does it: one list and a chat-style session?" he answered "Phone and
  desktop". On tables he wrote "you need update the table rendering in mobile so
  that it does not look like half cut", and after seeing the result "even if we
  open in mobile browser everything should render properly". The reference for
  the session screen was five pictures of the Claude iPhone app he sent that
  day; they are not in the screenshot folder, so the research record does not
  describe them.
- Amends: the Remote placement in `D-2026-11-13-05`. The rule that Local shows
  only what works with no account is unchanged, and Code stays Cloud only.
- Kept from the security review of pairing: no path reaches the camera before
  the pairing page has shown what the computer needs and what pairing allows.
  Add device therefore opens the pairing page, not the scanner. The pairing
  instructions on the computer name the same path, from
  `MOBILE_CODE_SCREEN_LABEL` and `MOBILE_ADD_DEVICE_LABEL` in
  `packages/contracts/types/src/pairing.ts`.
- Limit: the thinking text reaches the phone only from model routes that send
  it. A photo or file cannot be added to a session on the computer from the
  phone, because one relay message is too small to carry it. A phone holds one
  pairing at a time, so Add device is not offered while a pairing is live.
- Not decided here: the work on the Desktop app itself (what it lacks against
  the Claude desktop app, a browser pane and an iOS Simulator pane) runs in its
  own session and branch, as he asked: "all the desktop work do it in another
  session instead". Importing sign-in cookies from another browser is held
  until he says so.

## D-2026-11-13-07 Every screen of the web app follows one set of phone rules

- Decision: below 768 pixels of width the web app follows the rules below on
  every screen, signed in or public. Nothing changes at 768 pixels and above.
  - The page never scrolls sideways, and content keeps a 16 pixel gutter on
    each side.
  - No text is smaller than 12 pixels. A field a person types in is 16 pixels
    on a touch screen, so the browser does not zoom the page.
  - The label of a button or a tab stays on one line.
  - A button that is only an icon has a touch area of 44 by 44 pixels. A
    switch, a checkbox and a radio button keep their shape and get the touch
    area around them.
  - No field takes focus when a screen opens on a touch screen, so the keyboard
    does not cover the screen unasked. The sign-in screen is the exception:
    typing is the only thing to do there.
  - A dialog that would nearly fill the screen fills it, with its title and a
    44 pixel close button in a 48 pixel row. Settings is such a dialog.
  - Every signed-in screen has the 48 pixel app header with the navigation
    button on the left. A focused screen (Upgrade, Invoices, the workspace
    console) has a Back control of at least 44 pixels instead.
  - The message box sits at the bottom edge with at most two rows of controls,
    on Chat and on Code.
  - A list page has one title style: 28 pixels, medium weight, 24 pixels under
    the header.
- Decision: the rules are held by a check, not by review.
  `apps/web/e2e/phone-layout-rules.spec.ts` opens every screen in a touch phone
  390 and 320 pixels wide, measures each rule, and plants one fault of each
  kind to prove it can see them.
- Why: the founder's call of 2026-11-13. He sent back pictures of the Code home
  and of Shared links in Settings at both widths and wrote "fix all these
  screens, composer, text size, position, everything, check every screen and
  fix it."
- Cause, so it is not repeated: one global rule gave every button a minimum
  height of 40 pixels at narrow widths, which stretched switches, colour dots
  and round icon buttons out of shape. A control whose shape is its meaning is
  now left out of that rule.
- Limit: the check runs in Chromium with touch emulation. Safari on an iPhone
  has not been used.

## D-2026-11-13-08 An explanation under an option is one short line

- Decision: the line under an option, a switch, a choice, a field, a card, a
  menu row, a page title or an empty state is one short line that says what it
  does for the person. When the label already says it, there is no explanation.
  This holds in Settings and on every page of the web app, and in the phone
  app.
- Decision: on the web that line is 12 pixels, the smallest size
  `D-2026-11-13-07` allows, so every explanation under an option has one size.
  The intro under a page title keeps its size.
- Kept: a fact a person must know before acting stays in the line, shortened
  around: that something cannot be undone, what is billed, who can see
  something, what leaves the device. A confirmation still names its
  consequence, and error messages are unchanged.
- Left as written: the two model improvement switches and the marketing email
  consent, which wait for a lawyer (`D-2026-11-13-03`); billing, subscription
  and pairing notices; legal pages; and every sentence a support article, a
  privacy claim or the public page's picture of the app is checked against.
- The three approval choices keep their full statement in Settings on both
  surfaces, shortened in its owner,
  `packages/contracts/types/src/tool-approval-policy.ts`. Skip approvals still
  says what stops and asks.
- Why: the founder's calls of 2026-11-13: "also fix/reduce/make it short/etc
  overly written descriptions(explaination) for options" and "also decrease the
  size of the text of those explanations under options as well". It follows his
  standing direction that copy is one line.
- Limit: the phone app's explanations keep their 14 point size. That is the
  app's minimum, held by `apps/mobile/__tests__/mobile-shell-chrome.test.ts`
  from his rule against small text, and lowering it is his call. Spanish, the
  one other language a person can choose, was shortened where the text comes
  from a catalogue; the other ten catalogues keep the longer text until they
  can be chosen.
