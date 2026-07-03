# AGI Desktop — Volume 08 — Desktop Vision

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, the surface rules in `apps/desktop/AGENTS.md`, and the real capture stack: `apps/desktop/src-tauri/src/automation/screen/{mod.rs,capture.rs,dxgi.rs,ocr.rs}`, `apps/desktop/src-tauri/src/core/agent/vision.rs`, `apps/desktop/src-tauri/src/core/agi/executors/ocr_executor.rs`, `apps/desktop/src-tauri/src/sys/commands/{automation.rs,computer_use.rs,tool_confirmation.rs}`, `apps/desktop/src-tauri/Cargo.toml`, and the frontend under `apps/desktop/src/features/{settings,chat,tool-calling}/`. Model IDs are never hardcoded here; a vision model is resolved from `packages/types/src/models.json` per the active trust mode.

## Overview & stance

Desktop Vision is the surface's ability to see the screen: capture pixels, read text out of them, mark them up, and reason about them. Desktop is the full-trust surface (Local + BYOK + Managed Cloud) and the suite's local-private compute host, so vision is governed by two hard rules. First, **capture requires explicit permission** — OS screen-recording grant plus an in-app approval gate before any pixels leave the OS input layer. Second, **captured content follows the active trust mode**: a screenshot taken in a Local chat stays on-device; sending it to a BYOK provider is an explicit Local→BYOK fork (context selection, secret scan, payload preview, provider label, consent) where the image is the payload; a Managed-Cloud chat sends it over the cloud boundary. Captures are never silently promoted from Local to BYOK or Cloud. Capture files are confined to an app-controlled directory, not scattered across the filesystem.

## Screenshot Capture

✅ Built (`apps/desktop/src-tauri/src/sys/commands/automation.rs` `automation_screenshot`; `apps/desktop/src-tauri/src/sys/commands/computer_use.rs`). A single command entry point accepts an element id, an explicit rect, or a full-frame request, validates dimensions (reject 0, cap at 20,000 px per axis), and writes into an app-confined `screenshots` dir under app data. Every computer-use capture path routes through `require_confirmation` → `tool_confirmation::request_confirmation_simple` (SEV-DESK-09: `computer_use_capture_screen` is gated so a prompt-injected LLM cannot capture silently). Requirement: no capture without an OS screen-recording grant and an approval turn; the resulting image is tagged with the originating chat's trust mode before it can be attached.

## Region Capture

✅ Built (`apps/desktop/src-tauri/src/automation/screen/capture.rs` `capture_region(x, y, width, height)` → `CapturedRegion`; wired via `capture_screen_region` in `automation.rs`). Callers pass an explicit rectangle in screen coordinates; the on-screen `RegionHighlight` overlay (`apps/desktop/src-tauri/src/ui/overlay/renderer.rs`) draws the selection. Requirement: coordinates are validated before capture, the region is clamped to a real display, and the output is thumbnailed via `create_thumbnail` for preview without shipping full-resolution pixels into the model context prematurely.

## Window Capture

✅ Built (`apps/desktop/src-tauri/src/automation/screen/capture.rs` `enumerate_windows()` and `capture_window(hwnd)`, with platform-specific implementations behind `cfg`). The user (or agent, after approval) enumerates on-screen windows (`WindowInfo`, `WindowRect`) and captures one by handle rather than grabbing the whole desktop. Requirement: window capture is preferred over full-screen when a single app is the target, minimizing incidental capture of unrelated windows; the captured window still inherits the chat's trust mode and the same permission gate.

## Full Screen Capture

✅ Built (`apps/desktop/src-tauri/src/automation/screen/capture.rs` `capture_primary_screen()` → `CapturedImage`). Display enumeration exists via `apps/desktop/src-tauri/src/automation/screen/dxgi.rs` `list_displays()` → `ScreenInfo`. 🟡 Partial: primary-display capture is the built convenience path; per-display selection on multi-monitor setups depends on `list_displays` being wired into a picker in the capture command — treat multi-monitor target selection as a gap to close in `automation.rs`. Requirement: full-frame capture warns that everything visible is included and defers to region/window capture when a narrower target suffices.

## Clipboard Images

✅ Built (`apps/desktop/src-tauri/src/automation/screen/capture.rs` `paste_from_clipboard()` → `CapturedImage`; `tauri-plugin-clipboard-manager` and `arboard` in `apps/desktop/src-tauri/Cargo.toml`; clipboard watcher in `apps/desktop/src-tauri/src/features/clipboard/`). The frontend ingests pasted/attached images through `apps/desktop/src/features/chat/{ChatInputArea.tsx,AttachmentPreview.tsx}` and `apps/desktop/src/features/tool-calling/ImagePreview.tsx`. Requirement: a clipboard image dropped into a Local chat is treated as Local content; moving it to a BYOK or Cloud turn shows the payload preview and provider label first. Clipboard image contents are never auto-synced (Local/BYOK rows never delta-sync).

## OCR

