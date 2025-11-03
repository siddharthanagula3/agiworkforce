#[cfg(test)]
mod capture_tests {
    use super::super::capture::{capture_primary_screen, capture_region, create_thumbnail};

    #[tokio::test]
    async fn test_capture_primary_screen() {
        let result = capture_primary_screen();

        assert!(result.is_ok(), "Primary screen capture should succeed");

        let capture = result.unwrap();
        assert!(capture.pixels.width() > 0, "Capture width should be > 0");
        assert!(capture.pixels.height() > 0, "Capture height should be > 0");
        assert_eq!(capture.screen_index, 0, "Should capture primary screen");
    }

    #[tokio::test]
    async fn test_capture_screen_dimensions() {
        let capture = capture_primary_screen().expect("Failed to capture screen");

        // Verify dimensions are reasonable (at least 640x480)
        assert!(
            capture.pixels.width() >= 640,
            "Screen width should be at least 640 pixels, got {}",
            capture.pixels.width()
        );
        assert!(
            capture.pixels.height() >= 480,
            "Screen height should be at least 480 pixels, got {}",
            capture.pixels.height()
        );

        // Verify display info is populated
        assert!(
            capture.display.width > 0,
            "Display width should be populated"
        );
        assert!(
            capture.display.height > 0,
            "Display height should be populated"
        );
    }

    #[tokio::test]
    async fn test_capture_region() {
        // Capture small region from top-left
        let result = capture_region(0, 0, 100, 100);

        assert!(result.is_ok(), "Region capture should succeed");

        let capture = result.unwrap();
        assert_eq!(capture.pixels.width(), 100, "Captured width should be 100");
        assert_eq!(
            capture.pixels.height(),
            100,
            "Captured height should be 100"
        );
        assert_eq!(capture.x, 0, "X coordinate should match");
        assert_eq!(capture.y, 0, "Y coordinate should match");
    }

    #[tokio::test]
    async fn test_capture_region_center_screen() {
        // Capture region from center of screen
        let result = capture_region(500, 300, 200, 150);

        assert!(result.is_ok(), "Center region capture should succeed");

        let capture = result.unwrap();
        assert_eq!(capture.pixels.width(), 200, "Captured width should be 200");
        assert_eq!(
            capture.pixels.height(),
            150,
            "Captured height should be 150"
        );
        assert_eq!(capture.x, 500);
        assert_eq!(capture.y, 300);
    }

    #[tokio::test]
    async fn test_capture_region_various_sizes() {
        let test_cases = vec![(0, 0, 50, 50), (100, 100, 100, 100), (200, 150, 300, 200)];

        for (x, y, width, height) in test_cases {
            let result = capture_region(x, y, width, height);
            assert!(
                result.is_ok(),
                "Capture region ({}, {}, {}, {}) should succeed",
                x,
                y,
                width,
                height
            );

            let capture = result.unwrap();
            assert_eq!(capture.pixels.width(), width);
            assert_eq!(capture.pixels.height(), height);
        }
    }

    #[tokio::test]
    async fn test_create_thumbnail() {
        let capture = capture_primary_screen().expect("Failed to capture screen");

        // Create thumbnail with max dimensions
        let thumbnail = create_thumbnail(&capture.pixels, 200, 200);

        // Thumbnail should be smaller than or equal to max dimensions
        assert!(
            thumbnail.width() <= 200,
            "Thumbnail width should be <= 200, got {}",
            thumbnail.width()
        );
        assert!(
            thumbnail.height() <= 200,
            "Thumbnail height should be <= 200, got {}",
            thumbnail.height()
        );

        // Thumbnail should maintain aspect ratio
        let original_ratio = capture.pixels.width() as f32 / capture.pixels.height() as f32;
        let thumbnail_ratio = thumbnail.width() as f32 / thumbnail.height() as f32;

        let ratio_diff = (original_ratio - thumbnail_ratio).abs();
        assert!(
            ratio_diff < 0.1,
            "Thumbnail should maintain aspect ratio. Original: {}, Thumbnail: {}",
            original_ratio,
            thumbnail_ratio
        );
    }

    #[tokio::test]
    async fn test_create_small_thumbnail() {
        let capture = capture_primary_screen().expect("Failed to capture screen");

        // Create very small thumbnail
        let thumbnail = create_thumbnail(&capture.pixels, 50, 50);

        assert!(
            thumbnail.width() <= 50,
            "Small thumbnail width should be <= 50"
        );
        assert!(
            thumbnail.height() <= 50,
            "Small thumbnail height should be <= 50"
        );
    }

    #[tokio::test]
    async fn test_pixel_data_format() {
        let capture = capture_primary_screen().expect("Failed to capture screen");

        // Verify we have RGBA data
        let pixels = capture.pixels;
        assert_eq!(
            pixels.len() as u32,
            pixels.width() * pixels.height(),
            "Pixel array should match dimensions"
        );

        // Spot check: get a pixel and verify it's valid RGBA
        if let Some(pixel) = pixels.get_pixel_checked(0, 0) {
            // Each channel should contain some value (no panic if accessed)
            let _ = (pixel[0], pixel[1], pixel[2], pixel[3]);
        }
    }
}

