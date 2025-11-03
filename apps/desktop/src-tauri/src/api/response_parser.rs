use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::error::{Error, Result};

/// Response format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResponseFormat {
    Json,
    Xml,
    Html,
    Text,
    Binary,
}

/// Parsed response with extracted data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedResponse {
    pub format: ResponseFormat,
    pub data: JsonValue,
    pub raw: String,
}

/// Response parser for different formats
pub struct ResponseParser;

impl ResponseParser {
    /// Parse response based on Content-Type header
    pub fn parse(body: &str, content_type: Option<&str>) -> Result<ParsedResponse> {
        let format = Self::detect_format(body, content_type);

        match format {
            ResponseFormat::Json => Self::parse_json(body),
            ResponseFormat::Xml => Self::parse_xml(body),
            ResponseFormat::Html => Self::parse_html(body),
            ResponseFormat::Text => Self::parse_text(body),
            ResponseFormat::Binary => Err(Error::Other(
                "Binary responses must be handled separately".to_string(),
            )),
        }
    }

    /// Detect response format from content type and body
    fn detect_format(body: &str, content_type: Option<&str>) -> ResponseFormat {
        if let Some(ct) = content_type {
            let ct_lower = ct.to_lowercase();

            if ct_lower.contains("application/json")
                || ct_lower.contains("application/vnd.api+json")
            {
                return ResponseFormat::Json;
            } else if ct_lower.contains("application/xml") || ct_lower.contains("text/xml") {
                return ResponseFormat::Xml;
            } else if ct_lower.contains("text/html") {
                return ResponseFormat::Html;
            } else if ct_lower.contains("text/plain") {
                return ResponseFormat::Text;
            } else if ct_lower.contains("application/octet-stream")
                || ct_lower.contains("image/")
                || ct_lower.contains("video/")
                || ct_lower.contains("audio/")
            {
                return ResponseFormat::Binary;
            }
        }

        // Fallback: Try to detect from body content
        let trimmed = body.trim();

        if (trimmed.starts_with('{') && trimmed.ends_with('}'))
            || (trimmed.starts_with('[') && trimmed.ends_with(']'))
        {
            return ResponseFormat::Json;
        }

        if trimmed.starts_with('<') && trimmed.ends_with('>') {
            if trimmed.to_lowercase().contains("<html") {
                return ResponseFormat::Html;
            } else {
                return ResponseFormat::Xml;
            }
        }

        ResponseFormat::Text
    }

    /// Parse JSON response
    fn parse_json(body: &str) -> Result<ParsedResponse> {
        tracing::debug!("Parsing JSON response");

        let data: JsonValue = serde_json::from_str(body)
            .map_err(|e| Error::Other(format!("Failed to parse JSON: {}", e)))?;

        Ok(ParsedResponse {
            format: ResponseFormat::Json,
            data,
            raw: body.to_string(),
        })
    }

    /// Parse XML response (basic support)
    fn parse_xml(body: &str) -> Result<ParsedResponse> {
        tracing::debug!("Parsing XML response");

        // For now, return as text with structured marker
        // Full XML parsing would require quick-xml crate
        Ok(ParsedResponse {
            format: ResponseFormat::Xml,
            data: serde_json::json!({
                "type": "xml",
                "content": body
            }),
            raw: body.to_string(),
        })
    }

    /// Parse HTML response (basic support)
    fn parse_html(body: &str) -> Result<ParsedResponse> {
        tracing::debug!("Parsing HTML response");

        // Extract basic metadata
        let title = Self::extract_html_title(body);

        Ok(ParsedResponse {
            format: ResponseFormat::Html,
            data: serde_json::json!({
                "type": "html",
                "title": title,
                "content": body
            }),
            raw: body.to_string(),
        })
    }

    /// Parse plain text response
    fn parse_text(body: &str) -> Result<ParsedResponse> {
        tracing::debug!("Parsing text response");

        Ok(ParsedResponse {
            format: ResponseFormat::Text,
            data: serde_json::json!({
                "type": "text",
                "content": body
            }),
            raw: body.to_string(),
        })
    }

    /// Extract title from HTML
    fn extract_html_title(html: &str) -> Option<String> {
        let lower = html.to_lowercase();

        if let Some(start) = lower.find("<title>") {
            if let Some(end) = lower[start..].find("</title>") {
                let title_start = start + 7; // "<title>".len()
                let title_end = start + end;

                if title_end > title_start {
                    return Some(html[title_start..title_end].trim().to_string());
                }
            }
        }

        None
    }

