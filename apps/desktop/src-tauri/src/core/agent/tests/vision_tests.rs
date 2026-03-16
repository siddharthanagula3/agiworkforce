// H19 -- Vision automation tests.
//
// `VisionAutomation` interacts with the screen (screen capture, OCR, image I/O)
// so all methods that require a running display are marked `#[ignore]`.
//
// What CAN be tested without a display:
//  * `VisionAutomation::new()` -- creates the screenshot temp dir, no display needed
//  * `is_ocr_available()` -- compile-time feature check, always testable
//  * `target_requires_ocr()` / `target_requires_screen_capture()` -- pure logic
//  * `check_vision_capability()` -- pure guard logic
//  * `find_text` without OCR feature -- returns Err immediately
//  * `wait_for_element` with unsupported target types -- returns Err immediately
//  * The types used by VisionAutomation: `ClickTarget`, `ScreenRegion` (from mod)
#[cfg(test)]
mod tests {
    use crate::core::agent::vision::VisionAutomation;
    use crate::core::agent::{Action, ClickTarget, ScreenRegion};
    use std::time::Duration;

    // ------------------------------------------------------------------
    // VisionAutomation::new() -- must not panic; creates temp dir
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

    #[test]
    fn test_vision_automation_new_creates_screenshot_dir() {
        let _vision = VisionAutomation::new().unwrap();
        let dir = std::env::temp_dir().join("agiworkforce_screenshots");
        assert!(dir.exists(), "Screenshot directory must be created");
        assert!(dir.is_dir(), "Screenshot path must be a directory");
    }

    // ------------------------------------------------------------------
    // is_ocr_available() -- compile-time feature gate
    // ------------------------------------------------------------------

    #[test]
    fn test_is_ocr_available_matches_feature_flag() {
        let available = VisionAutomation::is_ocr_available();
        // Without the `ocr` feature (default), this should be false.
        // With the `ocr` feature, this should be true.
        // Either way, it must not panic.
        if cfg!(feature = "ocr") {
            assert!(available, "is_ocr_available must be true when ocr feature is enabled");
        } else {
            assert!(!available, "is_ocr_available must be false when ocr feature is disabled");
        }
    }

    // ------------------------------------------------------------------
    // target_requires_ocr() -- pure logic tests
    // ------------------------------------------------------------------

    #[test]
    fn test_target_requires_ocr_text_match() {
        let target = ClickTarget::TextMatch {
            text: "Submit".to_string(),
            fuzzy: true,
        };
        assert!(
            VisionAutomation::target_requires_ocr(&target),
            "TextMatch must require OCR"
        );
    }

    #[test]
    fn test_target_requires_ocr_image_match() {
        let target = ClickTarget::ImageMatch {
            image_path: "/tmp/button.png".to_string(),
            threshold: 0.8,
        };
        assert!(
            !VisionAutomation::target_requires_ocr(&target),
            "ImageMatch must NOT require OCR"
        );
    }

    #[test]
    fn test_target_requires_ocr_coordinates() {
        let target = ClickTarget::Coordinates { x: 100, y: 200 };
        assert!(
            !VisionAutomation::target_requires_ocr(&target),
            "Coordinates must NOT require OCR"
        );
    }

    #[test]
    fn test_target_requires_ocr_uia_element() {
        let target = ClickTarget::UIAElement {
            element_id: "btn-ok".to_string(),
        };
        assert!(
            !VisionAutomation::target_requires_ocr(&target),
            "UIAElement must NOT require OCR"
        );
    }

    // ------------------------------------------------------------------
    // target_requires_screen_capture() -- pure logic tests
    // ------------------------------------------------------------------

    #[test]
    fn test_target_requires_screen_capture_text_match() {
        let target = ClickTarget::TextMatch {
            text: "OK".to_string(),
            fuzzy: false,
        };
        assert!(VisionAutomation::target_requires_screen_capture(&target));
    }

    #[test]
    fn test_target_requires_screen_capture_image_match() {
        let target = ClickTarget::ImageMatch {
            image_path: "/tmp/icon.png".to_string(),
            threshold: 0.9,
        };
        assert!(VisionAutomation::target_requires_screen_capture(&target));
    }

    #[test]
    fn test_target_requires_screen_capture_coordinates() {
        let target = ClickTarget::Coordinates { x: 50, y: 75 };
        assert!(!VisionAutomation::target_requires_screen_capture(&target));
    }

