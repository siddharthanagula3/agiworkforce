---
id: "COMP-images-and-video"
type: "competitor-trace"
title: "Images and video"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Images and video: competitors to requirements

Reviewed 2026-11-22. ChatGPT documents image input, generation, editing and a library. It also documents GIFs, stickers and provenance marks, and its Sora video product has been shut down. Claude documents image input only. It says it makes no photos or video, only code-built visuals and animations. AGI has image and video generation on web, but mobile video is switched off. AGI has no undo or redo, brushes, templates, sketch input or provenance checker, and a person saw Free image generation fail. Local-mode image behaviour is not established.

**How the products divide this topic.** Claude (support.claude.com): reads images and PDFs, and draws diagrams, charts and interactive visuals as code. It says it does not make photos, illustrations, photorealistic image or video (can-claude-produce-images page; child-safety page). Claude Motion makes code-built animations and MP4 export, with no video model and no realistic footage; it is listed for Team and Enterprise. Claude Code (code.claude.com plus support pages on it) is the separate coding tool: image paste and drag only. Its chat link is the Chrome extension and Claude apps, which accept screenshots. ChatGPT (help.openai.com, chatgpt.com/pricing): image input, image creation and editing, library, GIF, stickers, try-on, provenance marks. Plans: vision limited on Free, standard on paid; image generation limited on Free, included on Go, Plus and Pro; Thinking-assisted images Plus and Pro only. Sora web and app shut down 2026-04-26 and its API 2026-09-24. Codex (learn.chatgpt.com/docs) is the separate coding tool and the Work desktop surface: --image input, an image-generation skill that burns included limits 3 to 5 times faster, and a Canvas image viewer. Codex pages are labelled Codex below. Evidence gaps: surfaces and plans are often blank in the catalogue. Claude pages rarely state per-plan image limits. Review date for all competitor claims is 2026-11-22.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-images-and-video-01](#cap-images-and-video-01) | Image input: ask about one or several images | yes | yes | partly built | seen working by a person |
| [CAP-images-and-video-02](#cap-images-and-video-02) | Image formats, size limits and count | yes | yes | built | code inspected only |
| [CAP-images-and-video-03](#cap-images-and-video-03) | Screenshot capture into the chat | yes | unknown | partly built | not verified |
| [CAP-images-and-video-04](#cap-images-and-video-04) | Take a photo with the camera and attach it | yes | yes | partly built | not verified |
| [CAP-images-and-video-05](#cap-images-and-video-05) | Documents, scans and PDFs read with their images | yes | yes | partly built | seen working by a person |
| [CAP-images-and-video-06](#cap-images-and-video-06) | Image quality and uncertainty warnings | unknown | partly | not built | not verified |
| [CAP-images-and-video-07](#cap-images-and-video-07) | Point at or select part of an image when asking | unknown | yes | partly built | not verified |
| [CAP-images-and-video-08](#cap-images-and-video-08) | Image results and image search in answers | yes | yes | partly built | not verified |
| [CAP-images-and-video-09](#cap-images-and-video-09) | Text-to-image generation | no | yes | partly built | seen failing by a person |
| [CAP-images-and-video-10](#cap-images-and-video-10) | Generation options: aspect ratio, transparency, style, size, quality, count | no | yes | partly built | code inspected only |
| [CAP-images-and-video-11](#cap-images-and-video-11) | Reference images and saved named references | no | yes | partly built | not verified |
| [CAP-images-and-video-12](#cap-images-and-video-12) | Edit an image by describing the change or selecting a region | no | yes | partly built | seen failing by a person |
| [CAP-images-and-video-13](#cap-images-and-video-13) | Image editor tools: undo, redo, versions, comments, canvas | no | yes | partly built | seen working by a person |
| [CAP-images-and-video-14](#cap-images-and-video-14) | Images library, save, copy, share and delete | no | yes | partly built | code inspected only |
| [CAP-images-and-video-15](#cap-images-and-video-15) | Image templates, sketch to image and prompt sharing | no | yes | off by decision | not verified |
| [CAP-images-and-video-16](#cap-images-and-video-16) | Provenance marks on generated images | unknown | yes | partly built | not verified |
| [CAP-images-and-video-17](#cap-images-and-video-17) | Safety, reporting and age rules for images | yes | yes | partly built | not verified |
| [CAP-images-and-video-18](#cap-images-and-video-18) | Image generation usage limits and cost display | no | yes | partly built | seen failing by a person |
| [CAP-images-and-video-19](#cap-images-and-video-19) | Text-to-video generation | no | no | partly built | not verified |
| [CAP-images-and-video-20](#cap-images-and-video-20) | Video editing, extension, storyboards and likeness controls | no | no | not built | not verified |
| [CAP-images-and-video-21](#cap-images-and-video-21) | Animate an image: GIF and image-to-video | no | yes | not built | not verified |
| [CAP-images-and-video-22](#cap-images-and-video-22) | Video files and YouTube as input | unknown | partly | partly built | not verified |
| [CAP-images-and-video-23](#cap-images-and-video-23) | Camera and screen sharing in voice | unknown | yes | partly built | not verified |
| [CAP-images-and-video-24](#cap-images-and-video-24) | Code-built visuals: diagrams, charts and animations | yes | yes | partly built | code inspected only |
| [CAP-images-and-video-25](#cap-images-and-video-25) | Images in the coding tools | yes | yes | built | code inspected only |
| [CAP-images-and-video-26](#cap-images-and-video-26) | Virtual try-on and shopping images | unknown | yes | not built | not verified |
| [CAP-images-and-video-27](#cap-images-and-video-27) | Image and video work in Local mode and on-device | unknown | unknown | unknown | not verified |

## CAP-images-and-video-01 Image input: ask about one or several images

The user attaches one or more images and asks questions. The image goes to a model that can read images.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Supports images in JPEG, PNG, GIF and WebP; add from plus menu, drag and drop or paste; up to 20 files per chat. Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): All models accept images on Free and paid plans, subject to plan limits; add by plus button, drag-drop or paste. Plans: Free, Plus, Pro, others. Apps: web, iOS, Android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Vision (image understanding): limited on Free; standard on Go, Plus and Pro. Plans: Free, Go, Plus, Pro. Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 'If a provider does not support vision, do not accept image input for that route unless AGI adds a separate vision preprocessing path and labels it'; M-FILE-005). Every app lets a user attach images to a message. Only routes whose catalogue entry says they read images may receive them. If the chosen route cannot read images, say so and do not accept the image, unless a labelled preprocessing step exists.

**With different models, providers and the one subscription.** The capability comes from the model catalogue, not a model name. Image reads count under the one AGI Subscription like any turn. Local mode: allowed only when the local model reports image input; otherwise the control is disabled with a reason. Nothing goes to a server silently.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI, VS Code and Chrome built; web, desktop and mobile built but ledger marks them partial pending a live check of the upload scanner The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S43.01, S43.02, S43.03, S43.12, S43.13, S43.14
- Comparison list ids: none matched; rows without an id: web 'Image input limits' (no list_id); desktop 'Use screenshots and images as input' (no list_id); cli 'Images in the prompt' (no list_id); vscode 'Paste or drag in images' (no list_id)
- Code: `apps/web/lib/security/upload-scan.ts:274`; `apps/web/features/chat/hooks/use-attachments.ts:66`; `apps/cli/src/lib.rs:8333`; `apps/cli/src/tui/tui_app.rs:6156`; `apps/mobile/services/api.ts:651`

**Gap.** Ledger asks for a production live check after deploy of the upload scanner on web and the Electron window. Wrong-answer risk was seen on phone width (see verification).

**Acceptance criteria**

1. Attach two images in a new chat and ask which differs; the answer names both images correctly.
2. Pick a route that cannot read images; the attach control is disabled or the app says why.
3. Repeat on web, mobile and CLI with the same images; each answers.
4. In Local mode with a text-only local model, no image leaves the device and the user is told.

**Verification: seen working by a person.** Web scorecard W-4: subscribed run answered the PDF and image question correctly. Free run answered correctly once and wrongly (5 shapes instead of 3) at 390 px width; 6-defects row W-4 free 'Wrong shape count', marked unclear. Other apps: code inspected only.

## CAP-images-and-video-02 Image formats, size limits and count

The rules for which image files are accepted, how large, and how many per chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): 500 MB per file, up to 20 files per chat, images up to 8000x8000 pixels; images JPEG, PNG, GIF, WebP. Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): PNG, JPEG and non-animated GIF, up to 20MB per image; count per conversation depends on image size and text. Apps: web, iOS, Android.
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Library storage by plan; images 20 MB per file. Plans: Free, Go, Plus, Pro, Business. Apps: web.

**AGI requirement** (inferred; source: competitor parity). One shared attachment policy sets image types, size and count for every app, and every app shows a clear message when a file breaks it.

**With different models, providers and the one subscription.** Limits are configuration owned by the contracts package, may vary by plan under the AGI Subscription, and are checked before any provider call. Local mode uses the same file rules.

**Current implementation, as this trace read it on 2026-11-24: built.** Shared policy file: 20 MiB, 8000 px edge, JPEG PNG GIF WebP on web and mobile The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S43.18
- Comparison list ids: none matched; rows without an id: web 'Image input limits'; mobile 'Image size limit'
- Code: `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:4`; `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:62`

**Gap.** Ledger S43.18 high versus reduced detail choice is missing on web, desktop, mobile and Chrome. A second figure of 12 MiB exists at line 8 of the policy file whose scope was not checked.

**Acceptance criteria**

1. Attach a file over the limit; the message states the limit.
2. Attach a 8001 px image; it is refused with a reason.
3. Attach 21 images; the 21st is refused.

**Verification: code inspected only.** Policy json read; no person ran the limits.

## CAP-images-and-video-03 Screenshot capture into the chat

Capture the screen, a window or a tab and attach it, including by shortcut.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac): Drag-select a screen area from quick entry to attach it to the message; needs Screen recording permission. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): Users share screenshots or regions and give Claude images to upload to forms or reports. Plans: Paid plans. Apps: chrome.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). Desktop and the Chrome extension attach a screenshot in one action. Capture needs a stated permission and never runs silently.

**With different models, providers and the one subscription.** Capture happens on the device. Sending it to a model follows the normal image-input rule and trust boundary; Local chats stay local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop shortcut capture partial; Chrome page screenshot attach built, no region selection; web plus-menu screenshot missing The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP100, DP20, W71, XP28
- Code: `apps/desktop/electron/screenshot.ts:111`; `apps/extension/src/side_panel.ts:9721`

**Gap.** Web has no screenshot item; Chrome has no region select.

**Acceptance criteria**

1. Desktop shortcut attaches a screenshot to the open chat.
2. Chrome side panel attaches the current tab image.
3. Denying the OS permission shows an explanation and sends nothing.

**Verification: not verified.** No person-run result found for screenshots.

## CAP-images-and-video-04 Take a photo with the camera and attach it

Open the device camera from the attach menu and attach the photo.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios): iOS widget can take a photo to share; an Analyze Photo control sends an image for analysis without opening the app. Apps: iOS.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10003026-windows-app-release-notes](https://help.openai.com/en/articles/10003026-windows-app-release-notes): Windows app: capture a photo with the webcam and attach it. Apps: desktop.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Camera Scan on iOS captures several pages and merges them into a PDF for upload (Oct 1, 2026). Apps: iOS.

**AGI requirement** (inferred; source: competitor parity). Mobile attaches a camera photo from the plus menu. Desktop offers webcam capture where the OS allows.

**With different models, providers and the one subscription.** Camera permission is asked first. The photo is a normal image attachment under the same route rules; Local mode keeps it on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile camera attach built; desktop webcam missing; mobile multi-page scan partial The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D12, D22, MP37; rows without an id: mobile 'Take a photo to attach'
- Code: `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:697`

**Gap.** No webcam capture on desktop; document scan to PDF is partial.

**Acceptance criteria**

1. On phone, plus menu Camera takes a photo and attaches it.
2. Denied camera permission shows a message and a settings link.
3. Desktop: the attach menu offers Take Photo or states it is unavailable.

**Verification: not verified.** No person-run result for camera.

## CAP-images-and-video-05 Documents, scans and PDFs read with their images

The model reads images inside PDFs and scanned documents, not only text.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): PDFs of 100 pages or fewer get text and visual analysis (charts, images); 101-1000 pages are text only. Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10029836-optimizing-file-uploads-in-chatgpt-enterprise](https://help.openai.com/en/articles/10029836-optimizing-file-uploads-in-chatgpt-enterprise): jpg/png use vision; PDFs in prompts get visual retrieval of embedded images; images in non-PDF files are not read. Plans: Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Scanned pages and PDF figures are read visually on routes that can read images, with the page limit stated to the user.

**With different models, providers and the one subscription.** Falls back to text extraction on text-only routes and says so. Counts under the one subscription. Local mode: text extraction on device; visual pass only with an image-capable local model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Ledger partial on web, desktop, mobile; CLI, VS Code, Chrome built The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S43.04, S43.05, S43.06, S43.07, S43.08
- Comparison list ids: MP33
- Code: `apps/mobile/src/features/chat/utils/attachmentValidation.ts`

**Gap.** Ledger marks the web, desktop and mobile cells partial until live checks run. MP33 is partial: embedded PDF images only partly read.

**Acceptance criteria**

1. Upload a PDF whose answer sits in a chart image; the answer uses the chart.
2. Upload a photo of handwriting; the text is transcribed.
3. A route without image input says it read only the text.

**Verification: seen working by a person.** Web scorecard W-4 used a PDF plus an image together; the answer used both, with the slow-start and count defects noted. Handwriting and scans not run.

## CAP-images-and-video-06 Image quality and uncertainty warnings

The product warns when an image is too poor to read and marks uncertain readings in answers.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): Documents limits: weak on medical scans, non-Latin text, rotated text, varied line styles in graphs, precise spatial tasks, panoramic or fisheye images; ignores metadata.

**AGI requirement** (proposed; source: competitor parity: ChatGPT documents its limits as help text, no in-product warning is shown in the catalogue). The help text lists what image reading does badly. A warning before send for tiny or blurry images is proposed.

**With different models, providers and the one subscription.** Limits differ by model, so the text is taken from the catalogue entry of the chosen route, never a fixed list.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on all apps The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S43.19, S43.20
- Comparison list ids: none matched
- Code: none cited

**Gap.** No pre-send warning and no uncertainty flags on any app.

**Acceptance criteria**

1. Attach a 20 px image; a warning shows before send.
2. Ask for a blurry sign; the answer says which words are unsure.

**Verification: not verified.** Ledger status only.

## CAP-images-and-video-07 Point at or select part of an image when asking

Mark or select a region so the question or edit applies to that area.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Sep 25, 2023: attach photos and discuss them; the mobile drawing tool highlights part of an image. Plans: Plus. Apps: mobile.

**AGI requirement** (inferred; source: competitor parity). A user can mark a region on an attached image and the question applies to it.

**With different models, providers and the one subscription.** The mark is sent as part of the image or as coordinates, whichever the route accepts; the app states which. Local: same, on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile mark-up partial; web, desktop, Chrome missing for questions The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S43.09
- Comparison list ids: MP16
- Code: `apps/mobile/src/features/chat/components/ImageFullScreen.tsx:822`

**Gap.** Region question missing on web, desktop and Chrome.

**Acceptance criteria**

1. Draw a circle on an attached photo and ask what it is; the answer is about that area.

**Verification: not verified.** Not run.

## CAP-images-and-video-08 Image results and image search in answers

Web answers show pictures with source links, and search can start from an uploaded image.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Claude can show images from Bing-powered search results with source links, no separate setting. Apps: web, desktop, iOS, Android.
  - [https://support.claude.com/en/articles/13663666-use-visual-and-interactive-content-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13663666-use-visual-and-interactive-content-on-team-and-enterprise-plans): Maps and image search toggles for organizations; Team on by default, Enterprise off until owner enables. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 13, 2025: searching the web with an uploaded image. Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Search answers can show images with their source, and an admin can turn this off for an organisation.

**With different models, providers and the one subscription.** Search is an AGI harness feature, not a model feature, so it works with any model that gets the results. It leaves the device, so it needs a clear external-service label and is off in Local mode unless the user opts in.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile inline web images partial; web missing; no admin toggle The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP25, W426, W77, W93, W98
- Code: `apps/mobile/src/features/chat/components/MarkdownImage.tsx:5`

**Gap.** Web shows cited text only; no image search from an upload; no org toggle.

**Acceptance criteria**

1. Ask a visual search question; the answer includes images with source links.
2. Admin turns image results off; they stop appearing for members.

**Verification: not verified.** Comparison rows only.

## CAP-images-and-video-09 Text-to-image generation

Make a new image from a written prompt inside chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): Claude does not make photos or illustrations; it builds HTML/SVG diagrams, charts and interactive visuals in conversation. Apps: web, desktop.
  - [https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers](https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers): Claude does not generate photorealistic image or video. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Generate new images from a prompt in chat or via Explore > Images; add text, details and transparent backgrounds. Plans: All tiers. Apps: web, iOS, Android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Image generation: limited on Free; included on Go, Plus and Pro; Pro unlimited and faster. Plans: Free, Go, Plus, Pro. Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Image generation column; Free plan limited media; unknown availability preserves the draft and asks for retry); experience-contract W12). Every app with a chat can request an image from a prompt through a managed route, choosing from image models the deployment can run. Free users either get the limited offer or a clear upgrade or retry message, never a silent failure.

**With different models, providers and the one subscription.** Image models are catalogue entries from any provider. Cost is metered under the AGI Subscription credits. Generation needs servers or a provider, so Local chats show an explicit step to move to managed cloud with consent; no automatic routing.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop (hosted web), mobile and CLI built; VS Code through an agent tool on paid plans; Chrome missing. Free path failed when a person tried it. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.01, S44.02, S44.07, S44.11, S44.18, S44.19
- Comparison list ids: VP17, WP87; rows without an id: desktop 'Create and edit images in chat'; cli '/image'; mobile 'Create images from a description'
- Code: `apps/web/app/api/media/image/generate`; `apps/web/features/chat/lib/free-media-choice.ts:9`; `apps/cli/src/cloud/image.rs`; `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`

**Gap.** Free web shows 'Free image availability could not be checked' with no upgrade or retry that works; at the credit limit an image send fails silently; Chrome has no image mode.

**Acceptance criteria**

1. Paid account: prompt returns a decodable image in under 30 s with the model named.
2. Free account: either an image or a message that names the limit and the next step.
3. At zero credits: a visible limit message, no orphan chat.
4. Cancel mid-run stops the job and the charge.

**Verification: seen failing by a person.** Web scorecard W-7: Free fail (retry notice); subscribed partial (image arrived in about 16 s). Defects: free Retry notice, silent 429 at credit limit.

## CAP-images-and-video-10 Generation options: aspect ratio, transparency, style, size, quality, count

Controls that shape the generated image before it is made.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): No photo or illustration generation. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Choose an aspect ratio in a picker or in the prompt; add transparent backgrounds.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W12 (unsupported configurations expose an honest disabled state)). Show only the options the chosen image model supports, and hide the rest.

**With different models, providers and the one subscription.** Options come from model capability metadata so a model swap changes the controls. Larger sizes cost more credits under the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Aspect ratio and transparency on web, desktop, mobile, CLI; style presets on web and desktop; size, quality, count on CLI only; seed missing The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.03, S44.05, S44.06, S44.07, S44.08, S44.09, S44.10, S44.11, S44.12
- Comparison list ids: none matched; rows without an id: web 'Image aspect ratio choice'; web 'Transparent-background images'; web 'Image style presets'
- Code: `apps/web/features/chat/lib/imageGenerationOptions.ts:46`; `apps/web/features/chat/lib/imageGenerationOptions.ts:146`

**Gap.** Style presets: decisions/wire-or-cut.md cut a desktop gallery and preset picker with no production path, while web has presets; the 2026-11-13 decision lists image style templates as not built. Prompt suggestions, prompt enhancement and seed missing.

**Acceptance criteria**

1. Pick 16:9; the output has that ratio.
2. Choose a transparent background; the downloaded file keeps its alpha channel.
3. Switch model; unsupported controls disappear.

**Verification: code inspected only.** Options file and comparison rows read; no person run.

## CAP-images-and-video-11 Reference images and saved named references

Attach images that guide a generation, and save one under a name to reuse with @name.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/4604416-get-started-with-claude-design](https://support.claude.com/en/articles/4604416-get-started-with-claude-design) (this address is not in the saved catalogue; treat as unverified): PLACEHOLDER
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Save an uploaded photo as a named reference, then type @name in later prompts to reuse it.
  - [https://learn.chatgpt.com/docs/image-generation.md](https://learn.chatgpt.com/docs/image-generation.md): Add a reference image to transform or guide; multiple reference images can be ordered and described. Apps: desktop, web, CLI, IDE.

**AGI requirement** (inferred; source: competitor parity). Users attach reference images to a request, and may save a named reference for reuse. Saved references are private to the user and deletable.

**With different models, providers and the one subscription.** Reference slots are offered only for models that accept them. Saved references are user data, kept in the account under the usual storage quota. In Local mode they stay on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Reference attach built on web, desktop, mobile; not saved by name; CLI and Chrome missing The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S43.17, S44.04, S45.22, S45.34, S45.35
- Comparison list ids: M161, MP36, W286, WP90
- Code: `apps/web/features/chat/lib/imageGenerationOptions.ts:145`; `apps/mobile/src/features/image/ImagesScreen.tsx:222`

**Gap.** No @name saving on web; mobile partial; no brand or avatar references.

**Acceptance criteria**

1. Attach a reference; the result carries its subject or style.
2. Save it as a name; typing @name in a new chat reuses it.
3. Delete the saved reference; @name no longer resolves.

**Verification: not verified.** Not run.

## CAP-images-and-video-12 Edit an image by describing the change or selecting a region

Change an uploaded or generated image with words, optionally limited to a selected area.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): Claude does not make photos or illustrations. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Highlight part of an image then describe the change; highlights are imprecise and edits may spill outside the area. Apps: web.
  - [https://learn.chatgpt.com/docs/image-generation.md](https://learn.chatgpt.com/docs/image-generation.md): Select a specific region and describe the change for that area. Apps: desktop, web.

**AGI requirement** (inferred; source: competitor parity; experience-contract W12 for honest disabled states). Editing changes the chosen part and keeps the rest. When the chosen model cannot edit, say so and offer a new version instead.

**With different models, providers and the one subscription.** Edit support is a catalogue property of each image model. Edits count as generations under the subscription. Local: needs a server route, so it is an explicit managed-cloud step.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Region edit on web, desktop and mobile; CLI and Chrome none. When the model cannot edit, it regenerates the whole picture. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S45.01, S45.02, S45.03, S45.04, S45.05, S45.06, S45.09, S45.15, S45.16, S45.19, S45.31
- Comparison list ids: WP86; rows without an id: web 'Image edit by selecting a region'; mobile 'Edit part of an image by selecting an area'
- Code: `apps/web/features/chat/components/ImageGenerationCard.tsx:707`; `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx`; `apps/mobile/src/features/chat/components/ImageFullScreen.tsx:822`

**Gap.** A person saw the edit change unrelated shapes. No brush, eraser, overlay, click-to-comment, crop, resize, invert or multi-image combine. Marked Same in comparison but failed the unchanged-parts check in the browser.

**Acceptance criteria**

1. Ask to recolour only one object; every other object is pixel-identical.
2. If the model cannot edit, the card says so before sending.
3. Original image stays available next to the result.

**Verification: seen failing by a person.** Web scorecard W-7 subscribed: 'only the circle changes' check failed. 6-defects: 'Image edit regenerates the picture'; Free: edit follow-up sent nothing.

## CAP-images-and-video-13 Image editor tools: undo, redo, versions, comments, canvas

A full viewer where users step through versions, comment on points, resize, remove, and compare.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): No image generation or editing. Apps: web, desktop.
- **ChatGPT, Codex: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Image editor: select, aspect ratio, undo, redo, cancel, save; mobile has Edit, Select with size slider, comments, Resize and Remove. Apps: web, iOS, Android.
  - [https://learn.chatgpt.com/docs/image-generation.md](https://learn.chatgpt.com/docs/image-generation.md): Codex desktop: Focused and Canvas views; Canvas Comment and Multi-select send comments with edit instructions in the same chat. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Match version choice, undo and redo; further tools only if the owner wants them.

**With different models, providers and the one subscription.** Versions are stored with the chat. Each regeneration is billed under the one subscription; undo and redo are free.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Version stepping 'New version' on web; no undo or redo; mobile has partial resize and remove The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S45.17, S45.18, S45.28, S45.29, S45.30, S45.32
- Comparison list ids: D20, DP23, MP35, W105, WP86
- Code: `apps/web/features/chat/components/ImageLightbox.tsx`; `apps/mobile/src/features/image/components/ImageChangeSheet.tsx`

**Gap.** Missing undo, redo, before/after, Canvas view with comments, crop, resize, export format.

**Acceptance criteria**

1. Make two edits, then undo; the first edit returns.
2. Open the version list; each earlier version opens.
3. Comment on a point and send; the edit targets it.

**Verification: seen working by a person.** Web scorecard W-7: both versions persisted after reload (2/2, Previous version). Other tools not run.

## CAP-images-and-video-14 Images library, save, copy, share and delete

A place listing all generated images, with copy, download, share and delete.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): No image generation, so no image library. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Every created image is auto-saved under Images on web and mobile; copy, download or share; images are removed only by deleting the conversation. Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (files go to Trash or Recently deleted before permanent removal)). Generated images are saved to the Library with copy, download and share, and removal goes to Recently deleted first.

**With different models, providers and the one subscription.** Storage counts against the account quota under the subscription. Local images stay on the device unless the user shares them.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web gallery page and Library built; delete goes to Recently deleted for 30 days; mobile copy/save/share built; CLI no copy; favourites missing. 2026-11-13 decision says an Images page was not built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.21, S44.22, S44.26, S44.27, S44.28, S44.29, S44.30, S44.31
- Comparison list ids: none matched; rows without an id: web 'Images gallery of everything you generated'; web 'Copy, save and share a generated image'; web 'Delete a generated image'; mobile 'Copy, save or share a generated image'
- Code: `apps/web/app/chat/images/page.tsx`; `packages/ui/unified-chat/src/components/library/LibraryView.tsx:728`

**Gap.** Owner decision text from 2026-11-13 contradicts the existing web Images page; favourites and share link missing.

**Acceptance criteria**

1. Generate an image, reload, and find it in the gallery.
2. Delete it; it appears in Recently deleted and can be restored.
3. Copy puts the image on the clipboard.

**Verification: code inspected only.** Pages and Library code read; no person run.

## CAP-images-and-video-15 Image templates, sketch to image and prompt sharing

Start from a template, draw a sketch to guide an image, or share a prompt as a link.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): No image generation. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Templates for posters and logos; on mobile type @ and choose Sketch; share a prompt as a template link. Apps: web, iOS, Android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Personalised sticker packs for iMessage and WhatsApp (Aug 31, 2026). Plans: Free, Go, Plus, Pro. Apps: iOS, Android.

**AGI requirement** (proposed; source: competitor parity). Not required by a project document. Candidate; owner decides.

**With different models, providers and the one subscription.** Templates are plain prompts and work with any image model; stickers depend on model output format.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Missing on all apps; 2026-11-13 decision lists image style templates and an Images page as not built The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.32, S45.36, S45.37
- Comparison list ids: M205, M49, M50, M51, W107, W108
- Code: `docs/decisions/2026-11-13-founder-decisions.md:32`

**Gap.** Whole group absent; one owner decision against templates.

**Acceptance criteria**

1. If built: a template fills a prompt and generates.
2. If built: a sketch drawn on phone changes the image.

**Verification: not verified.** Not applicable until built.

## CAP-images-and-video-16 Provenance marks on generated images

Generated images carry visible and machine-readable markers and can be checked.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8912793-provenance-signals-in-content-processed-by-openai-tools](https://help.openai.com/en/articles/8912793-provenance-signals-in-content-processed-by-openai-tools): Images carry C2PA Content Credentials plus a watermark; a verify page checks an uploaded image, audio or PDF. Apps: web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity; mobile Article 50 screen already claims provenance). Generated images and video are labelled as AI-made, visibly and in file metadata.

**With different models, providers and the one subscription.** The label is added by AGI after any provider returns, so it applies to every model. Local-generated media gets it too.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Ledger says labelling done on web, desktop, mobile, CLI; comparison says no metadata or checker found on web; mobile Article 50 text partial The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.36
- Comparison list ids: MP94, W111
- Code: `apps/mobile/app/legal/article-50.tsx:113`

**Gap.** Ledger and comparison disagree on machine-readable marks. Code wins: the comparison searched for c2pa and content credentials and found none.

**Acceptance criteria**

1. Download a generated image; its metadata states AI generation.
2. The Article 50 claim matches what files actually carry.

**Verification: not verified.** Not run; conflict above.

## CAP-images-and-video-17 Safety, reporting and age rules for images

Controls that detect abuse imagery, let users report generated images, and restrict image features by age or admin setting.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9020328-csam-detection-and-reporting](https://support.claude.com/en/articles/9020328-csam-detection-and-reporting): First-party services compute perceptual hashes of uploaded images, compare with known-CSAM hashes and report matches. Apps: web.
  - [https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers](https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers): Consumer products are 18+ only. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Report generated images; a parent of a linked teen may disable image create and edit.
  - [https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md](https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md): Role toggle for using image generation (Edu). Plans: Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/decisions: 18 and over on every surface with a server-held decision (2026-11-20, per owner memory index); admin switch inferred). Users can report a generated image. Admins can switch image generation off. All surfaces are 18 and over.

**With different models, providers and the one subscription.** Checks run in AGI before and after provider calls, whichever model is used. Applies to Local uploads only on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Report built on web, desktop, mobile; no image hash matching; no admin image switch The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.35
- Comparison list ids: W268, W306
- Code: `apps/web/lib/moderation/text-classifier.ts:125`; `packages/contracts/types/src/enterprise/workspace-controls.ts:38`

**Gap.** No image hash pipeline; no workspace switch for image generation.

**Acceptance criteria**

1. Report an image; a confirmation appears and the report is stored.
2. Admin disables image generation; members see it off.

**Verification: not verified.** Not run.

## CAP-images-and-video-18 Image generation usage limits and cost display

How image use is capped, metered and shown to the user.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/9002504-can-claude-produce-images](https://support.claude.com/en/articles/9002504-can-claude-produce-images): No image generation to meter. Apps: web, desktop.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): Codex: image generation drains limits 3-5x faster than similar turns, then draws credits; not on Free. Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop, CLI.
  - [https://help.openai.com/en/articles/11481834-chatgpt-rate-card-business-enterpriseedu-credit-based-pricing](https://help.openai.com/en/articles/11481834-chatgpt-rate-card-business-enterpriseedu-credit-based-pricing): Edu gets a daily image budget at no credit cost. Plans: Edu.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Free plan media caps of 10 image and 5 video requests per UTC day when inventory allows; unknown availability preserves the draft); owner decision 'Free usage = Upgrade only'). Image use is metered by the one AGI Subscription. On Free, show only Upgrade, not meters. Unknown availability keeps the draft and asks for retry.

**With different models, providers and the one subscription.** Limits are configuration. Same ledger on every app. Local generation, where it ever exists, is free and unmetered; managed generation is metered.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Credits settle per image and video job; web shows a video cost estimate; no remaining-allowance display for images The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.14, S44.15, S46.27
- Comparison list ids: WP87
- Code: `packages/contracts/types/src/model-catalog.ts:1250`; `apps/web/features/chat/components/Composer/VideoCostEstimate.tsx`

**Gap.** Free path fails with a retry notice and a credit-limit send fails silently, both seen in the browser.

**Acceptance criteria**

1. At the credit limit, a visible message explains and offers the next step.
2. Free account sees Upgrade, no meter.

**Verification: seen failing by a person.** 6-defects W-7 free and subscribed rows.

## CAP-images-and-video-19 Text-to-video generation

Make a short video clip from a prompt in a managed generation job.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/17454997-get-started-with-claude-motion](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion): Claude Motion makes code-based animations; no video-generation model, no realistic footage. Plans: Team, Enterprise. Apps: web, desktop.
  - [https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers](https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers): Claude does not generate photorealistic image or video. Apps: web.
- **ChatGPT: no**
  - [https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation): Sora web and app shut down April 26, 2026 and the Sora API September 24, 2026; content can be exported. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W12; definition.md (video generation included in paid plans, Free capped)). Where video is offered, it runs as a job with progress, cancel, retry that does not double-submit, and a cost shown first. Unsupported options show an honest disabled state.

**With different models, providers and the one subscription.** Video models are catalogue entries from any provider; one provider's shutdown must be fixable by moving a family slot, not by editing apps. Always a server or outside service, so it never runs in Local mode and the user is told.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web built for Max and Enterprise with cost estimate; desktop through hosted web; mobile built but switched off; Chrome has a Create a video mode; CLI none The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S46.01, S46.05, S46.06, S46.07, S46.08, S46.26, S46.27, S46.28, S46.29, S46.30, S46.31, S46.32
- Comparison list ids: none matched; rows without an id: web 'Video generation'; mobile 'Video generation from a description'; chrome 'Create a video from a prompt in the panel'
- Code: `apps/web/app/api/media/video/generate/route.ts`; `apps/mobile/lib/v1FeatureFlags.ts:28`; `apps/extension/src/side_panel.ts:6078`; `packages/contracts/types/src/model-catalog.ts:1337`

**Gap.** Ledger says Chrome video missing, comparison and code show a video mode. Mobile ledger says done but the flag is off. The old provider family slots still name shut-down rows (known flaw VIDEO-VEO-SLOTS-SHUTDOWN-2026-10-22). Neither leader offers video, so parity pressure is none.

**Acceptance criteria**

1. Submit a clip; progress shows; a playable file arrives.
2. Cancel mid-job; usage settles consistently.
3. Refresh mid-job; the same job resumes, not a second one.
4. Free account sees a cap message, not a failure.

**Verification: not verified.** No person-run result for video in the scorecard or defects file.

## CAP-images-and-video-20 Video editing, extension, storyboards and likeness controls

Trim, extend, remix, join clips, add captions, storyboard shots, and manage consent for a person's likeness.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/17454997-get-started-with-claude-motion](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion): Prompt-built animated explainers, editable by chat or editor, as code. Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: no**
  - [https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation): Sora product discontinued. Apps: web.

**AGI requirement** (proposed; source: docs/product/competitive-guidance.md item 132 asks to inspect video workflows, not to build them). Not required. No project document asks for video editing or likeness features; the owner decides.

**With different models, providers and the one subscription.** If ever built, consent for likeness is stored in the account and enforced on every provider.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on all apps The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S46.02, S46.03, S46.35, S46.36, S47.01, S47.02, S47.09, S47.13, S47.21, S47.22, S47.24
- Comparison list ids: none matched
- Code: none cited

**Gap.** All of areas 46 and 47 beyond basic generation.

**Acceptance criteria**

1. Decide first; no check until the owner decides.

**Verification: not verified.** Ledger status only.

## CAP-images-and-video-21 Animate an image: GIF and image-to-video

Turn a still or a prompt into a looping animation or short video.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/17454997-get-started-with-claude-motion](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion): Code-based animations, no video model. Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11084440-images-in-chatgpt](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Ask for a looping GIF or animate an uploaded still; the GIF opens with playback speed, save and share controls.

**AGI requirement** (proposed; source: competitor parity). Not required. Candidate for parity.

**With different models, providers and the one subscription.** Needs a model that supports it; managed route only.

**Current implementation, as this trace read it on 2026-11-24: not built.** GIF missing; image-to-video missing The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S44.34, S46.02
- Comparison list ids: M48, W106
- Code: `apps/web/features/chat/lib/imageGenerationOptions.ts`

**Gap.** Not built.

**Acceptance criteria**

1. If built: a still becomes a playable loop that can be saved.

**Verification: not verified.** Not applicable.

## CAP-images-and-video-22 Video files and YouTube as input

Attach a video file, or ask about a video from its transcript.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT, Codex: partly**
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): Videos can be attached, even on Free; analysis may be incomplete and may not interpret audio. Plans: Free and paid. Apps: web, iOS, Android.
  - [https://learn.chatgpt.com/docs/chrome-extension.md](https://learn.chatgpt.com/docs/chrome-extension.md): Codex Chrome extension: with captions available, side chat uses the timestamped transcript to explain or summarize a YouTube video. Apps: chrome.

**AGI requirement** (proposed; source: competitor parity). Not required by a project document. Candidate; the owner decides.

**With different models, providers and the one subscription.** requirements.md lists video input as capability metadata 'where relevant', so routes would declare it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Video attach missing on web and mobile; YouTube transcript only in the Chrome in-page assistant on approved sites The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M46, W113, XP21, XP4
- Code: `apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts`

**Gap.** Video is not an attachable type.

**Acceptance criteria**

1. If built: attach a short clip; the answer states what it could not read.

**Verification: not verified.** Not applicable.

## CAP-images-and-video-23 Camera and screen sharing in voice

Show the live camera or screen during a voice conversation.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): Camera button shares live video and Share Screen shares the screen, in Advanced voice on iOS and Android; this voice mode retires Dec 11, 2026. Plans: Eligible subscribers. Apps: iOS, Android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Voice with video: not on Free; included on Go, Plus and Pro. Plans: Go, Plus, Pro. Apps: iOS, Android.

**AGI requirement** (proposed; source: owner decision 2026-11-13 builds photo or file during voice). Not required. Adding photos during voice is built.

**With different models, providers and the one subscription.** Needs a live-video capable route; absent on most providers. Not in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Photos and files in voice built on web; mobile partial; live camera and screen share missing The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M219, MP110, W470
- Code: `apps/web/features/chat/lib/voice-attachments.ts:9`

**Gap.** No live camera or screen sharing.

**Acceptance criteria**

1. Attach a photo during voice; the reply refers to it.

**Verification: not verified.** Not run.

## CAP-images-and-video-24 Code-built visuals: diagrams, charts and animations

The model draws diagrams, charts and interactive visuals as code, and can export them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Builds diagrams, charts and comparisons inline; interactive; copy as image, download SVG or HTML, or save as artifact; not rendered in iOS or Android. Plans: all users. Apps: web, desktop.
  - [https://support.claude.com/en/articles/17454997-get-started-with-claude-motion](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion): Claude Motion: code-based animated explainers; MP4 export. Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT, Codex: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Oct 7, 2026: chat answers can mix text, diagrams and usable tools. Apps: web, iOS, Android.
  - [https://learn.chatgpt.com/docs/features.md](https://learn.chatgpt.com/docs/features.md): Codex desktop: turn ideas and information into interactive visual explanations. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; definition.md lists artifacts as part of chat). Models can answer with a rendered diagram or chart, and the user can copy or save it as an image.

**With different models, providers and the one subscription.** Works with any model that writes code, since rendering is done by the AGI harness. Runs on device in a sandbox, so it also works in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Diagram and chart rendering built; copy as image or SVG missing on web; switch static to interactive missing on mobile The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M37, W76; rows without an id: web 'Image galleries and carousels'
- Code: `packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:17`

**Gap.** Diagrams copy source only; no image or SVG export.

**Acceptance criteria**

1. Ask for a flowchart; it renders.
2. Copy it as an image and paste into another app.

**Verification: code inspected only.** A SVG answer in the Free W-7 run finished but nothing was visible, per scorecard.

## CAP-images-and-video-25 Images in the coding tools

Paste or pass images to the coding agent, and let it generate or edit images in the workspace.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://support.claude.com/en/articles/14554922-claude-code-user-faq](https://support.claude.com/en/articles/14554922-claude-code-user-faq): Drag screenshots into the terminal or paste with Ctrl+V for error dialogs, mockups and whiteboard photos. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: CLI.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/image-inputs.md](https://learn.chatgpt.com/docs/image-inputs.md): CLI: pass PNG or JPEG files with -i or --image; desktop and IDE accept images by attach, paste or Shift-drag. Apps: CLI, desktop, IDE.
  - [https://learn.chatgpt.com/docs/image-generation.md](https://learn.chatgpt.com/docs/image-generation.md): Generate and edit images from the composer in app, web, CLI or IDE chat. Apps: desktop, web, CLI, IDE.

**AGI requirement** (inferred; source: competitor parity). CLI and VS Code accept image paste or file, and an agent tool can generate an image into the workspace on eligible plans.

**With different models, providers and the one subscription.** Images go only to routes that read images. Generation is a managed call billed under the subscription.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI and VS Code accept images; CLI /image generates; VS Code uses an agent tool on paid plans The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S43.01, S44.01
- Comparison list ids: VP17; rows without an id: cli 'Slash command /image'; cli 'Pass images on the command line'
- Code: `apps/cli/src/lib.rs:8417`; `apps/cli/src/tui/tui_app.rs:5517`; `apps/cli/src/platform/runtime/tool_catalog.rs:1222`

**Gap.** VS Code chat surface for generated images partial; CLI has no inline image preview.

**Acceptance criteria**

1. CLI: pass an image with -f; the answer reads it.
2. CLI /image saves a file and shows its path.
3. VS Code: paste a screenshot; it becomes a chip and is read.

**Verification: code inspected only.** No person-run result for CLI or VS Code.

## CAP-images-and-video-26 Virtual try-on and shopping images

Use a selfie and a product photo to preview clothing, and find similar products from a photo.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11128490-shopping-with-chatgpt-search](https://help.openai.com/en/articles/11128490-shopping-with-chatgpt-search): Try on button uses a selfie and ChatGPT Images; stored reference photos can be changed or deleted in Personalization. Apps: web, iOS, Android.

**AGI requirement** (proposed; source: competitor parity). Not required. ChatGPT-only; the owner decides.

**With different models, providers and the one subscription.** Selfie data is sensitive; would need explicit consent and managed route.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M36
- Code: none cited

**Gap.** Not built.

**Acceptance criteria**

1. Decide first.

**Verification: not verified.** Not applicable.

## CAP-images-and-video-27 Image and video work in Local mode and on-device

What image reading, image making and video making may run on the device and what must go to servers or outside services.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: AGENTS.md section 6 (trust boundaries); docs/product/requirements.md ('If a provider does not support vision...')). Image input runs on a local model only when the model reports it. Image and video generation is a server or provider action; Local chats never route there silently. A move to managed cloud is an explicit, consented fork with a visible provider label.

**With different models, providers and the one subscription.** Free local inference needs no payment; sign-in rules are separate. Managed generation draws on the one AGI Subscription.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not established. No ledger item covers local image input or local generation. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Unknown: whether local models in the catalogue declare image input and how the attach control reacts.

**Acceptance criteria**

1. With a local text-only model the image control is disabled with a reason.
2. Asking for an image in a Local chat shows a consent step before any server call.
3. No network call is made from a Local chat that has an image attached.

**Verification: not verified.** No code or person result read for this.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to build image templates, sketch to image and prompt sharing. The 2026-11-13 decision says image style templates and an Images page are not built, but a web Images page and presets exist in code.
- Whether to match features only ChatGPT has: saved @name references, GIF and image-to-video, sticker packs, virtual try-on, camera and screen share in voice.
- Whether to build video editing, extension, storyboards and likeness consent, given neither leader now offers video generation and ChatGPT's Sora is shut down.
- Whether mobile video generation switches on, given the flag is off and Free video is paid-only there.
- Whether to add provenance metadata and a verify page, since ledger and comparison disagree on the current state.
- Whether to add an image-hash abuse check on uploads, as Claude documents, and an admin switch for image generation.
- Whether to add a before-send warning for poor image quality and uncertainty marks in answers (no leader shows an in-product version).
- Which models count as image-capable in Local mode, and whether an on-device vision preprocessing path is wanted.

## Could not establish

- Whether Claude documents any image limits by plan; the catalogue gives none.
- Claude behaviour for region marking, camera attach on Android and ChatGPT screenshot attach: no catalogue line found.
- Whether the Claude Design template accepts or makes images beyond screenshots as context; page not opened.
- One evidence entry in the Reference-images row cites a Claude Design page with a placeholder statement; treat Claude as has: unknown for reference images beyond context attachments (catalogue id ch04:39 says screenshots, images, decks can be attached to Claude Design).
- Local-mode image behaviour on desktop and mobile: no ledger item and no code read.
- Whether the production upload scanner blocks image attachments; ledger asks for a live check.
- Whether CLI, VS Code, Chrome, desktop, mobile image generation or video works for a person: only the web scorecard exists.
- The size figure of 12 MiB at line 8 of the attachment policy file was not traced to its use.
- Pages under learn.chatgpt.com are mostly the Codex and Work desktop product; whether the same features exist in ChatGPT chat is unknown unless a help.openai.com page says so.
- Chrome video: the ledger says missing; the code shows a video mode in the side panel. Not run.
