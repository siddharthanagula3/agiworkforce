---
id: "PLAN-cli-044"
type: "test-plan"
title: "CLI · 44. Image-generation studio"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "44"
---
# CLI · 44. Image-generation studio

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S44.01 Text-to-image composer.

- **Expected:** User enters an image mode, types a prompt, and gets a generated image back in the conversation.
- **Code:** done. Evidence moved: apps/web/app/api/media/image/generate/route.ts:177 (quoted code not found in the file now)
- **Where to find it:** Type /image a red bicycle in the interactive app (run agi, then type it). In a terminal: agi image "a red bicycle" (labels found in the code)
- **Needs:** a Managed Cloud account (the /image command is hidden in Local and BYOK mode)
- **Steps:**
  1. Sign in with a Managed Cloud account and start the app with agi.
  2. Type /image a red bicycle and press Enter.
  3. Wait for the reply. Look for a Saved line with a file path, the line AI-generated with, and a chip that says /image open to view.

## S44.02 Image-model picker.

- **Expected:** User picks which image model generates the image, from models the deployment can run.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:192; apps/cli/src/cloud/image.rs:467
- **Where to find it:** Run agi image --list-models in a terminal, then agi image "a red bicycle" --model <name>. In the app: /image --model <name> <prompt> (labels found in the code)
- **Needs:** a Managed Cloud account
- **Steps:**
  1. Run agi image --list-models and note the model names and their states.
  2. Run agi image "a red bicycle" --model <one name from the list>.
  3. Read the AI-generated with line in the output and check it names the model you chose.

## S44.07 Aspect-ratio selector.

- **Expected:** User picks the aspect ratio of the generated image from ratios the model supports.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1120; apps/cli/src/cloud/image.rs:47; apps/cli/src/cloud/image.rs:1220; apps/cli/src/cloud/image.rs:1422
- **Where to find it:** Run agi image --aspect 16:9 "a red bicycle" in a terminal. In the app: /image --aspect 16:9 <prompt> (labels found in the code)
- **Needs:** a Managed Cloud account
- **Steps:**
  1. Run agi image --aspect 16:9 "a red bicycle".
  2. Open the saved file and check its shape is wide, 16 by 9.
  3. Run the same with a ratio the model does not list in agi image --list-models. Read the error, which says the model does not make that ratio and lists what it supports.
  4. Compare with Expected: the ratio should come from the ratios the model supports.

## S44.08 Size/resolution selector.

- **Expected:** User picks the output size or resolution of the image.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1123; apps/cli/src/cloud/image.rs:277 (quoted code not found in the file now)
- **Where to find it:** Run agi image --size 256x256 "a red bicycle" in a terminal (labels found in the code)
- **Needs:** a Managed Cloud account
- **Steps:**
  1. Run agi image --size 256x256 "a red bicycle".
  2. Open the saved file and check its pixel size.
  3. Read the AI-generated with line, which shows the size.
  4. Compare with Expected: the size should be the one picked.

## S44.09 Quality selector.

- **Expected:** User picks a quality level (standard/HD) for the image.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1126; apps/cli/src/cloud/image.rs:278 (quoted code not found in the file now)
- **Where to find it:** Run agi image --quality hd "a red bicycle" in a terminal. In the app: /image --quality hd <prompt> (labels found in the code)
- **Needs:** a Managed Cloud account
- **Steps:**
  1. Run agi image --quality hd "a red bicycle".
  2. Read the AI-generated with line and check it says hd quality.
  3. Run agi image --quality standard "a red bicycle" and check it says standard quality.
  4. Compare with Expected: the quality should be the level picked.

## S44.10 Output-count selector.

- **Expected:** User picks how many images to generate and sees all of them.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:956 (quoted code not found in the file now); apps/cli/src/cloud/image.rs:1250
- **Where to find it:** Run agi image -n 3 "a red bicycle" in a terminal. In the app: /image -n 3 <prompt> (labels found in the code)
- **Needs:** a Managed Cloud account
- **Steps:**
  1. Run agi image -n 3 "a red bicycle".
  2. Read the printed file paths and count them.
  3. If you ask for more than the model allows, read the error that says the model makes at most that many images per request.
  4. Compare with Expected: every image asked for should be listed.

## S44.11 Background transparency option.

- **Expected:** User asks for a transparent background on the generated image.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1130; apps/cli/src/cloud/image.rs:53; apps/cli/src/cloud/image.rs:513; apps/cli/src/cloud/image.rs:1443
- **Where to find it:** Run agi image --transparent "a red bicycle" in a terminal. In the app: /image --transparent <prompt> (labels found in the code)
- **Needs:** a Managed Cloud account; an image viewer that shows transparency
- **Steps:**
  1. Run agi image --transparent "a red bicycle".
  2. Open the saved file in an image viewer and check whether the background is transparent.
  3. Run with a model that cannot make a transparent background. Read the error that says the model cannot make one.

## S44.18 Cancel generation.

- **Expected:** User stops an image generation in progress and the job is cancelled (not billed further).
- **Code:** done. Evidence present: apps/cli/src/cloud/image.rs:1165; apps/cli/src/cloud/image.rs:1176; apps/cli/src/cloud/image.rs:902; apps/cli/src/lib.rs:3546; apps/cli/src/tui/tui_app.rs:4634
- **Where to find it:** In the app, type /image a red bicycle and press Esc while it is generating. In a terminal, press Ctrl-C during agi image (labels found in the code)
- **Needs:** a Managed Cloud account; enough time to press Esc before the image finishes
- **Steps:**
  1. Type /image a red bicycle and press Enter.
  2. While the image is generating, press Esc.
  3. Look for the message Stopped this image.
  4. Compare with Expected: the job should stop and the stop should be recorded.

