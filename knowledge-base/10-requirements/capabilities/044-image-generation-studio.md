---
id: "REQ-AREA-044"
type: "requirements"
title: "Requirement items: Image-generation studio"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 44. Image-generation studio

36 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S44.01

**Text-to-image composer.** User enters an image mode, types a prompt, and gets a generated image back in the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-01 Make an image from a prompt](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Competitor trace: CAP-images-and-video-09, CAP-images-and-video-25

## S44.02

**Image-model picker.** User picks which image model generates the image, from models the deployment can run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-01 Make an image from a prompt](../../20-features/044-image-generation-studio/F044-01-make-an-image-from-a-prompt.md)
- Competitor trace: CAP-images-and-video-09

## S44.03

**Style presets.** User picks a style preset (photo, illustration, etc.) that changes the generated look.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-02 Image settings: style, shape and count](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Competitor trace: CAP-images-and-video-10

## S44.04

**Reference-image slots.** User attaches one or more reference images in dedicated slots that guide the generation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F044-03 Reference images and edits](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)
- Competitor trace: CAP-images-and-video-11

## S44.05

**Prompt suggestions.** Image mode offers example or suggested prompts the user can pick.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-04 Prompt help](../../20-features/044-image-generation-studio/F044-04-prompt-help.md)
- Competitor trace: CAP-images-and-video-10

## S44.06

**Prompt enhancement with user control.** User can have the product rewrite/enhance the image prompt and review or reject the rewrite before generating.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing, Chrome missing
- Feature: [F044-04 Prompt help](../../20-features/044-image-generation-studio/F044-04-prompt-help.md)
- Competitor trace: CAP-images-and-video-10

## S44.07

**Aspect-ratio selector.** User picks the aspect ratio of the generated image from ratios the model supports.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-02 Image settings: style, shape and count](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Competitor trace: CAP-images-and-video-09, CAP-images-and-video-10

## S44.08

**Size/resolution selector.** User picks the output size or resolution of the image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F044-02 Image settings: style, shape and count](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Competitor trace: CAP-images-and-video-10

## S44.09

**Quality selector.** User picks a quality level (standard/HD) for the image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F044-02 Image settings: style, shape and count](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Competitor trace: CAP-images-and-video-10

## S44.10

**Output-count selector.** User picks how many images to generate and sees all of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F044-02 Image settings: style, shape and count](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Competitor trace: CAP-images-and-video-10

## S44.11

**Background transparency option.** User asks for a transparent background on the generated image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-02 Image settings: style, shape and count](../../20-features/044-image-generation-studio/F044-02-image-settings-style-shape-and-count.md)
- Competitor trace: CAP-images-and-video-09, CAP-images-and-video-10

## S44.12

**Supported seed control.** User sets a seed (on models that support it) to reproduce an image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-05 Repeatable results: seed and negative prompt](../../20-features/044-image-generation-studio/F044-05-repeatable-results-seed-and-negative-prompt.md)
- Competitor trace: CAP-images-and-video-10

## S44.13

**Supported negative-prompt control.** User enters a negative prompt (what to avoid) on models that support it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F044-05 Repeatable results: seed and negative prompt](../../20-features/044-image-generation-studio/F044-05-repeatable-results-seed-and-negative-prompt.md)

## S44.14

**Generation-cost indication.** Before or after generating, the user sees what the image costs (credits or money).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F044-06 Cost and allowance](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md)
- Competitor trace: CAP-images-and-video-18

## S44.15

**Remaining-generation allowance.** User sees how many image generations remain in their allowance before hitting a limit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F044-06 Cost and allowance](../../20-features/044-image-generation-studio/F044-06-cost-and-allowance.md)
- Competitor trace: CAP-images-and-video-18

## S44.16

**Generation queue.** User can queue several image generations and see their status in a queue view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F044-07 Progress, cancel and retry](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)

## S44.17