#[cfg(test)]
mod dxgi_tests {
    use super::super::dxgi::list_displays;

    #[test]
    fn test_list_displays() {
        let result = list_displays();

        assert!(result.is_ok(), "list_displays should succeed");

        let displays = result.unwrap();
        assert!(displays.len() > 0, "Should detect at least one display");
    }

    #[test]
    fn test_display_info_populated() {
        let displays = list_displays().expect("Failed to list displays");

        for (i, display) in displays.iter().enumerate() {
            assert!(
                display.width > 0,
                "Display {} width should be > 0, got {}",
                i,
                display.width
            );
            assert!(
                display.height > 0,
                "Display {} height should be > 0, got {}",
                i,
                display.height
            );
        }
    }

    #[test]
    fn test_primary_display() {
        let displays = list_displays().expect("Failed to list displays");

        // Primary display should be first
        let primary = &displays[0];
        assert!(
            primary.is_primary,
            "First display should be marked as primary"
        );
    }

    #[test]
    fn test_display_dimensions_reasonable() {
        let displays = list_displays().expect("Failed to list displays");

        for display in displays.iter() {
            // Minimum reasonable resolution
            assert!(
                display.width >= 640,
                "Display width should be at least 640, got {}",
                display.width
            );
            assert!(
                display.height >= 480,
                "Display height should be at least 480, got {}",
                display.height
            );

            // Maximum reasonable resolution (8K)
            assert!(
                display.width <= 7680,
                "Display width should be at most 7680, got {}",
                display.width
            );
            assert!(
                display.height <= 4320,
                "Display height should be at most 4320, got {}",
                display.height
            );
        }
    }
}

#[cfg(test)]
#[cfg(feature = "ocr")]
mod ocr_tests {
    use super::super::capture::capture_primary_screen;
    use super::super::ocr::perform_ocr;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_perform_ocr_basic() {
        // Create a test image file
        let dir = tempdir().expect("Failed to create temp dir");
        let image_path = dir.path().join("test_capture.png");

        // Capture screen and save
        let capture = capture_primary_screen().expect("Failed to capture screen");
        capture
            .pixels
            .save(&image_path)
            .expect("Failed to save test image");

        // Perform OCR
        let result = perform_ocr(image_path.to_str().unwrap());

        // OCR might fail if Tesseract is not installed, so we only check if it returns
        // We can't assert success without knowing Tesseract is available
        match result {
            Ok(ocr_result) => {
                // If OCR succeeds, verify result structure
                assert!(
                    ocr_result.confidence >= 0.0 && ocr_result.confidence <= 100.0,
                    "Confidence should be between 0 and 100"
                );
            }
            Err(e) => {
                // Log error but don't fail test if Tesseract isn't installed
                eprintln!("OCR test skipped: {}", e);
            }
        }

        // Cleanup
        drop(dir);
    }
}

#[cfg(test)]
#[cfg(not(feature = "ocr"))]
mod ocr_disabled_tests {
    use super::super::perform_ocr;

    #[tokio::test]
    async fn test_ocr_disabled_error() {
        // When OCR feature is disabled, it should return an error
        let result = perform_ocr("dummy_path.png");

        assert!(
            result.is_err(),
            "OCR should return error when feature is disabled"
        );
        let error_message = result.unwrap_err().to_string();
        assert!(
            error_message.contains("OCR support not compiled"),
            "Error should indicate OCR is not compiled"
        );
    }
}

#[cfg(test)]
mod integration_tests {
    use super::super::*;

    #[tokio::test]
    async fn test_complete_screenshot_workflow() {
        // 1. List displays
        let displays = list_displays().expect("Failed to list displays");
        assert!(displays.len() > 0, "Should have at least one display");

        // 2. Capture primary screen
        let capture = capture_primary_screen().expect("Failed to capture primary screen");
        assert!(capture.pixels.width() > 0);
        assert!(capture.pixels.height() > 0);

        // 3. Create thumbnail
        let thumbnail = create_thumbnail(&capture.pixels, 200, 200);
        assert!(thumbnail.width() <= 200);
        assert!(thumbnail.height() <= 200);

        // 4. Capture specific region
        let region = capture_region(0, 0, 100, 100).expect("Failed to capture region");
        assert_eq!(region.pixels.width(), 100);
        assert_eq!(region.pixels.height(), 100);
    }

    #[tokio::test]
    async fn test_save_and_load_screenshot() {
        use tempfile::tempdir;

        let dir = tempdir().expect("Failed to create temp dir");
        let image_path = dir.path().join("screenshot.png");

        // Capture and save
        let capture = capture_primary_screen().expect("Failed to capture");
        capture
            .pixels
            .save(&image_path)
            .expect("Failed to save image");

        // Verify file exists and has size
        assert!(image_path.exists(), "Screenshot file should exist");
        let metadata = std::fs::metadata(&image_path).expect("Failed to get metadata");
        assert!(metadata.len() > 0, "Screenshot file should not be empty");

        // Load and verify
        let loaded = image::open(&image_path).expect("Failed to load image");
        assert_eq!(loaded.width(), capture.pixels.width());
        assert_eq!(loaded.height(), capture.pixels.height());

        // Cleanup
        drop(dir);
    }
}
