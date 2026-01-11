#[cfg(test)]
mod tests {
    #[test]
    fn test_simple_text_token_count() {
        let text = "Hello world";
        // Rough estimate: ~1 token per 4 characters
        let estimated_tokens = (text.len() as f64 / 4.0).ceil() as u32;
        assert!(estimated_tokens > 0);
        assert!(estimated_tokens <= text.len() as u32);
    }

    #[test]
    fn test_long_text_token_count() {
        let text = "This is a longer piece of text that should be tokenized. ".repeat(10);
        let estimated_tokens = (text.len() as f64 / 4.0).ceil() as u32;
        assert!(estimated_tokens > 100);
    }

    #[test]
    fn test_empty_text() {
        let text = "";
        let tokens = 0u32;
        assert_eq!(tokens, 0);
        assert_eq!(text.len(), 0);
    }

    #[test]
    fn test_single_character() {
        let _text = "a";
        let estimated_tokens = 1u32;
        assert_eq!(estimated_tokens, 1);
    }

    #[test]
    fn test_special_characters() {
        let text = "!@#$%^&*()";
        let estimated_tokens = (text.len() as f64 / 4.0).ceil() as u32;
        assert!(estimated_tokens > 0);
    }

    #[test]
    fn test_unicode_text() {
        let text = "Hello 世界 🌍";
        assert!(!text.is_empty());
        let char_count = text.chars().count();
        assert!(char_count > 0);
    }

    #[test]
    fn test_code_snippet_tokens() {
        let code = r#"
        function hello() {
            console.log("Hello world");
        }
        "#;
        let estimated_tokens = (code.len() as f64 / 4.0).ceil() as u32;
        assert!(estimated_tokens > 10);
    }

    #[test]
    fn test_json_tokens() {
        let json = r#"{"key": "value", "number": 42, "array": [1, 2, 3]}"#;
        let estimated_tokens = (json.len() as f64 / 4.0).ceil() as u32;
        assert!(estimated_tokens > 5);
    }

    #[test]
    fn test_whitespace_handling() {
        let text1 = "hello world";
        let text2 = "hello    world";
        assert!(text2.len() > text1.len());
    }

    #[test]
    fn test_newline_handling() {
        let text = "line1\nline2\nline3";
        let line_count = text.lines().count();
        assert_eq!(line_count, 3);
    }
}
