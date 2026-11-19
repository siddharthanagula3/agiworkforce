# Founder decisions, 2026-11-10

Status: Current
Owner: Founder, recorded by the mobile release work
Last updated: 2026-11-10

The founder's mobile decisions of 2026-11-10, in the shape of
`2026-09-15-founder-decisions.md`. The first two were made on first seeing the
signed-in Cloud screen of the mobile app on a device, the third on seeing the
result and extended the same day to the launch and onboarding screens.

## D-2026-11-10-01 A new chat on mobile is an empty screen

- Decision: an empty conversation in the mobile app shows the logo symbol, the
  greeting and the composer, and nothing else that explains or suggests. The
  serif wordmark, the line describing the mode, the Work example tasks and the
  connected-source notice are removed from that screen, in Chat and in Work, in
  Local and in Cloud.
- Why: the founder's call, in his words "i like empty chat screen instead of all
  the clutter". Asked what should sit in the middle, he chose the symbol with
  the greeting over the greeting alone, a blank screen, or the serif wordmark.
- Kept, because each is a step the user needs rather than an explanation: the
  download-a-model prompt in Local Mode when no model is ready, and the line
  naming the workspace a new Cloud chat will belong to when the account has one.
- Follow-through: the request-scoped connector boundary recorded in `GAP-048`
  of `audit/registers/ui-gaps.csv` is unchanged, since nothing scans a connected
  service in the background, but the mobile app no longer states it on screen.
  Cells (mobile): S12.21.

## D-2026-11-10-02 Local and Cloud are switched from the side panel only

- Decision: the mobile new-chat header carries no Local/Cloud switch. The side
  panel is the one place to change mode, and its switch spans the panel's width
  in two equal halves. The Chat/Work switch takes the centre of the header.
- Why: the founder's call, in his words "remove local and cloud toggle on the
  top because it is there in the side panel".
- Amended by `D-2026-11-12-02`: Settings carries the same switch, so the side
  panel is no longer the only place to change mode.
- Follow-through: the composer still shows where a message goes, so the active
  mode stays visible on the chat screen without the switch. Switching from the
  side panel closes it and opens a new chat in the chosen mode.
  Cells (mobile): S5.02, S84.12.

## D-2026-11-10-03 The mobile logo is the symbol alone, with no serif wordmark

- Decision: the mobile side panel, the launch screen and the first onboarding
  screen show the logo symbol with no "AGI" wordmark beside it. The launch
  screen uses the same symbol image in light and dark, and the onboarding
  symbol is drawn at the launch image's size.
- Why: the founder's call. For the side panel he chose the symbol over the same
  letters in the sans-serif face and over leaving the wordmark; asked whether
  the launch and onboarding screens should follow, he said to do both. It
  follows his standing preference against serif headlines and the symbol-only
  logo already used on the public pages.
- Follow-through: the onboarding tagline is now that screen's heading, and the
  symbol there carries the brand name for screen readers. Nothing in the mobile
  app sets type in the serif face any more, so the app no longer loads it and
  the launch screen no longer waits for it.
- Not covered: the Cloud sign-in screen still shows a small symbol with "AGI"
  in the sans-serif face beside it.
