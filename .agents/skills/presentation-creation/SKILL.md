---
name: presentation-creation
description: Create clear PowerPoint presentations with a coherent narrative and concise slides.
version: 1.0.0
requires:
  tools: [create_office_file]
---

# Presentation creation

Use this skill when the user needs a `.pptx` deliverable.

1. Identify the audience, presentation goal, expected duration, and decision or action requested.
2. Form a narrative with an opening, evidence-backed middle, and explicit conclusion.
3. Give each slide one main idea and a descriptive title.
4. Keep body text concise; use tables or charts only when they clarify a real relationship.
5. Create the presentation with `create_office_file`; do not claim a file exists until the tool succeeds.
6. Check the returned file metadata and summarize the deck, including any content or visual limitations.

Do not fabricate metrics, citations, customer quotes, branding assets, or speaker credentials.
