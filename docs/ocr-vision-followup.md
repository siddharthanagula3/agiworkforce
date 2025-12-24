## OCR/Vision Follow-up (Non-shipping Path)

Context:

- `cargo test` and `cargo clippy --all-targets` pass cleanly for the current shipping configuration (OCR feature disabled).
- `cargo clippy --all-targets --all-features` reports issues only under the optional OCR/vision path (the `ocr` feature, including `core/agent/vision.rs`).
- This path does not affect billing, Supabase/Stripe flows, or production builds for web/desktop today.

Requested follow-up (low priority):

- When we decide to rely on or ship the OCR/vision feature:
  - Align the tesseract/leptonica bindings and usage under the `ocr` feature with the latest upstream APIs.
  - Update `core/agent/vision.rs` and any related modules so that `cargo clippy --all-targets --all-features` passes without warnings.
  - Keep the default (non-`ocr`) configuration green for `cargo test` and `cargo clippy --all-targets` at all times.

Notes:

- Treat this as a low-priority enhancement until OCR/vision becomes part of the supported surface area.
- See CI config in `.github/workflows/ci.yml` for how the main and all-features clippy jobs are wired.