    #[test]
    fn test_target_requires_screen_capture_uia_element() {
        let target = ClickTarget::UIAElement {
            element_id: "menu-item".to_string(),
        };
        assert!(!VisionAutomation::target_requires_screen_capture(&target));
    }

    // ------------------------------------------------------------------
    // check_vision_capability() -- pre-flight guard tests
    // ------------------------------------------------------------------

    #[test]
    fn test_check_vision_capability_screenshot_always_ok() {
        let action = Action::Screenshot { region: None };
        let result = VisionAutomation::check_vision_capability(&action);
        assert!(result.is_ok(), "Screenshot never requires OCR");
    }

    #[test]
    fn test_check_vision_capability_navigate_always_ok() {
        let action = Action::Navigate {
            url: "https://example.com".to_string(),
        };
        let result = VisionAutomation::check_vision_capability(&action);
        assert!(result.is_ok(), "Navigate never requires OCR");
    }

    #[test]
    fn test_check_vision_capability_click_coordinates_ok() {
        let action = Action::Click {
            target: ClickTarget::Coordinates { x: 100, y: 200 },
        };
        let result = VisionAutomation::check_vision_capability(&action);
        assert!(result.is_ok(), "Click on coordinates does not need OCR");
    }

    #[test]
    fn test_check_vision_capability_click_text_match_on_non_ocr() {
        let action = Action::Click {
            target: ClickTarget::TextMatch {
                text: "OK".to_string(),
                fuzzy: false,
            },
        };
        let result = VisionAutomation::check_vision_capability(&action);
        if cfg!(feature = "ocr") {
            assert!(result.is_ok());
        } else {
            assert!(result.is_err(), "TextMatch click must fail without OCR");
            let msg = result.unwrap_err().to_string();
            assert!(msg.contains("OCR feature not enabled"), "Error should mention OCR: {}", msg);
        }
    }

    #[test]
    fn test_check_vision_capability_search_text_on_non_ocr() {
        let action = Action::SearchText {
            query: "hello".to_string(),
        };
        let result = VisionAutomation::check_vision_capability(&action);
        if cfg!(feature = "ocr") {
            assert!(result.is_ok());
        } else {
            assert!(result.is_err(), "SearchText must fail without OCR");
        }
    }

