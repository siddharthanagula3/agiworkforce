use super::{AlternativeUseCase, UseCase, UseCaseDetection};
use std::collections::HashMap;

/// Detects the use case from a user prompt using keyword matching and pattern analysis
pub struct UseCaseDetector {
    keywords: HashMap<UseCase, Vec<&'static str>>,
}

impl UseCaseDetector {
    pub fn new() -> Self {
        let mut keywords = HashMap::new();

        // Automation keywords
        keywords.insert(
            UseCase::Automation,
            vec![
                "automate",
                "automation",
                "click",
                "type",
                "fill form",
                "navigate",
                "browse",
                "scrape",
                "extract",
                "workflow",
                "task",
                "schedule",
                "repeat",
                "loop",
                "monitor",
                "watch",
                "trigger",
                "action",
                "ui automation",
                "desktop automation",
                "web automation",
            ],
        );

        // Coding keywords
        keywords.insert(
            UseCase::Coding,
            vec![
                "code",
                "function",
                "class",
                "method",
                "implement",
                "refactor",
                "debug",
                "fix bug",
                "write code",
                "program",
                "script",
                "algorithm",
                "api",
                "endpoint",
                "database",
                "query",
                "test",
                "unit test",
                "integration test",
                "typescript",
                "javascript",
                "python",
                "rust",
                "java",
                "c++",
                "react",
                "vue",
                "angular",
                "nodejs",
                "backend",
                "frontend",
                "full stack",
                "microservice",
                "architecture",
                "design pattern",
            ],
        );

        // Document creation keywords
        keywords.insert(
            UseCase::DocumentCreation,
            vec![
                "write",
                "create document",
                "draft",
                "compose",
                "generate document",
                "report",
                "article",
                "essay",
                "blog post",
                "summary",
                "outline",
                "proposal",
                "presentation",
                "slides",
                "spreadsheet",
                "format",
                "template",
                "letter",
                "email",
                "memo",
                "documentation",
                "readme",
                "markdown",
                "word document",
                "pdf",
                "contract",
                "agreement",
            ],
        );

        // Search keywords
        keywords.insert(
            UseCase::Search,
            vec![
                "search",
                "find",
                "look up",
                "research",
                "what is",
                "who is",
                "when",
                "where",
                "how to",
                "explain",
                "tell me about",
                "information",
                "latest",
                "news",
                "current",
                "update",
                "facts",
                "data",
                "statistics",
                "compare",
                "difference between",
                "best",
                "top",
                "review",
                "recommendation",
            ],
        );

        // Image generation keywords
        keywords.insert(
            UseCase::ImageGen,
            vec![
                "image",
                "picture",
                "photo",
                "generate image",
                "create image",
                "draw",
                "illustrate",
                "design",
                "graphic",
                "art",
                "artwork",
                "visualization",
                "render",
                "3d",
                "2d",
                "icon",
                "logo",
                "banner",
                "thumbnail",
                "poster",
                "infographic",
                "diagram",
                "chart",
            ],
        );

        // Video generation keywords
        keywords.insert(
            UseCase::VideoGen,
            vec![
                "video",
                "generate video",
                "create video",
                "animate",
                "animation",
                "motion",
                "film",
                "movie",
                "clip",
                "footage",
                "scene",
                "sequence",
                "timelapse",
                "montage",
                "transition",
                "edit video",
                "video editing",
            ],
        );

        // General Q&A is the default fallback
        keywords.insert(UseCase::GeneralQA, vec![]);

        Self { keywords }
    }

    /// Detects the use case from a prompt
    pub fn detect(&self, prompt: &str) -> UseCaseDetection {
        let prompt_lower = prompt.to_lowercase();
        let mut scores: HashMap<UseCase, f64> = HashMap::new();
        let mut matched_keywords: HashMap<UseCase, Vec<String>> = HashMap::new();

        // Calculate scores for each use case based on keyword matches
        for (use_case, keywords_list) in &self.keywords {
            if *use_case == UseCase::GeneralQA {
                continue; // Skip GeneralQA for now, it's the fallback
            }

            let mut score = 0.0;
            let mut keywords_found = Vec::new();

            for keyword in keywords_list {
                if prompt_lower.contains(keyword) {
                    // Weight longer keywords more heavily
                    let weight = (keyword.len() as f64 / 5.0).min(2.0);
                    score += weight;
                    keywords_found.push(keyword.to_string());
                }
            }

            if score > 0.0 {
                scores.insert(*use_case, score);
                matched_keywords.insert(*use_case, keywords_found);
            }
        }

        // Normalize scores to confidence values (0-1)
        let max_score = scores.values().cloned().fold(0.0, f64::max);

        if max_score == 0.0 {
            // No keywords matched, default to GeneralQA
            return UseCaseDetection {
                use_case: UseCase::GeneralQA,
                confidence: 1.0,
                keywords: vec![],
                ambiguous: false,
                alternatives: None,
            };
        }

        // Normalize scores
        let mut normalized_scores: Vec<(UseCase, f64)> = scores
            .iter()
            .map(|(uc, score)| (*uc, score / max_score))
            .collect();

        // Sort by confidence (descending)
        normalized_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        let (primary_use_case, primary_confidence) = normalized_scores[0];
        let primary_keywords = matched_keywords
            .get(&primary_use_case)
            .cloned()
            .unwrap_or_default();

        // Check if ambiguous (multiple high-confidence detections)
        let ambiguous = normalized_scores.len() > 1 && normalized_scores[1].1 > 0.6;

        let alternatives = if ambiguous || normalized_scores.len() > 1 {
            Some(
                normalized_scores
                    .iter()
                    .skip(1)
                    .take(3) // Top 3 alternatives
                    .map(|(uc, conf)| AlternativeUseCase {
                        use_case: *uc,
                        confidence: *conf,
                    })
                    .collect(),
            )
        } else {
            None
        };

        UseCaseDetection {
            use_case: primary_use_case,
            confidence: primary_confidence,
            keywords: primary_keywords,
            ambiguous,
            alternatives,
        }
    }
}

impl Default for UseCaseDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coding_detection() {
        let detector = UseCaseDetector::new();
        let result = detector.detect("Write a function to sort an array in TypeScript");
        assert_eq!(result.use_case, UseCase::Coding);
        assert!(result.confidence > 0.7);
    }

    #[test]
    fn test_automation_detection() {
        let detector = UseCaseDetector::new();
        let result = detector.detect("Automate clicking the submit button on this website");
        assert_eq!(result.use_case, UseCase::Automation);
        assert!(result.confidence > 0.7);
    }

    #[test]
    fn test_search_detection() {
        let detector = UseCaseDetector::new();
        let result = detector.detect("What is the latest news about AI technology?");
        assert_eq!(result.use_case, UseCase::Search);
        assert!(result.confidence > 0.5);
    }

    #[test]
    fn test_document_creation_detection() {
        let detector = UseCaseDetector::new();
        let result = detector.detect("Write a professional email to my manager");
        assert_eq!(result.use_case, UseCase::DocumentCreation);
        assert!(result.confidence > 0.5);
    }

    #[test]
    fn test_image_gen_detection() {
        let detector = UseCaseDetector::new();
        let result = detector.detect("Generate an image of a sunset over mountains");
        assert_eq!(result.use_case, UseCase::ImageGen);
        assert!(result.confidence > 0.7);
    }

    #[test]
    fn test_general_qa_fallback() {
        let detector = UseCaseDetector::new();
        let result = detector.detect("Tell me a joke");
        assert_eq!(result.use_case, UseCase::GeneralQA);
    }
}
