# Founder decisions, 2026-11-12

Status: Current
Owner: Founder, recorded by the mobile parity work
Last updated: 2026-11-13

The founder's mobile decisions of 2026-11-12, in the shape of
`2026-11-10-founder-decisions.md`. They were made after he compared the mobile
app with his own screenshots of the ChatGPT, Claude, Perplexity and Gemini
iPhone apps.

## D-2026-11-12-01 The mobile side panel carries navigation only

- Decision: the side panel drops the Voice, Camera, Scan and Compare shortcut
  row and the profile button. New chat is a row that shows its name beside the
  symbol. Customize leaves the side panel and is reached from Settings.
- Why: the founder's call, in his words "so many unnecessary things in the
  sidebar like voice, camera, profile", "new chat should definitely have New
  Chat beside that symbol" and "customize should be adjusted somewhere else".
  Of the shortcut row he said it is "not needed".
- Follow-through: voice stays on the composer, the camera on the add menu, and
  Compare on the chat screen. The standalone Camera and Scan screens are still
  opened by the home-screen widget and the Siri shortcuts. The profile screen is
  opened from the top of Settings. Customize is the first row of the Cloud
  section in Settings, shown only in Cloud.
- Amended by `D-2026-11-13-05`: the panel now leads with the Local and Cloud
  switch, shows a short list and folds the rest under More, and no longer
  carries Help and About, Notifications, Usage or the workspace switch.

## D-2026-11-12-02 Settings carries the Local and Cloud switch

- Decision: Settings shows the same Local and Cloud switch as the side panel.
  In Local it lists the device and assistant settings; in Cloud it adds the
  Account and Cloud sections. Log out stays in both.
- Why: the founder's call, in his words "in settings also we need a toggle for
  local and cloud settings".
- Amends: `D-2026-11-10-02`. The side panel is no longer the only place to
  change mode; the new-chat header still carries no switch.
- Follow-through: the switch changes the app's mode, so every settings page
  opened from it edits the chosen mode. An open conversation keeps the mode it
  was started in. Tapping Cloud while signed out opens sign-in, as it does in
  the side panel.

## D-2026-11-12-03 The Cloud add menu keeps every function on one screen

- Decision: the add menu on the composer keeps everything mobile needs and takes
  its shape from the leaders' add menus in the founder's screenshots.
- Why: the founder's call, in his words the add menu "is also not right", "i was
  talking about the + menu in cloud mode", and "we need to keep everything which
  is needed for mobile, take reference from pictures".
- Reference: his folder holds the Claude and Gemini add menus and no ChatGPT
  one. Both fit one screen, use one row for each tool and carry no section
  captions; Claude's rows are single lines in grouped cards.
- Follow-through: the sheet is as tall as its content and its title bar stays in
  place while the rows scroll. Rows are single lines in two cards: Create image,
  Create video, Create file, Web search, Deep research and Study and learn;
  Project, Connectors, Skills and Choose style. The three file types open under
  Create file, and each connected app's switch opens under Connectors with a
  link to manage them. The upload note stays under the attachment tiles. The
  model row left the menu under `D-2026-11-12-04`; no other function did.

## D-2026-11-12-04 The model picker sits on the composer

- Decision: the model is chosen from the composer, not from the add menu.
- Why: the founder's call. Asked "Move the model picker out of the + menu onto
  the composer?" he answered "Move it". In his screenshots Claude and Perplexity
  show the model on the composer's controls row and Gemini in the header; none
  keeps it in the add menu.
- Amends: the 2026-08-07 placement of the model row at the top of the add menu.
  The 2026-07-29 rejection of a chip row above the composer stands.
- Follow-through: the composer rests as a card, the shape ChatGPT, Claude and
  Perplexity share in his screenshots: the message on top, and one row beneath
  it with the add button, the model name, the reasoning effort button
  (`D-2026-11-12-08`), the microphone and the send or voice button. Tapping the
  model name opens the model picker. The name was on that row before, but only once the message
  wrapped onto a second line. While dictating, the composer is still the single
  row of cancel, waveform, stop and send. In image or video mode the row shows
  no model name, because the chip above the composer names the media model.

## D-2026-11-12-05 The model picker shows one model for each provider and no descriptions

- Decision: a model row carries its name and nothing else. Each provider has one
  row, showing the model in use (or its everyday model), with a control that
  opens the rest of that provider's models under it.
- Why: the founder's call, in his words "dont keep to much descriptions in model
  selector take the reference of perplexity" and "we can show the logo and a
  model selected with dropdown symbol so that they can change the model".
- Reference: Perplexity's Models sheet in his screenshots has one description
  line, on its first row, and none on the model rows
  (`docs/research/mobile-layout-2026-11-12/perplexity.md`, screen 5).
- Follow-through: Auto keeps its one line, because it is a choice and not a
  model. Recent and Favorites stay above the provider rows. Searching lists
  every match flat, with no provider rows. On-device models keep their file size
  because that is what a person needs before downloading one.