## S44.19 Retry generation.

- **Expected:** After a failed or stopped generation, user retries it in place with the same prompt.
- **Code:** done. Evidence present: apps/cli/src/cloud/image.rs:910; apps/cli/src/cloud/image.rs:944; apps/cli/src/lib.rs:1144; apps/cli/src/cloud/image.rs:1386
- **Where to find it:** Type /image retry in the app, or run agi image --retry in a terminal (labels found in the code)
- **Needs:** a Managed Cloud account and one failed or stopped image
- **Steps:**
  1. Stop an image with Esc, or let one fail.
  2. Type /image retry and press Enter.
  3. Look for the same prompt shown again and a new Saved line.
  4. Compare with Expected: the retry should use the same prompt and settings and not ask you to type them again.

## S44.22 Full-screen image viewer.

- **Expected:** User opens a generated image in a full-screen viewer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5596; apps/cli/src/tui/tui_app.rs:5601
- **Where to find it:** Generate an image, then type /image open in the app (labels found in the code)
- **Needs:** a Managed Cloud account and a computer with an image viewer
- **Steps:**
  1. Generate an image with /image a red bicycle.
  2. Type /image open and press Enter.
  3. Look for the message Opened with the file path, and the image in the system viewer.
  4. Compare with Expected: the image should open full screen.

## S44.23 Prompt and settings inspection.

- **Expected:** User can see the prompt and generation settings (model, ratio, size, quality) used for an image.
- **Code:** done. Evidence present: apps/cli/src/cloud/image.rs:236; apps/cli/src/cloud/image.rs:671; apps/cli/src/cloud/image.rs:761; apps/cli/src/lib.rs:3527; apps/cli/src/tui/tui_app.rs:5586
- **Where to find it:** Type /image last in the app, or run agi image --last in a terminal (labels found in the code)
- **Needs:** a Managed Cloud account and one earlier image on this device
- **Steps:**
  1. Generate an image.
  2. Type /image last and press Enter.
  3. Look for the Prompt: line and the Settings: line, with the model, ratio, size, quality and count.
  4. Compare with Expected: the prompt and settings shown should match the image.

## S44.24 Reuse prompt.

- **Expected:** User reuses the prompt of an earlier image in one action.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1140; apps/cli/src/cloud/image.rs:804; apps/cli/src/cloud/image.rs:1380
- **Where to find it:** Type /image again in the app, or run agi image --again in a terminal (labels found in the code)
- **Needs:** a Managed Cloud account and one earlier image on this device
- **Steps:**
  1. Generate an image with a prompt, for example /image a red bicycle.
  2. Type /image again and press Enter.
  3. Look for the Prompt: line showing the same prompt and a new Saved line.
  4. Compare with Expected: the same prompt should be used again in one action.

## S44.25 Reuse settings.

- **Expected:** User regenerates with the same settings (model, ratio) as an earlier image.
- **Code:** done. Evidence present: apps/cli/src/cloud/image.rs:804; apps/cli/src/cloud/image.rs:734; apps/cli/src/cloud/image.rs:817; apps/cli/src/lib.rs:1148
- **Where to find it:** Run agi image "a blue car" --again in a terminal (or agi image --again). In the app: /image again (path not confirmed in the code; trust the screen)
- **Needs:** a Managed Cloud account and one earlier image on this device
- **Steps:**
  1. Generate an image with agi image --aspect 16:9 "a red bicycle".
  2. Run agi image "a blue car" --again.
  3. Read the AI-generated with line and check it still shows 16:9 aspect.
  4. Compare with Expected: the settings of the earlier image should carry over.

## S44.27 Save to Library.

- **Expected:** Generated images are saved to the user's Library and reappear there later.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1108; apps/cli/src/cloud/image.rs:835; apps/web/app/api/media/image/lib/image-job-executor.ts:493
- **Where to find it:** Generate an image with agi image "a red bicycle", then run agi library in a terminal (labels found in the code)
- **Needs:** a Managed Cloud account
- **Steps:**
  1. Generate an image with agi image "a red bicycle".
  2. Run agi library --kind image.
  3. Look for the new image in the list.
  4. Compare with Expected: the image should be in the Library and still be there later.

## S44.29 Download full-quality image.

- **Expected:** User downloads the generated image at full quality.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1116; apps/cli/src/cloud/image.rs:305 (quoted code not found in the file now)
- **Where to find it:** Run agi image "a red bicycle" --out <folder or file name> in a terminal (labels found in the code)
- **Needs:** a Managed Cloud account; an image viewer
- **Steps:**
  1. Run agi image "a red bicycle" --out ./test-image.png.
  2. Open the saved file in an image viewer.
  3. Compare it with the image in the account and with Expected: it should be the full-quality image.

## S44.36 Content/provenance labeling.

- **Expected:** Generated images are labelled as AI-generated (visibly and in machine-readable provenance).
- **Code:** done. Evidence present: apps/cli/src/cloud/image.rs (text found, layout changed); apps/cli/src/cloud/image_provenance.rs:51; apps/cli/src/cloud/image_provenance.rs:81; apps/cli/src/cloud/image_provenance.rs:4
- **Where to find it:** Run agi image "a red bicycle" in a terminal, then read the line after the file path (labels found in the code)
- **Needs:** a Managed Cloud account; an image viewer or a metadata tool to check the file
- **Steps:**
  1. Generate an image with agi image "a red bicycle".
  2. Read the line that starts with AI-generated with.
  3. Look for Labelled as AI-generated in the file metadata.
  4. Compare with Expected: the label should be visible and in the file metadata.
