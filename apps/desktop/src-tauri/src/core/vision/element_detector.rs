//! Element Detector - Heuristic-based element detection to supplement vision models

use super::*;

/// Heuristic detector for common UI patterns
pub struct ElementDetector {
    /// Minimum confidence threshold
    min_confidence: f32,
}

impl ElementDetector {
    pub fn new() -> Self {
        Self {
            min_confidence: 0.5,
        }
    }

    pub fn with_confidence(min_confidence: f32) -> Self {
        Self { min_confidence }
    }

    /// Merge and deduplicate elements from multiple sources
    pub fn merge_elements(
        &self,
        vision_elements: Vec<DetectedElement>,
        heuristic_elements: Vec<DetectedElement>,
    ) -> Vec<DetectedElement> {
        let mut merged = vision_elements;

        for heuristic in heuristic_elements {
            // Check if this element overlaps significantly with any existing element
            let overlaps = merged.iter().any(|existing| {
                self.calculate_overlap(&existing.bounds, &heuristic.bounds) > 0.5
            });

            if !overlaps {
                merged.push(heuristic);
            }
        }

        // Sort by position (top-left to bottom-right)
        merged.sort_by(|a, b| {
            let a_score = a.bounds.y * 10000 + a.bounds.x;
            let b_score = b.bounds.y * 10000 + b.bounds.x;
            a_score.cmp(&b_score)
        });

        merged
    }

    /// Calculate overlap ratio between two bounding boxes
    fn calculate_overlap(&self, a: &BoundingBox, b: &BoundingBox) -> f32 {
        let x_overlap = (a.x + a.width).min(b.x + b.width) - a.x.max(b.x);
        let y_overlap = (a.y + a.height).min(b.y + b.height) - a.y.max(b.y);

        if x_overlap <= 0 || y_overlap <= 0 {
            return 0.0;
        }

        let intersection = x_overlap * y_overlap;
        let union = a.area() + b.area() - intersection;

        if union <= 0 {
            return 0.0;
        }

        intersection as f32 / union as f32
    }

    /// Group elements by their spatial relationship
    pub fn group_by_proximity(&self, elements: &[DetectedElement], threshold: i32) -> Vec<Vec<&DetectedElement>> {
        if elements.is_empty() {
            return vec![];
        }

        let mut groups: Vec<Vec<&DetectedElement>> = vec![];
        let mut assigned: Vec<bool> = vec![false; elements.len()];

        for (i, element) in elements.iter().enumerate() {
            if assigned[i] {
                continue;
            }

            let mut group = vec![element];
            assigned[i] = true;

            for (j, other) in elements.iter().enumerate() {
                if !assigned[j] && self.is_nearby(element, other, threshold) {
                    group.push(other);
                    assigned[j] = true;
                }
            }

            groups.push(group);
        }

        groups
    }

    /// Check if two elements are within threshold distance
    fn is_nearby(&self, a: &DetectedElement, b: &DetectedElement, threshold: i32) -> bool {
        let a_center = a.bounds.center();
        let b_center = b.bounds.center();

        let dx = (a_center.x - b_center.x).abs();
        let dy = (a_center.y - b_center.y).abs();

        dx <= threshold && dy <= threshold
    }

    /// Identify form groups (label + input pairs)
    pub fn identify_form_groups<'a>(
        &self,
        elements: &'a [DetectedElement],
    ) -> Vec<FormGroup<'a>> {
        let mut groups = vec![];

        let labels: Vec<_> = elements
            .iter()
            .filter(|e| matches!(e.element_type, ElementType::Text | ElementType::Heading))
            .collect();

        let inputs: Vec<_> = elements
            .iter()
            .filter(|e| e.is_input)
            .collect();

        for input in inputs {
            // Find the closest label that's above or to the left
            let mut best_label: Option<&DetectedElement> = None;
            let mut best_distance = i32::MAX;

            for label in &labels {
                // Label should be above or to the left of input
                let is_above = label.bounds.y + label.bounds.height <= input.bounds.y + 10;
                let is_left = label.bounds.x + label.bounds.width <= input.bounds.x + 10;

                if is_above || is_left {
                    let label_center = label.bounds.center();
                    let input_center = input.bounds.center();

                    let distance = ((label_center.x - input_center.x).pow(2)
                        + (label_center.y - input_center.y).pow(2)) as f64;
                    let distance = distance.sqrt() as i32;

                    if distance < best_distance && distance < 200 {
                        best_distance = distance;
                        best_label = Some(label);
                    }
                }
            }

            groups.push(FormGroup {
                label: best_label,
                input,
            });
        }

        groups
    }

    /// Find navigation elements (typically at top or left side)
    pub fn find_navigation<'a>(&self, elements: &'a [DetectedElement]) -> Vec<&'a DetectedElement> {
        elements
            .iter()
            .filter(|e| {
                matches!(
                    e.element_type,
                    ElementType::Navigation | ElementType::Menu | ElementType::Tab
                ) || (e.is_clickable && (e.bounds.y < 100 || e.bounds.x < 100))
            })
            .collect()
    }

    /// Find main content area elements
    pub fn find_main_content<'a>(
        &self,
        elements: &'a [DetectedElement],
        screen_width: u32,
        screen_height: u32,
    ) -> Vec<&'a DetectedElement> {
        // Main content is typically in the center region
        let margin_x = (screen_width as i32) / 6;
        let margin_y = 100; // Skip header area

        elements
            .iter()
            .filter(|e| {
                e.bounds.x > margin_x
                    && e.bounds.x < (screen_width as i32 - margin_x)
                    && e.bounds.y > margin_y
            })
            .collect()
    }
}

impl Default for ElementDetector {
    fn default() -> Self {
        Self::new()
    }
}

/// A form group consisting of a label and its associated input
#[derive(Debug)]
pub struct FormGroup<'a> {
    pub label: Option<&'a DetectedElement>,
    pub input: &'a DetectedElement,
}

impl<'a> FormGroup<'a> {
    pub fn get_label_text(&self) -> Option<&str> {
        self.label.map(|l| l.label.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn create_element(id: &str, x: i32, y: i32, w: i32, h: i32, is_input: bool) -> DetectedElement {
        DetectedElement {
            id: id.to_string(),
            element_type: if is_input { ElementType::TextInput } else { ElementType::Text },
            label: id.to_string(),
            bounds: BoundingBox::new(x, y, w, h),
            center: Point::new(x + w / 2, y + h / 2),
            confidence: 0.9,
            is_clickable: false,
            is_input,
            attributes: HashMap::new(),
        }
    }

    #[test]
    fn test_calculate_overlap() {
        let detector = ElementDetector::new();

        let a = BoundingBox::new(0, 0, 100, 100);
        let b = BoundingBox::new(50, 50, 100, 100);

        let overlap = detector.calculate_overlap(&a, &b);
        assert!(overlap > 0.0 && overlap < 1.0);

        let c = BoundingBox::new(200, 200, 50, 50);
        assert_eq!(detector.calculate_overlap(&a, &c), 0.0);
    }

    #[test]
    fn test_identify_form_groups() {
        let detector = ElementDetector::new();

        let elements = vec![
            create_element("Email:", 10, 10, 50, 20, false),
            create_element("email_input", 10, 35, 200, 30, true),
            create_element("Password:", 10, 80, 70, 20, false),
            create_element("password_input", 10, 105, 200, 30, true),
        ];

        let groups = detector.identify_form_groups(&elements);
        assert_eq!(groups.len(), 2);

        assert!(groups[0].label.is_some());
        assert_eq!(groups[0].label.unwrap().id, "Email:");
    }
}