## D-2026-11-12-06 Provider logos return to the model picker

- Decision: a model row shows its provider's logo in place of the provider's
  name.
- Why: the founder's call, in his words "instead of Claude use symbol(logo),
  instead of GPT use symbol(logo)". He repeated it after being told what O6
  decided.
- Amends: owner decision O6 of 2026-10-19 in
  `docs/compliance/mobile-store-feature-justification.md` (text names instead of
  provider logos).
- Follow-through: the marks are copied into
  `apps/mobile/assets/provider-marks.json` by
  `apps/mobile/scripts/vendor-provider-marks.mjs`, from the same sources the web
  picker draws from, and a test fails when the two drift. A provider with no
  mark keeps the generic symbol and its name in words. A row inside an opened
  provider shows no mark, because the row above it already does.
- Open before store submission: check each brand's own guidelines for the marks
  shown (row B2 of the compliance file). Nothing has been submitted with logos.

## D-2026-11-12-07 Filters replace the Instant, Best and Economy choices on mobile

- Decision: Auto is the only routing choice in the mobile picker. Instant,
  Economy, Images and Files are filters, each a symbol with its word, that
  narrow the list to the models that fit. Under Instant each model is listed at
  its lowest reasoning effort and is picked that way.
- Why: the founder's call, in his words "keep only Auto, remove Best, use
  instant(thunderbolt), Economy($), vision(eye), file input modaility(file
  symbol), etc as filters with symbols, we dont have to route every thing and
  take responsibilities we can just make that filter that gives those models".
- Follow-through: every filter reads the model catalogue, so no list of models
  is written into the app: Instant is the models the catalogue marks fastest,
  Economy the economy tier, Images the models that read images, Files the models
  that read documents. Turning on two filters keeps the models that fit both.
  Filters are not offered for on-device models. The mobile app no longer sends a
  routing choice with a message; Auto routes as it did.
- Deviation: web and desktop still offer Instant, Best and Economy under Auto.
  They are not changed by this decision.
- Open: his example for Instant was the smallest model of the current GPT line
  with reasoning off. The catalogue does not mark that model fastest today, so
  it is not under Instant. Changing that is a catalogue change, not an app
  change.

## D-2026-11-12-08 Reasoning effort is set on the composer

- Decision: the composer carries a reasoning effort button beside the
  microphone. Tapping it turns the composer into a slider, with the level's name
  above it, the way ChatGPT does it in his screenshots. The add button has no
  circle around it, the voice and send circle is smaller, and the text sizes on
  the composer are even.
- Why: the founder's call, in his words "effort also like chatgpt, and i think
  we need to reduce the size eof circle around and balance the word size in the
  composer".
- Amends: `D-2026-11-12-04`. The composer's model name no longer carries the
  effort, and the model picker opened from the composer no longer shows an
  effort control.
- Reference: ChatGPT's slider measures 340 by 70 points with a 48 point handle
  and 12 point dots, and its voice circle 34.7 points
  (`docs/research/mobile-layout-2026-11-12/chatgpt-part-1.md`, screens 1 and 2).
- Follow-through: tapping a stop or dragging sets the level, and a tick button
  closes the slider. The voice and send circles are 36 points inside a 44 point
  touch area. The button appears only in Cloud, in text mode, for a model with
  more than one level. The level is kept for the conversation, or as the default
  before a conversation exists. The dictation controls keep their 44 point
  circles.
- Amended 2026-11-13, the founder's calls. The slider's bar is as tall as the
  tick circle beside it, 36 points, in his words "reduce the width of reasoning
  bar same size as circle of tick mark"; its handle is 28 points, its dots are
  8 points, and each stop keeps a 44 point touch area. The needle on the effort
  button turns with the level: flat to the left at the lowest level, flat to the
  right at the highest, and evenly spaced between, in his words "if it is None
  the line should be at 0, if it is Max it should be 180".
- Deviation: ChatGPT's bar is 70 points tall with a 48 point handle. Ours is
  slimmer by the founder's call.

## D-2026-11-12-09 The leaders' layouts and ours are measured and kept

- Decision: the placement, style, position and text size of every screen in his
  reference set, and of the same parts of our app, are written down in
  `docs/research/mobile-layout-2026-11-12/`.
- Why: the founder's call, in his words "write down the placements, style,
  position, text size, document everything in the layout in markdown files so
  that everything is compared properly".
- Follow-through: one file for each app, an index that states the method and its
  limits, and `comparison.md` with one table for each shared part. The measuring
  tool is `apps/mobile/scripts/measure-screenshot.mjs`. Personal content in the
  screenshots is replaced by placeholders.
- Open: text in his screenshots reads about two points above the iPhone
  default. That is what a larger Text Size setting on the phone produces, and a
  screenshot cannot prove it. Until he confirms the setting, no text size in our
  app is changed to match those readings.