**In-progress previews where supported.** While generating, partial/preview images appear before the final one (where the model supports it).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-07 Progress, cancel and retry](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)

## S44.18

**Cancel generation.** User stops an image generation in progress and the job is cancelled (not billed further).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-07 Progress, cancel and retry](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Competitor trace: CAP-images-and-video-09

## S44.19

**Retry generation.** After a failed or stopped generation, user retries it in place with the same prompt.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-07 Progress, cancel and retry](../../20-features/044-image-generation-studio/F044-07-progress-cancel-and-retry.md)
- Competitor trace: CAP-images-and-video-09

## S44.20

**Variation generation.** User asks for variations of a generated image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-08 Variations, remix and reuse](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)

## S44.21

**Image grid.** Generated images are browsable together in a grid.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome missing
- Feature: [F044-09 Library: grid and save](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Competitor trace: CAP-images-and-video-14

## S44.22

**Full-screen image viewer.** User opens a generated image in a full-screen viewer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-10 Viewer and details](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md)
- Competitor trace: CAP-images-and-video-14

## S44.23

**Prompt and settings inspection.** User can see the prompt and generation settings (model, ratio, size, quality) used for an image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-10 Viewer and details](../../20-features/044-image-generation-studio/F044-10-viewer-and-details.md)

## S44.24

**Reuse prompt.** User reuses the prompt of an earlier image in one action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, Chrome missing
- Feature: [F044-08 Variations, remix and reuse](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)

## S44.25

**Reuse settings.** User regenerates with the same settings (model, ratio) as an earlier image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-08 Variations, remix and reuse](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)

## S44.26

**Favorite image.** User marks a generated image as a favorite and can find favorites later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-09 Library: grid and save](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Competitor trace: CAP-images-and-video-14

## S44.27

**Save to Library.** Generated images are saved to the user's Library and reappear there later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-09 Library: grid and save](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Competitor trace: CAP-images-and-video-14

## S44.28

**Add to Project.** User adds a generated image to a Project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-09 Library: grid and save](../../20-features/044-image-generation-studio/F044-09-library-grid-and-save.md)
- Competitor trace: CAP-images-and-video-14

## S44.29

**Download full-quality image.** User downloads the generated image at full quality.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-11 Save, download, copy and share](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Competitor trace: CAP-images-and-video-14

## S44.30

**Copy image.** User copies the image itself to the clipboard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F044-11 Save, download, copy and share](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Competitor trace: CAP-images-and-video-14

## S44.31

**Share image.** User shares a generated image with someone else (link or file to another app).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F044-11 Save, download, copy and share](../../20-features/044-image-generation-studio/F044-11-save-download-copy-and-share.md)
- Competitor trace: CAP-images-and-video-14

## S44.32

**Share prompt.** User shares or copies the prompt of a generated image as a reusable recipe.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F044-08 Variations, remix and reuse](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Competitor trace: CAP-images-and-video-15

## S44.33

**Edit image.** User edits a generated or uploaded image by describing the change, and the source pixels are edited.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F044-03 Reference images and edits](../../20-features/044-image-generation-studio/F044-03-reference-images-and-edits.md)

## S44.34

**Animate image into video.** User turns a generated image into a video (image-to-video).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F044-08 Variations, remix and reuse](../../20-features/044-image-generation-studio/F044-08-variations-remix-and-reuse.md)
- Competitor trace: CAP-images-and-video-21

## S44.35

**Report generated output.** User reports a generated image as harmful or wrong to trust and safety.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F044-12 Safety, reporting and AI labels](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Competitor trace: CAP-images-and-video-17

## S44.36

**Content/provenance labeling.** Generated images are labelled as AI-generated (visibly and in machine-readable provenance).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F044-12 Safety, reporting and AI labels](../../20-features/044-image-generation-studio/F044-12-safety-reporting-and-ai-labels.md)
- Competitor trace: CAP-images-and-video-16