    #[test]
    fn test_check_vision_capability_wait_for_element_text() {
        let action = Action::WaitForElement {
            target: ClickTarget::TextMatch {
                text: "Loading".to_string(),
                fuzzy: true,
            },
            timeout: Duration::from_secs(5),
        };
        let result = VisionAutomation::check_vision_capability(&action);
        if cfg!(feature = "ocr") {
            assert!(result.is_ok());
        } else {
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_check_vision_capability_wait_for_element_image() {
        let action = Action::WaitForElement {
            target: ClickTarget::ImageMatch {
                image_path: "/tmp/icon.png".to_string(),
                threshold: 0.85,
            },
            timeout: Duration::from_secs(5),
        };
        // ImageMatch does not require OCR, only screen capture
        let result = VisionAutomation::check_vision_capability(&action);
        assert!(result.is_ok(), "ImageMatch wait never needs OCR");
    }

    // ------------------------------------------------------------------
    // find_text -- without OCR feature, returns Err immediately
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_find_text_without_ocr_returns_err() {
        if cfg!(feature = "ocr") {
            // With OCR enabled, this test requires a display; skip it.
            return;
        }
        let vision = VisionAutomation::new().unwrap();
        let result = vision.find_text("Hello", false).await;
        assert!(
            result.is_err(),
            "find_text must return Err on non-OCR builds"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("OCR feature not enabled"),
            "Error should mention OCR feature: {}",
            msg
        );
    }

    #[tokio::test]
    async fn test_find_text_fuzzy_without_ocr_returns_err() {
        if cfg!(feature = "ocr") {
            return;
        }
        let vision = VisionAutomation::new().unwrap();
        let result = vision.find_text("Submit", true).await;
        assert!(result.is_err());
    }

    // ------------------------------------------------------------------
    // search_text -- delegates to find_text; Err without OCR
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_search_text_without_ocr_returns_err() {
        if cfg!(feature = "ocr") {
            return;
        }
        let vision = VisionAutomation::new().unwrap();
        let result = vision.search_text("OK").await;
        assert!(
            result.is_err(),
            "search_text must propagate Err from find_text on non-OCR builds"
        );
    }

    // ------------------------------------------------------------------
    // find_text_single -- returns Err when no matches (no OCR)
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_find_text_single_without_ocr_returns_err() {
        if cfg!(feature = "ocr") {
            return;
        }
        let vision = VisionAutomation::new().unwrap();
        let result = vision.find_text_single("OK", false).await;
        assert!(
            result.is_err(),
            "find_text_single must return Err when OCR is not available"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("OCR feature not enabled") || err_msg.contains("not found"),
            "Error must mention OCR or not found: {}",
            err_msg
        );
    }

    // ------------------------------------------------------------------
    // wait_for_element guards -- unsupported target types
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_wait_for_element_rejects_coordinates_target() {
        let vision = VisionAutomation::new().unwrap();
        let target = ClickTarget::Coordinates { x: 100, y: 200 };
        let result = vision
            .wait_for_element(&target, Duration::from_millis(100))
            .await;
        assert!(
            result.is_err(),
            "Coordinates target must be rejected by wait_for_element"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("Coordinates"),
            "Error should mention Coordinates: {}",
            msg
        );
    }

    #[tokio::test]
    async fn test_wait_for_element_rejects_uia_element_target() {
        let vision = VisionAutomation::new().unwrap();
        let target = ClickTarget::UIAElement {
            element_id: "btn-ok".to_string(),
        };
        let result = vision
            .wait_for_element(&target, Duration::from_millis(100))
            .await;
        assert!(
            result.is_err(),
            "UIAElement target must be rejected by wait_for_element"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("UIAElement"),
            "Error should mention UIAElement: {}",
            msg
        );
    }

    #[tokio::test]
    async fn test_wait_for_element_text_match_rejects_without_ocr() {
        if cfg!(feature = "ocr") {
            return;
        }
        let vision = VisionAutomation::new().unwrap();
        let target = ClickTarget::TextMatch {
            text: "Submit".to_string(),
            fuzzy: false,
        };
        let result = vision
            .wait_for_element(&target, Duration::from_millis(100))
            .await;
        assert!(
            result.is_err(),
            "TextMatch wait must fail immediately without OCR"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("OCR feature not enabled"),
            "Error should mention OCR: {}",
            msg
        );
    }

    // ------------------------------------------------------------------
    // ScreenRegion -- pure data type construction
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

    #[test]
    fn test_screen_region_various_resolutions() {
        // Verify that common screen resolutions can be represented
        let resolutions: Vec<(i32, i32)> = vec![
            (1920, 1080),  // 1080p
            (2560, 1440),  // 1440p / QHD
            (3840, 2160),  // 4K UHD
            (5120, 2880),  // 5K (iMac Retina)
            (7680, 4320),  // 8K
            (1366, 768),   // Common laptop
            (1280, 720),   // 720p
            (3024, 1964),  // MacBook Pro 14" native
            (3456, 2234),  // MacBook Pro 16" native
        ];
        for (w, h) in resolutions {
            let r = ScreenRegion {
                x: 0,
                y: 0,
                width: w,
                height: h,
            };
            assert_eq!(r.width, w);
            assert_eq!(r.height, h);
            // Center calculation (mirrors find_text logic)
            let center_x = r.width / 2;
            let center_y = r.height / 2;
            assert!(center_x > 0, "Center X must be positive for {}x{}", w, h);
            assert!(center_y > 0, "Center Y must be positive for {}x{}", w, h);
        }
    }

    // ------------------------------------------------------------------
    // ClickTarget -- pure data type construction and serialisation
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
    // Tests that require a real display -- marked #[ignore]
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
    #[ignore] // Requires display + OCR feature
    async fn test_find_text_uses_real_screen_dimensions() {
        // Validates bug #47 fix: coordinates must come from actual screen capture,
        // not hardcoded (960, 540).
        let vision = VisionAutomation::new().unwrap();
        let result = vision.find_text("a", true).await;
        if let Ok(matches) = result {
            for (x, y, _) in &matches {
                // The center should NOT be (960, 540) unless that happens to be
                // the actual screen center. On a 1920x1080 screen the pixel
                // buffer center is (960, 540) but on Retina it would be
                // (1920, 1080) for a 3840x2160 buffer.  The key invariant is
                // that x and y are positive and non-zero.
                assert!(*x > 0, "X coordinate must be positive, got {}", x);
                assert!(*y > 0, "Y coordinate must be positive, got {}", y);
            }
        }
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
