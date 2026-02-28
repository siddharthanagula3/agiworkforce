// H19 — Vision automation tests.
//
// `VisionAutomation` interacts with the screen (screen capture, OCR, image I/O)
// so all methods that require a running display are marked `#[ignore]`.
//
// What CAN be tested without a display:
//  • `VisionAutomation::new()` — creates the screenshot temp dir, no display needed
//  • The `template_match` method is private, but we can test the observable
//    behaviour of `find_text` with no OCR feature enabled (returns empty Vec)
//  • `search_text` (delegates to find_text) returns empty Vec without OCR
//  • `find_text_single` returns Err when no matches are found (no OCR)
//  • The types used by VisionAutomation: `ClickTarget`, `ScreenRegion` (from mod)
#[cfg(test)]
mod tests {
    use crate::core::agent::vision::VisionAutomation;
    use crate::core::agent::{ClickTarget, ScreenRegion};
    use std::time::Duration;

    // ------------------------------------------------------------------
    // VisionAutomation::new() — must not panic; creates temp dir
    // ------------------------------------------------------------------

    #[test]
    fn test_vision_automation_new_succeeds() {
        let vision = VisionAutomation::new();
        assert!(
            vision.is_ok(),
            "VisionAutomation::new() must succeed: {:?}",
            vision.err()
        );
    }

    // ------------------------------------------------------------------
    // find_text — without OCR feature, always returns empty Vec
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_find_text_without_ocr_returns_empty() {
        let vision = VisionAutomation::new().unwrap();
        // Without the 'ocr' feature flag the implementation returns Ok(Vec::new())
        let result = vision.find_text("Hello", false).await;
        assert!(
            result.is_ok(),
            "find_text must not error without OCR: {:?}",
            result.err()
        );
        assert!(
            result.unwrap().is_empty(),
            "find_text must return empty without OCR feature"
        );
    }

    #[tokio::test]
    async fn test_find_text_fuzzy_without_ocr_returns_empty() {
        let vision = VisionAutomation::new().unwrap();
        let result = vision.find_text("Submit", true).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // ------------------------------------------------------------------
    // search_text — delegates to find_text; empty without OCR
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_search_text_without_ocr_returns_empty() {
        let vision = VisionAutomation::new().unwrap();
        let result = vision.search_text("OK").await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    // ------------------------------------------------------------------
    // find_text_single — returns Err when no matches (no OCR)
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_find_text_single_without_ocr_returns_err() {
        let vision = VisionAutomation::new().unwrap();
        let result = vision.find_text_single("OK", false).await;
        assert!(
            result.is_err(),
            "find_text_single must return Err when no text is found"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("not found"),
            "Error must mention 'not found': {}",
            err_msg
        );
    }

    // ------------------------------------------------------------------
    // ScreenRegion — pure data type construction
    // ------------------------------------------------------------------

    #[test]
    fn test_screen_region_construction() {
        let r = ScreenRegion {
            x: 100,
            y: 200,
            width: 800,
            height: 600,
        };
        assert_eq!(r.x, 100);
        assert_eq!(r.y, 200);
        assert_eq!(r.width, 800);
        assert_eq!(r.height, 600);
    }

    #[test]
    fn test_screen_region_serde() {
        let r = ScreenRegion {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let json = serde_json::to_string(&r).unwrap();
        let decoded: ScreenRegion = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.width, 1920);
        assert_eq!(decoded.height, 1080);
    }

    // ------------------------------------------------------------------
    // ClickTarget — pure data type construction and serialisation
    // ------------------------------------------------------------------

    #[test]
    fn test_click_target_text_match_serde() {
        let t = ClickTarget::TextMatch {
            text: "Submit".to_string(),
            fuzzy: true,
        };
        let json = serde_json::to_string(&t).unwrap();
        let decoded: ClickTarget = serde_json::from_str(&json).unwrap();
        if let ClickTarget::TextMatch { text, fuzzy } = decoded {
            assert_eq!(text, "Submit");
            assert!(fuzzy);
        } else {
            panic!("Expected TextMatch");
        }
    }

    #[test]
    fn test_click_target_image_match_threshold_bounds() {
        let t = ClickTarget::ImageMatch {
            image_path: "/tmp/button.png".to_string(),
            threshold: 0.85,
        };
        if let ClickTarget::ImageMatch { threshold, .. } = &t {
            assert!(*threshold > 0.0 && *threshold <= 1.0);
        }
    }

    // ------------------------------------------------------------------
    // Tests that require a real display — marked #[ignore]
    // ------------------------------------------------------------------

    #[tokio::test]
    #[ignore] // Requires a running display / screen capture
    async fn test_capture_screenshot_primary_screen() {
        let vision = VisionAutomation::new().unwrap();
        let result = vision.capture_screenshot(None).await;
        assert!(
            result.is_ok(),
            "Should capture primary screen: {:?}",
            result.err()
        );
        let path = result.unwrap();
        assert!(
            std::path::Path::new(&path).exists(),
            "Screenshot file must exist"
        );
    }

    #[tokio::test]
    #[ignore] // Requires a running display
    async fn test_capture_screenshot_with_region() {
        let vision = VisionAutomation::new().unwrap();
        let region = ScreenRegion {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };
        let result = vision.capture_screenshot(Some(region)).await;
        assert!(result.is_ok(), "Should capture region: {:?}", result.err());
    }

    #[tokio::test]
    #[ignore] // Requires display + OCR feature
    async fn test_find_text_with_ocr_feature() {
        let vision = VisionAutomation::new().unwrap();
        // This would only find text if there is text on screen
        let result = vision.find_text("a", true).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    #[ignore] // Requires a running display
    async fn test_wait_for_element_times_out_quickly() {
        let vision = VisionAutomation::new().unwrap();
        let target = ClickTarget::TextMatch {
            text: "zxqyw_nonexistent_element_abc123".to_string(),
            fuzzy: false,
        };
        // Use a very short timeout so the test doesn't hang
        let result = vision
            .wait_for_element(&target, Duration::from_millis(100))
            .await;
        assert!(result.is_err(), "Must time out on missing element");
    }
}
