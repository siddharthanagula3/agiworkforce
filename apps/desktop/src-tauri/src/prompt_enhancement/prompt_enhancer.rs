use super::{
    Complexity, EnhancedPrompt, EnhancementMetadata, PromptContext, UseCase, UseCaseDetection,
};
use crate::prompt_enhancement::api_router::APIRouter;

/// Enhances prompts based on detected use case
pub struct PromptEnhancer {
    router: APIRouter,
}

impl PromptEnhancer {
    pub fn new() -> Self {
        Self {
            router: APIRouter::new(),
        }
    }

    /// Enhances a prompt based on its detected use case
    pub fn enhance(&self, original_prompt: &str, detection: &UseCaseDetection) -> EnhancedPrompt {
        let enhanced_text = match detection.use_case {
            UseCase::Automation => self.enhance_automation(original_prompt),
            UseCase::Coding => self.enhance_coding(original_prompt),
            UseCase::DocumentCreation => self.enhance_document_creation(original_prompt),
            UseCase::Search => self.enhance_search(original_prompt),
            UseCase::ImageGen => self.enhance_image_gen(original_prompt),
            UseCase::VideoGen => self.enhance_video_gen(original_prompt),
            UseCase::GeneralQA => self.enhance_general_qa(original_prompt),
        };

        let context = self.extract_context(original_prompt, detection.use_case);
        let suggested_provider = self.router.suggest_provider(detection.use_case, &context);

        let tokens_added =
            (enhanced_text.len() as i32 - original_prompt.len() as i32).max(0) as u32 / 4;

        EnhancedPrompt {
            original: original_prompt.to_string(),
            enhanced: enhanced_text,
            use_case: detection.use_case,
            confidence: detection.confidence,
            suggested_provider,
            context: Some(context),
            metadata: Some(EnhancementMetadata {
                tokens_added: Some(tokens_added),
                enhancement_reason: Some(self.get_enhancement_reason(detection.use_case)),
                alternative_providers: Some(self.router.get_fallback_providers(detection.use_case)),
            }),
        }
    }

    fn enhance_automation(&self, prompt: &str) -> String {
        format!(
            "Task: Desktop/Web Automation\n\n{}\n\nPlease provide step-by-step instructions for this automation task. \
            Consider edge cases, error handling, and timing issues. If applicable, suggest selectors or UI elements to target.",
            prompt
        )
    }

    fn enhance_coding(&self, prompt: &str) -> String {
        format!(
            "Coding Task:\n\n{}\n\nProvide clean, well-documented code with:\n\
            - Proper error handling\n\
            - Type safety (if applicable)\n\
            - Comments explaining complex logic\n\
            - Best practices for the language/framework\n\
            - Consideration for edge cases",
            prompt
        )
    }

    fn enhance_document_creation(&self, prompt: &str) -> String {
        format!(
            "Document Creation Task:\n\n{}\n\nGenerate a well-structured document with:\n\
            - Clear formatting and organization\n\
            - Professional tone\n\
            - Proper grammar and spelling\n\
            - Appropriate length and detail\n\
            - Relevant sections and headings",
            prompt
        )
    }

    fn enhance_search(&self, prompt: &str) -> String {
        format!(
            "Search Query:\n\n{}\n\nProvide a comprehensive answer with:\n\
            - Up-to-date information\n\
            - Multiple reliable sources\n\
            - Citations or references\n\
            - Factual accuracy\n\
            - Different perspectives if applicable",
            prompt
        )
    }

    fn enhance_image_gen(&self, prompt: &str) -> String {
        format!(
            "Image Generation:\n\n{}\n\nGenerate an image with these characteristics:\n\
            - High quality and detail\n\
            - Appropriate style and composition\n\
            - Correct proportions and perspective\n\
            - Vibrant or appropriate colors\n\
            - Professional finish",
            prompt
        )
    }

    fn enhance_video_gen(&self, prompt: &str) -> String {
        format!(
            "Video Generation:\n\n{}\n\nGenerate a video with:\n\
            - Smooth motion and transitions\n\
            - Appropriate duration (consider context)\n\
            - High resolution\n\
            - Coherent scene progression\n\
            - Suitable pacing",
            prompt
        )
    }

    fn enhance_general_qa(&self, prompt: &str) -> String {
        // For general Q&A, minimal enhancement - just ensure clarity
        if prompt.trim().ends_with('?') {
            prompt.to_string()
        } else {
            format!("{}. Please provide a clear and concise answer.", prompt)
        }
    }

    fn extract_context(&self, prompt: &str, use_case: UseCase) -> PromptContext {
        let prompt_lower = prompt.to_lowercase();

        let language = if use_case == UseCase::Coding {
            self.detect_language(&prompt_lower)
        } else {
            None
        };

        let framework = if use_case == UseCase::Coding {
            self.detect_framework(&prompt_lower)
        } else {
            None
        };

        let domain = self.detect_domain(&prompt_lower, use_case);
        let complexity = self.assess_complexity(&prompt_lower);

        PromptContext {
            language,
            framework,
            domain,
            complexity: Some(complexity),
        }
    }

