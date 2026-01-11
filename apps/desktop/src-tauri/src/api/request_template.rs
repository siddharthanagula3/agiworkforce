use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::{Error, Result};

/// Template variable
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateVariable {
    pub name: String,
    pub value: String,
    pub default: Option<String>,
}

/// Request template for API calls
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestTemplate {
    pub name: String,
    pub description: Option<String>,
    pub method: String,
    pub url_template: String,
    pub headers_template: HashMap<String, String>,
    pub body_template: Option<String>,
    pub variables: Vec<TemplateVariable>,
}

/// Template engine for variable substitution
pub struct TemplateEngine;

impl TemplateEngine {
    /// Render template with variables
    pub fn render(template: &str, variables: &HashMap<String, String>) -> Result<String> {
        let mut result = template.to_string();

        // Replace {{variable}} patterns
        for (key, value) in variables {
            let pattern = format!("{{{{{}}}}}", key);
            result = result.replace(&pattern, value);
        }

        // Check for unresolved variables
        if result.contains("{{") && result.contains("}}") {
            let unresolved: Vec<&str> = result
                .split("{{")
                .skip(1)
                .filter_map(|s| s.split("}}").next())
                .collect();

            if !unresolved.is_empty() {
                return Err(Error::Other(format!(
                    "Unresolved template variables: {}",
                    unresolved.join(", ")
                )));
            }
        }

        Ok(result)
    }

    /// Render template with default values
    pub fn render_with_defaults(
        template_str: &str,
        variables: &HashMap<String, String>,
        defaults: &HashMap<String, String>,
    ) -> Result<String> {
        let mut combined = defaults.clone();
        combined.extend(variables.clone());

        Self::render(template_str, &combined)
    }

    /// Extract variables from template string
    pub fn extract_variables(template: &str) -> Vec<String> {
        let mut variables = Vec::new();
        let mut current = template;

        while let Some(start) = current.find("{{") {
            if let Some(end) = current[start..].find("}}") {
                let var_name = &current[start + 2..start + end];
                variables.push(var_name.trim().to_string());
                current = &current[start + end + 2..];
            } else {
                break;
            }
        }

        // Remove duplicates
        variables.sort();
        variables.dedup();

        variables
    }

    /// Validate template syntax
    pub fn validate_template(template: &str) -> Result<()> {
        let mut open_count = 0;
        let mut close_count = 0;

        for i in 0..template.len() {
            if i < template.len() - 1 {
                let pair = &template[i..i + 2];
                if pair == "{{" {
                    open_count += 1;
                } else if pair == "}}" {
                    close_count += 1;
                }
            }
        }

        if open_count != close_count {
            return Err(Error::Other(format!(
                "Template syntax error: {} opening braces, {} closing braces",
                open_count, close_count
            )));
        }

        Ok(())
    }
}

impl RequestTemplate {
    /// Render the request template with variables
    pub fn render(&self, variables: &HashMap<String, String>) -> Result<RenderedRequest> {
        // Build defaults from template variables
        let mut defaults = HashMap::new();
        for var in &self.variables {
            if let Some(ref default) = var.default {
                defaults.insert(var.name.clone(), default.clone());
            }
        }

        // Render URL
        let url = TemplateEngine::render_with_defaults(&self.url_template, variables, &defaults)?;

        // Render headers
        let mut headers = HashMap::new();
        for (key, value_template) in &self.headers_template {
            let rendered_value =
                TemplateEngine::render_with_defaults(value_template, variables, &defaults)?;
            headers.insert(key.clone(), rendered_value);
        }

        // Render body if present
        let body = if let Some(ref body_template) = self.body_template {
            Some(TemplateEngine::render_with_defaults(
                body_template,
                variables,
                &defaults,
            )?)
        } else {
            None
        };

        Ok(RenderedRequest {
            method: self.method.clone(),
            url,
            headers,
            body,
        })
    }

    /// Get required variables (those without defaults)
    pub fn get_required_variables(&self) -> Vec<String> {
        self.variables
            .iter()
            .filter(|v| v.default.is_none())
            .map(|v| v.name.clone())
            .collect()
    }