    /// Extract JSON path from parsed response
    pub fn extract_json_path(parsed: &ParsedResponse, path: &str) -> Result<JsonValue> {
        if !matches!(parsed.format, ResponseFormat::Json) {
            return Err(Error::Other(
                "JSON path extraction only works with JSON responses".to_string(),
            ));
        }

        let parts: Vec<&str> = path.split('.').collect();
        let mut current = &parsed.data;

        for part in parts {
            // Handle array indices like "items[0]"
            if part.contains('[') && part.contains(']') {
                let bracket_pos = part.find('[').unwrap();
                let key = &part[..bracket_pos];
                let index_str = &part[bracket_pos + 1..part.len() - 1];
                let index: usize = index_str
                    .parse()
                    .map_err(|_| Error::Other(format!("Invalid array index: {}", index_str)))?;

                current = current
                    .get(key)
                    .ok_or_else(|| Error::Other(format!("Key not found: {}", key)))?;

                current = current
                    .get(index)
                    .ok_or_else(|| Error::Other(format!("Index out of bounds: {}", index)))?;
            } else {
                current = current
                    .get(part)
                    .ok_or_else(|| Error::Other(format!("Key not found: {}", part)))?;
            }
        }

        Ok(current.clone())
    }

    /// Convert response to pretty-printed string
    pub fn to_pretty_string(parsed: &ParsedResponse) -> String {
        match parsed.format {
            ResponseFormat::Json => {
                serde_json::to_string_pretty(&parsed.data).unwrap_or_else(|_| parsed.raw.clone())
            }
            _ => parsed.raw.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_json_format() {
        let json_body = r#"{"key": "value"}"#;
        let format = ResponseParser::detect_format(json_body, Some("application/json"));
        assert!(matches!(format, ResponseFormat::Json));
    }

    #[test]
    fn test_detect_json_from_body() {
        let json_body = r#"{"key": "value"}"#;
        let format = ResponseParser::detect_format(json_body, None);
        assert!(matches!(format, ResponseFormat::Json));
    }

    #[test]
    fn test_parse_json() {
        let json_body = r#"{"name": "Alice", "age": 30}"#;
        let result = ResponseParser::parse_json(json_body).unwrap();

        assert!(matches!(result.format, ResponseFormat::Json));
        assert_eq!(result.data["name"], "Alice");
        assert_eq!(result.data["age"], 30);
    }

    #[test]
    fn test_parse_json_array() {
        let json_body = r#"[{"id": 1}, {"id": 2}]"#;
        let result = ResponseParser::parse_json(json_body).unwrap();

        assert!(matches!(result.format, ResponseFormat::Json));
        assert!(result.data.is_array());
        assert_eq!(result.data.as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_extract_html_title() {
        let html =
            r#"<!DOCTYPE html><html><head><title>Test Page</title></head><body></body></html>"#;
        let title = ResponseParser::extract_html_title(html);
        assert_eq!(title, Some("Test Page".to_string()));
    }

    #[test]
    fn test_extract_json_path() {
        let json_body = r#"{"user": {"name": "Alice", "addresses": [{"city": "NYC"}]}}"#;
        let parsed = ResponseParser::parse_json(json_body).unwrap();

        // Extract nested field
        let name = ResponseParser::extract_json_path(&parsed, "user.name").unwrap();
        assert_eq!(name, "Alice");

        // Extract array element
        let city = ResponseParser::extract_json_path(&parsed, "user.addresses[0].city").unwrap();
        assert_eq!(city, "NYC");
    }

    #[test]
    fn test_extract_json_path_not_found() {
        let json_body = r#"{"user": {"name": "Alice"}}"#;
        let parsed = ResponseParser::parse_json(json_body).unwrap();

        let result = ResponseParser::extract_json_path(&parsed, "user.email");
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_html_format() {
        let html = "<html><body>Hello</body></html>";
        let format = ResponseParser::detect_format(html, Some("text/html"));
        assert!(matches!(format, ResponseFormat::Html));
    }

    #[test]
    fn test_detect_xml_format() {
        let xml = "<root><item>data</item></root>";
        let format = ResponseParser::detect_format(xml, Some("application/xml"));
        assert!(matches!(format, ResponseFormat::Xml));
    }

    #[test]
    fn test_parse_with_auto_detection() {
        let json_body = r#"{"status": "success"}"#;
        let result = ResponseParser::parse(json_body, None).unwrap();

        assert!(matches!(result.format, ResponseFormat::Json));
        assert_eq!(result.data["status"], "success");
    }
}