    fn detect_language(&self, prompt: &str) -> Option<String> {
        let languages = vec![
            ("typescript", "TypeScript"),
            ("javascript", "JavaScript"),
            ("python", "Python"),
            ("rust", "Rust"),
            ("java", "Java"),
            ("c++", "C++"),
            ("c#", "C#"),
            ("go", "Go"),
            ("ruby", "Ruby"),
            ("php", "PHP"),
            ("swift", "Swift"),
            ("kotlin", "Kotlin"),
        ];

        for (keyword, name) in languages {
            if prompt.contains(keyword) {
                return Some(name.to_string());
            }
        }

        None
    }

    fn detect_framework(&self, prompt: &str) -> Option<String> {
        let frameworks = vec![
            ("react", "React"),
            ("vue", "Vue"),
            ("angular", "Angular"),
            ("svelte", "Svelte"),
            ("nextjs", "Next.js"),
            ("express", "Express"),
            ("fastapi", "FastAPI"),
            ("django", "Django"),
            ("flask", "Flask"),
            ("spring", "Spring"),
            ("rails", "Rails"),
            ("laravel", "Laravel"),
            (".net", ".NET"),
        ];

        for (keyword, name) in frameworks {
            if prompt.contains(keyword) {
                return Some(name.to_string());
            }
        }

        None
    }

    fn detect_domain(&self, prompt: &str, use_case: UseCase) -> Option<String> {
        match use_case {
            UseCase::Coding => {
                if prompt.contains("frontend") || prompt.contains("ui") {
                    Some("Frontend".to_string())
                } else if prompt.contains("backend") || prompt.contains("server") {
                    Some("Backend".to_string())
                } else if prompt.contains("database") || prompt.contains("sql") {
                    Some("Database".to_string())
                } else {
                    None
                }
            }
            UseCase::Automation => {
                if prompt.contains("web") || prompt.contains("browser") {
                    Some("Web Automation".to_string())
                } else if prompt.contains("desktop") || prompt.contains("ui") {
                    Some("Desktop Automation".to_string())
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    fn assess_complexity(&self, prompt: &str) -> Complexity {
        let word_count = prompt.split_whitespace().count();
        let has_technical_terms = prompt.contains("algorithm")
            || prompt.contains("optimization")
            || prompt.contains("architecture")
            || prompt.contains("integration")
            || prompt.contains("advanced");

        if word_count > 50 || has_technical_terms {
            Complexity::Complex
        } else if word_count > 20 {
            Complexity::Moderate
        } else {
            Complexity::Simple
        }
    }

    fn get_enhancement_reason(&self, use_case: UseCase) -> String {
        match use_case {
            UseCase::Automation => {
                "Added context for automation best practices and error handling".to_string()
            }
            UseCase::Coding => {
                "Added requirements for code quality, documentation, and best practices".to_string()
            }
            UseCase::DocumentCreation => {
                "Added formatting and structural requirements for professional documents"
                    .to_string()
            }
            UseCase::Search => {
                "Added requirements for comprehensive, cited information".to_string()
            }
            UseCase::ImageGen => {
                "Added quality and aesthetic requirements for image generation".to_string()
            }
            UseCase::VideoGen => {
                "Added technical and creative requirements for video generation".to_string()
            }
            UseCase::GeneralQA => "Minimal enhancement for clarity".to_string(),
        }
    }
}

impl Default for PromptEnhancer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coding_enhancement() {
        let enhancer = PromptEnhancer::new();
        let detection = UseCaseDetection {
            use_case: UseCase::Coding,
            confidence: 0.9,
            keywords: vec!["function".to_string()],
            ambiguous: false,
            alternatives: None,
        };

        let result = enhancer.enhance("Write a function to sort an array", &detection);
        assert!(result.enhanced.contains("Coding Task"));
        assert!(result.enhanced.contains("error handling"));
        assert_eq!(result.use_case, UseCase::Coding);
    }

    #[test]
    fn test_language_detection() {
        let enhancer = PromptEnhancer::new();
        let lang = enhancer.detect_language("write a typescript function");
        assert_eq!(lang, Some("TypeScript".to_string()));
    }

    #[test]
    fn test_complexity_assessment() {
        let enhancer = PromptEnhancer::new();
        let simple = enhancer.assess_complexity("sort array");
        assert_eq!(simple, Complexity::Simple);

        let complex = enhancer.assess_complexity(
            "implement an advanced algorithm with optimization for large datasets",
        );
        assert_eq!(complex, Complexity::Complex);
    }
}
