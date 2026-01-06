//! Screenshot Analyzer - High-level analysis functions

use super::*;
use anyhow::Result;

/// Analyze a screenshot and return clickable elements
pub async fn find_clickable_elements(
    service: &VisionService,
    image_data: &str,
    width: u32,
    height: u32,
) -> Result<Vec<DetectedElement>> {
    let request = AnalysisRequest {
        image_data: image_data.to_string(),
        width,
        height,
        context: Some("Find all clickable and interactive elements".to_string()),
        detect_elements: true,
        extract_text: false,
        region: None,
    };

    let analysis = service.analyze_screenshot(request).await?;
    Ok(analysis
        .elements
        .into_iter()
        .filter(|e| e.is_clickable)
        .collect())
}

/// Find input fields on the screen
pub async fn find_input_fields(
    service: &VisionService,
    image_data: &str,
    width: u32,
    height: u32,
) -> Result<Vec<DetectedElement>> {
    let request = AnalysisRequest {
        image_data: image_data.to_string(),
        width,
        height,
        context: Some("Find all text input fields, textareas, and form inputs".to_string()),
        detect_elements: true,
        extract_text: false,
        region: None,
    };

    let analysis = service.analyze_screenshot(request).await?;
    Ok(analysis
        .elements
        .into_iter()
        .filter(|e| e.is_input)
        .collect())
}

/// Extract all visible text from screenshot
pub async fn extract_text(
    service: &VisionService,
    image_data: &str,
    width: u32,
    height: u32,
) -> Result<Vec<TextBlock>> {
    let request = AnalysisRequest {
        image_data: image_data.to_string(),
        width,
        height,
        context: None,
        detect_elements: false,
        extract_text: true,
        region: None,
    };

    let analysis = service.analyze_screenshot(request).await?;
    Ok(analysis.text_content)
}

/// Find element at specific coordinates
pub fn find_element_at_position(
    elements: &[DetectedElement],
    point: Point,
) -> Option<&DetectedElement> {
    elements
        .iter()
        .filter(|e| e.bounds.contains(&point))
        .min_by_key(|e| e.bounds.area()) // Return smallest element (most specific)
}

/// Find elements by type
pub fn filter_by_type(elements: &[DetectedElement], element_type: ElementType) -> Vec<&DetectedElement> {
    elements
        .iter()
        .filter(|e| e.element_type == element_type)
        .collect()
}

/// Find elements matching a text pattern
pub fn find_by_text(elements: &[DetectedElement], pattern: &str) -> Vec<&DetectedElement> {
    let pattern_lower = pattern.to_lowercase();
    elements
        .iter()
        .filter(|e| e.label.to_lowercase().contains(&pattern_lower))
        .collect()
}

/// Suggest the best click target for a given action description
pub fn suggest_click_target<'a>(
    elements: &'a [DetectedElement],
    action_description: &str,
) -> Option<&'a DetectedElement> {
    let desc_lower = action_description.to_lowercase();

    // Score each element based on relevance
    let mut best_match: Option<(&DetectedElement, f32)> = None;

    for element in elements.iter().filter(|e| e.is_clickable) {
        let label_lower = element.label.to_lowercase();
        let mut score = 0.0;

        // Exact match
        if label_lower == desc_lower {
            score = 1.0;
        }
        // Contains match
        else if label_lower.contains(&desc_lower) || desc_lower.contains(&label_lower) {
            score = 0.8;
        }
        // Word match
        else {
            let desc_words: Vec<&str> = desc_lower.split_whitespace().collect();
            let label_words: Vec<&str> = label_lower.split_whitespace().collect();

            let matching_words = desc_words
                .iter()
                .filter(|w| label_words.iter().any(|lw| lw.contains(*w) || w.contains(lw)))
                .count();

            if matching_words > 0 {
                score = 0.5 * (matching_words as f32 / desc_words.len().max(1) as f32);
            }
        }

        // Boost score based on element confidence
        score *= element.confidence;

        if score > best_match.map(|(_, s)| s).unwrap_or(0.0) {
            best_match = Some((element, score));
        }
    }

    best_match.filter(|(_, score)| *score > 0.3).map(|(e, _)| e)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn create_test_element(id: &str, label: &str, clickable: bool) -> DetectedElement {
        DetectedElement {
            id: id.to_string(),
            element_type: ElementType::Button,
            label: label.to_string(),
            bounds: BoundingBox::new(0, 0, 100, 30),
            center: Point::new(50, 15),
            confidence: 0.9,
            is_clickable: clickable,
            is_input: false,
            attributes: HashMap::new(),
        }
    }

    #[test]
    fn test_find_by_text() {
        let elements = vec![
            create_test_element("1", "Submit Button", true),
            create_test_element("2", "Cancel", true),
            create_test_element("3", "Submit Form", true),
        ];

        let results = find_by_text(&elements, "submit");
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_suggest_click_target() {
        let elements = vec![
            create_test_element("1", "Submit", true),
            create_test_element("2", "Cancel", true),
            create_test_element("3", "OK", true),
        ];

        let result = suggest_click_target(&elements, "click submit");
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "1");
    }
}
