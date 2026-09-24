# Leader observation, 2026-09-13

Status: Historical snapshot
Owner: Repository maintainers
Last updated: 2026-09-13

Superseded for current competitor behavior on 2026-09-21 by
`chatgpt-claude-ecosystem-delta-2026-09-21.md`. This remains a dated UI
observation rather than a current architecture requirement.

Observed live through the reference browser on 2026-09-13, signed in, at 1336
wide. This note records only what differs from or sharpens the 2026-09-04
reference; that document remains the baseline for measurements.

## claude.ai

- Sidebar primary destinations, in order: New, Projects, Artifacts, Scheduled,
  Customize. Below them a Projects list with an add control, then one merged
  "Chats and tasks" list with a filter control, then Design pinned above the
  account row. The account row carries download, search and collapse icons.
- The home composer carries a plus control, a Chat and Cowork segmented toggle
  inside the composer, the model name with its effort label as plain text, and
  a microphone with a caret. Auto is shown as a plain word under the composer
  on a Cowork session.
- A Cowork session has a right rail with Progress, Outputs (with a count),
  Context, and Suggested connectors. Deliverables render as cards inside the
  transcript with a type line (Document, PDF; Presentation, PPTX; Document,
  MD) and a Download control, and the same files list in the Outputs rail.
- The assistant action row on a finished turn is four icons: copy, read aloud,
  thumbs up, thumbs down. Model identity is not shown on the turn.
- A banner above the composer states that automatic approval is on and that
  the session pauses if anything looks unsafe, with a dismiss control.

## chatgpt.com

- The sidebar collapses to an icon rail: new chat, work, search, and a chat
  icon, with the account avatar at the bottom.
- A Chat and Work segmented control sits at the top of the page, outside the
  composer. In Work mode the placeholder reads "Work on anything".
- The composer carries a plus control, the model name with its effort label
  and a caret, a microphone and a send button, and a second row with Project,
  Files, Plugins (connector avatars) and an "Open desktop app" link.
- Under the composer, suggested work items list with the source app's icon
  (mail items, a scheduled watch item).

## Implications for AGI Workforce

- AGI Work sessions need an outputs rail and deliverable cards with a type
  line and download, which the transcript alone does not give today.
- Chat versus Work mode belongs on a segmented control; the composer already
  has one, and the home page should match.
- A per-turn model chip is an AGI Workforce addition, justified by the
  multi-model differentiator; neither leader shows one.
- Both leaders make Projects, Files and connectors reachable from the composer
  row on the home page, not only from the plus menu.