🟡 Partial (`apps/desktop/src-tauri/src/automation/screen/ocr.rs` `perform_ocr` behind the optional `ocr` Cargo feature backed by Tesseract; executor at `apps/desktop/src-tauri/src/core/agi/executors/ocr_executor.rs`; wired in `automation.rs`). Output is `OcrResult { text, confidence, words[] }` with per-word bounding boxes; `MIN_OCR_CONFIDENCE` discards sub-15% noise. Gap: the `ocr` feature is off by default and needs system Tesseract, so default builds return the non-OCR stub error from `mod.rs` (`"Text recognition is not available in this version"`). The executor validates image paths against allowed directories and checks extensions (PNG/JPEG/WebP/BMP/TIFF/GIF). Requirement: OCR runs on-device (Tesseract is local); OCR text inherits the source image's trust mode and never leaks a Local capture to a remote provider. Deepgram/other engines are unrelated — OCR here is Tesseract, referenced from source rather than a catalog model ID.

## Image Annotation

🔭 Planned. `imageproc` is a dependency (`apps/desktop/src-tauri/Cargo.toml`) and adjacent primitives exist — OCR word bounding boxes (`OcrResult.words`) and the screen-space `RegionHighlight` overlay — but there is no in-app markup that draws boxes, arrows, blur/redaction, or text onto a captured image before it is attached. Requirement (design intent): annotation must run on the local capture before any trust-mode transfer, support redaction that provably strips the underlying pixels (not just a visual overlay) so secrets are removed before a BYOK/Cloud send, and preserve the trust-mode tag on the annotated output.

## Screen Analysis

🟡 Partial (`apps/desktop/src-tauri/src/core/agent/vision.rs` `VisionAutomation`; computer-use loop in `apps/desktop/src-tauri/src/sys/commands/computer_use.rs`). `VisionAutomation` combines `capture_primary_screen`/`capture_region` with OCR to locate elements — `wait_for_element` polls with `MAX_WAIT_TIMEOUT` of 120s and gives up after `MAX_CAPTURE_FAILURES` (5) consecutive failures; `TextMatch` targets require the `ocr` feature, while `ImageMatch` needs only capture. Gap: full multimodal "describe/reason about this screenshot" through a vision LLM is trust-mode-dependent and not a general built path — the model is resolved from `packages/types/src/models.json` per mode (local model for Local, forked provider for BYOK, managed model for Cloud). Requirement: screen analysis never picks a remote model for a Local capture without an explicit fork; every analyzed frame carries its trust tag and confidence surfaced in the UI.

## Repository map

- `apps/desktop/src-tauri/src/automation/screen/` — `capture.rs` (region/window/full/clipboard), `dxgi.rs` (`list_displays`), `ocr.rs` (Tesseract, `ocr` feature), `mod.rs` (exports + non-OCR stubs), `tests.rs`.
- `apps/desktop/src-tauri/src/core/agent/vision.rs` — `VisionAutomation`, element waiting, OCR-driven matching.
- `apps/desktop/src-tauri/src/core/agi/executors/ocr_executor.rs` — path-validated OCR tool executor.
- `apps/desktop/src-tauri/src/sys/commands/{automation.rs,computer_use.rs,tool_confirmation.rs}` — capture commands, approval gating, confinement.
- `apps/desktop/src/features/{chat/ChatInputArea.tsx,chat/AttachmentPreview.tsx,tool-calling/ImagePreview.tsx,settings/AutomationPermissionsSettings.tsx,settings/ComputerUseConsentDialog.tsx}` — attach, preview, permission UI.
- `apps/desktop/src-tauri/Cargo.toml` — `xcap`, `arboard`, `tauri-plugin-clipboard-manager`, `image`, `imageproc`, optional `tesseract`.

## Competitor notes

Claude (computer use / Claude for Chrome), ChatGPT (screenshot understanding), and Codex all capture and reason over screens through their own hosted models. AGI's deliberate divergence: capture is **local-first and permission-gated at the OS and app layers**, the analyzing model is **multi-provider and trust-scoped** (Local on-device, BYOK with an explicit fork and payload preview, Managed Cloud only when chosen), and a Local capture is never silently uploaded. Redaction-before-transfer and a visible provider label are first-class, not afterthoughts.

## Acceptance / Definition of Done

Production-ready when every capture path is permission-gated, trust-tagged, and confined; OCR degrades to a clear error when its feature is absent; and no capture crosses a trust boundary without the fork ritual.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` and `cargo check -p agiworkforce-desktop` pass; OCR paths verified with and without the `ocr` feature.
- [ ] Trust: Local capture stays on-device; a BYOK/Cloud send shows context selection, secret scan, payload preview (the image), provider label, and consent; captures never delta-sync.
- [ ] Security: no capture without OS screen-recording grant plus in-app approval; outputs confined to the app screenshots dir; dimensions and paths validated; annotation redaction strips underlying pixels.

## Anti-patterns

- Capturing the screen without an approval turn, or letting a prompt-injected LLM trigger `computer_use_capture_screen` silently.
- Auto-routing a Local screenshot, clipboard image, or OCR text to a BYOK or Managed-Cloud model without an explicit fork and payload preview.
- Claiming OCR, annotation, or vision-LLM analysis is shipped without its real repo path, or marking the default (no-`ocr`-feature) build as full OCR.
- Hardcoding a vision model ID instead of resolving from `packages/types/src/models.json`; referencing removed tiers (Plus/pro_plus/Hobby), inventing INR prices, or offering credit top-ups in any capture-related upsell.
- Referencing Supabase; using `middleware.ts` instead of `proxy.ts`; treating redaction as a visual overlay that leaves the secret in the pixel data.
