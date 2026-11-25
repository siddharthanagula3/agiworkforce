---
id: "REQ-AREA-043"
type: "requirements"
title: "Requirement items: Image and visual understanding"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 43. Image and visual understanding

20 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S43.01

**Single-image questions.** User attaches one image and asks a question about it; the image reaches a vision-capable model with the question.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-01 Ask a question about one or more attached images](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Competitor trace: CAP-images-and-video-01, CAP-images-and-video-25

## S43.02

**Multiple-image comparison.** User attaches two or more images to one message and the model receives all of them to compare.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-01 Ask a question about one or more attached images](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Competitor trace: CAP-images-and-video-01

## S43.03

**Screenshot interpretation.** User shares a screenshot (captured or pasted) and the model explains what it shows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-01 Ask a question about one or more attached images](../../20-features/043-image-and-visual-understanding/F043-01-ask-a-question-about-one-or-more-attached-images.md)
- Competitor trace: CAP-images-and-video-01

## S43.04

**Document-image interpretation.** User attaches a photo or scan of a document (incl. a scanned PDF) and the model reads and explains it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-02 Read documents, charts, diagrams and handwriting in an image](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Competitor trace: CAP-images-and-video-05

## S43.05

**Chart interpretation.** User attaches a chart image and the model interprets its data and trends.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-02 Read documents, charts, diagrams and handwriting in an image](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Competitor trace: CAP-images-and-video-05

## S43.06

**Diagram interpretation.** User attaches a diagram image and the model explains its structure.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-02 Read documents, charts, diagrams and handwriting in an image](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Competitor trace: CAP-images-and-video-05

## S43.07

**Handwriting recognition.** User attaches handwritten notes and the model transcribes or answers about them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-02 Read documents, charts, diagrams and handwriting in an image](../../20-features/043-image-and-visual-understanding/F043-02-read-documents-charts-diagrams-and-handwriting-in.md)
- Competitor trace: CAP-images-and-video-05

## S43.08

**Visual text extraction.** User extracts the text in an image (OCR) and can copy or reuse it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F043-04 Copy text out of an image (OCR, on mobile)](../../20-features/043-image-and-visual-understanding/F043-04-copy-text-out-of-an-image-ocr-on-mobile.md)
- Competitor trace: CAP-images-and-video-05

## S43.09

**Image-region selection.** User selects a region of an image so the question applies only to that area.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F043-08 Image region, crop and annotated answers (not built)](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)
- Competitor trace: CAP-images-and-video-07

## S43.10

**Crop-and-zoom inspection.** User can zoom into, or crop, part of an image to inspect detail (and ask about the crop).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F043-08 Image region, crop and annotated answers (not built)](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)

## S43.11

**Annotated visual answers.** The answer returns the image with marks (boxes, arrows, labels) showing what it refers to.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F043-08 Image region, crop and annotated answers (not built)](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)

## S43.12

**Object counting.** User asks how many of something appear in an image and the vision model answers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-03 Read the scene, troubleshoot from a photo and count objects](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Competitor trace: CAP-images-and-video-01

## S43.13

**Scene comparison.** User attaches two scenes and the model describes the differences between them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-03 Read the scene, troubleshoot from a photo and count objects](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Competitor trace: CAP-images-and-video-01

## S43.14

**Visual troubleshooting.** User shares a photo or screenshot of a problem (device, error, setup) and gets troubleshooting steps.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome done
- Feature: [F043-03 Read the scene, troubleshoot from a photo and count objects](../../20-features/043-image-and-visual-understanding/F043-03-read-the-scene-troubleshoot-from-a-photo-and-count.md)
- Competitor trace: CAP-images-and-video-01

## S43.15

**Image-to-structured-data extraction.** User turns an image (receipt, form, card) into structured fields (JSON/CSV/rows) they can reuse.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F043-05 Turn an image into structured data (API)](../../20-features/043-image-and-visual-understanding/F043-05-turn-an-image-into-structured-data-api.md)

## S43.16

**Image-to-table workflow.** User turns a table in an image into an editable table or spreadsheet in a guided step.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F043-08 Image region, crop and annotated answers (not built)](../../20-features/043-image-and-visual-understanding/F043-08-image-region-crop-and-annotated-answers-not-built.md)

## S43.17

**Reference-image selection for another task.** User picks an existing image (upload, library item or earlier output) as the reference input for a generation or edit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F043-06 Use an existing image as the reference for a new task](../../20-features/043-image-and-visual-understanding/F043-06-use-an-existing-image-as-the-reference-for-a-new-t.md)
- Competitor trace: CAP-images-and-video-11

## S43.18

**High-resolution versus reduced-resolution handling.** Images are processed at a resolution suited to the task, with a high-detail vs reduced-detail choice honoured end to end.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, Chrome missing
- Feature: [F043-07 Choose how much detail the model sees](../../20-features/043-image-and-visual-understanding/F043-07-choose-how-much-detail-the-model-sees.md)
- Competitor trace: CAP-images-and-video-02

## S43.19

**Image input-quality warning.** Before answering, the product warns when an input image is too small, blurry or low quality to read reliably.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F043-09 Quality warnings and uncertainty flags (not built)](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Competitor trace: CAP-images-and-video-06

## S43.20

**Visual uncertainty presentation.** Answers about images visibly flag uncertain readings (low-confidence text, ambiguous objects).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F043-09 Quality warnings and uncertainty flags (not built)](../../20-features/043-image-and-visual-understanding/F043-09-quality-warnings-and-uncertainty-flags-not-built.md)
- Competitor trace: CAP-images-and-video-06