    /// Get all variable names
    pub fn get_all_variables(&self) -> Vec<String> {
        self.variables.iter().map(|v| v.name.clone()).collect()
    }
}

/// Rendered request ready for execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_template_rendering() {
        let template = "Hello, {{name}}!";
        let mut variables = HashMap::new();
        variables.insert("name".to_string(), "World".to_string());

        let result = TemplateEngine::render(template, &variables).unwrap();
        assert_eq!(result, "Hello, World!");
    }

    #[test]
    fn test_multiple_variables() {
        let template = "{{protocol}}://{{host}}/{{path}}";
        let mut variables = HashMap::new();
        variables.insert("protocol".to_string(), "https".to_string());
        variables.insert("host".to_string(), "api.example.com".to_string());
        variables.insert("path".to_string(), "users/123".to_string());

        let result = TemplateEngine::render(template, &variables).unwrap();
        assert_eq!(result, "https://api.example.com/users/123");
    }

    #[test]
    fn test_unresolved_variable() {
        let template = "Hello, {{name}}! Your ID is {{id}}.";
        let mut variables = HashMap::new();
        variables.insert("name".to_string(), "Alice".to_string());

        let result = TemplateEngine::render(template, &variables);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unresolved"));
    }

    #[test]
    fn test_extract_variables() {
        let template = "{{protocol}}://{{host}}/api/{{version}}/users/{{user_id}}";
        let variables = TemplateEngine::extract_variables(template);

        assert_eq!(variables.len(), 4);
        assert!(variables.contains(&"protocol".to_string()));
        assert!(variables.contains(&"host".to_string()));
        assert!(variables.contains(&"version".to_string()));
        assert!(variables.contains(&"user_id".to_string()));
    }

    #[test]
    fn test_validate_template() {
        assert!(TemplateEngine::validate_template("{{valid}}").is_ok());
        assert!(TemplateEngine::validate_template("{{a}} and {{b}}").is_ok());
        assert!(TemplateEngine::validate_template("{{unclosed").is_err());
        assert!(TemplateEngine::validate_template("unopened}}").is_err());
    }

    #[test]
    fn test_request_template_rendering() {
        let template = RequestTemplate {
            name: "Get User".to_string(),
            description: Some("Fetch user by ID".to_string()),
            method: "GET".to_string(),
            url_template: "https://api.example.com/users/{{user_id}}".to_string(),
            headers_template: HashMap::from([
                ("Authorization".to_string(), "Bearer {{token}}".to_string()),
                ("Content-Type".to_string(), "application/json".to_string()),
            ]),
            body_template: None,
            variables: vec![
                TemplateVariable {
                    name: "user_id".to_string(),
                    value: String::new(),
                    default: None,
                },
                TemplateVariable {
                    name: "token".to_string(),
                    value: String::new(),
                    default: Some("default_token".to_string()),
                },
            ],
        };

        let mut variables = HashMap::new();
        variables.insert("user_id".to_string(), "123".to_string());

        let rendered = template.render(&variables).unwrap();

        assert_eq!(rendered.url, "https://api.example.com/users/123");
        assert_eq!(
            rendered.headers.get("Authorization").unwrap(),
            "Bearer default_token"
        );
        assert_eq!(
            rendered.headers.get("Content-Type").unwrap(),
            "application/json"
        );
    }

    #[test]
    fn test_get_required_variables() {
        let template = RequestTemplate {
            name: "Test".to_string(),
            description: None,
            method: "GET".to_string(),
            url_template: String::new(),
            headers_template: HashMap::new(),
            body_template: None,
            variables: vec![
                TemplateVariable {
                    name: "required_var".to_string(),
                    value: String::new(),
                    default: None,
                },
                TemplateVariable {
                    name: "optional_var".to_string(),
                    value: String::new(),
                    default: Some("default".to_string()),
                },
            ],
        };

        let required = template.get_required_variables();
        assert_eq!(required.len(), 1);
        assert_eq!(required[0], "required_var");
    }
}
