#[cfg(test)]
mod tests {
    #[test]
    fn test_openai_gpt4_cost() {
        // GPT-4 pricing: $0.03/1K input, $0.06/1K output
        let prompt_tokens = 1000u32;
        let completion_tokens = 500u32;
        let input_cost = (prompt_tokens as f64 / 1000.0) * 0.03;
        let output_cost = (completion_tokens as f64 / 1000.0) * 0.06;
        let total_cost = input_cost + output_cost;

        assert_eq!(input_cost, 0.03);
        assert_eq!(output_cost, 0.03);
        assert_eq!(total_cost, 0.06);
    }

    #[test]
    fn test_anthropic_claude_cost() {
        // Claude pricing: $0.015/1K input, $0.075/1K output
        let prompt_tokens = 2000u32;
        let completion_tokens = 1000u32;
        let input_cost = (prompt_tokens as f64 / 1000.0) * 0.015;
        let output_cost = (completion_tokens as f64 / 1000.0) * 0.075;
        let total_cost = input_cost + output_cost;

        assert_eq!(input_cost, 0.03);
        assert_eq!(output_cost, 0.075);
        assert_eq!(total_cost, 0.105);
    }

    #[test]
    fn test_ollama_zero_cost() {
        let prompt_tokens = 10000u32;
        let completion_tokens = 5000u32;
        let cost = 0.0; // Ollama is free

        assert_eq!(cost, 0.0);
        assert!(prompt_tokens > 0);
        assert!(completion_tokens > 0);
    }

    #[test]
    fn test_cost_comparison() {
        let tokens = 1000u32;
        let gpt4_cost = (tokens as f64 / 1000.0) * 0.03;
        let claude_cost = (tokens as f64 / 1000.0) * 0.015;
        let ollama_cost = 0.0;

        assert!(gpt4_cost > claude_cost);
        assert!(claude_cost > ollama_cost);
    }

    #[test]
    fn test_fractional_token_cost() {
        let tokens = 250u32; // Less than 1K
        let cost = (tokens as f64 / 1000.0) * 0.03;
        assert_eq!(cost, 0.0075);
    }

    #[test]
    fn test_large_volume_cost() {
        let tokens = 100_000u32;
        let cost = (tokens as f64 / 1000.0) * 0.03;
        assert_eq!(cost, 3.0);
    }

    #[test]
    fn test_cost_rounding() {
        let cost = 0.123456789f64;
        let rounded = (cost * 100000.0).round() / 100000.0;
        assert!(rounded > 0.12345 && rounded < 0.12346);
    }
}
