use crate::sys::error::{Error, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};

static DANGEROUS_PATTERNS: &[&str] = &[
    r"(?i)(\bUNION\b.*\bSELECT\b)",
    r"(?i)(\bOR\b\s+\d+\s*=\s*\d+)",
    r"(?i)(\bAND\b\s+\d+\s*=\s*\d+)",
    r"(?i)(;\s*(DROP|DELETE|TRUNCATE|ALTER)\b)",
    r"(?i)(\bEXEC\b.*\()",
    r"(?i)(\bINTO\s+OUTFILE\b)",
    r"(?i)(\bLOAD_FILE\b)",
    r"(?i)(/\*.*\*/)",
    r"(?i)(--[^\n]*)",
    r"(?i)(\bSLEEP\b\s*\()",
    r"(?i)(\bBENCHMARK\b\s*\()",
    r"(?i)(0x[0-9a-f]+)",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApprovalLevel {
    None,

    UserConfirmation,

    AdminApproval,

    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueryType {
    Select,
    Insert,
    Update,
    Delete,
    Drop,
    Truncate,
    Alter,
    Create,
    Grant,
    Revoke,
    StoredProcedure,
    Unknown,
}

pub struct SqlSecurityValidator {
    dangerous_patterns: Vec<Regex>,
}

impl SqlSecurityValidator {
    pub fn new() -> Result<Self> {
        let mut patterns = Vec::new();
        for pattern in DANGEROUS_PATTERNS {
            let regex = Regex::new(pattern)
                .map_err(|e| Error::Other(format!("Invalid regex pattern: {}", e)))?;
            patterns.push(regex);
        }

        Ok(Self {
            dangerous_patterns: patterns,
        })
    }

    pub fn check_sql_injection(&self, sql: &str) -> Result<Vec<String>> {
        let mut findings = Vec::new();

        for (i, pattern) in self.dangerous_patterns.iter().enumerate() {
            if pattern.is_match(sql) {
                findings.push(format!(
                    "Potential SQL injection detected (pattern {}): {}",
                    i + 1,
                    DANGEROUS_PATTERNS[i]
                ));
            }
        }

        Ok(findings)
    }

    pub fn classify_query(&self, sql: &str) -> QueryType {
        let sql_upper = sql.trim().to_uppercase();

        if sql_upper.starts_with("SELECT") {
            QueryType::Select
        } else if sql_upper.starts_with("INSERT") {
            QueryType::Insert
        } else if sql_upper.starts_with("UPDATE") {
            QueryType::Update
        } else if sql_upper.starts_with("DELETE") {
            QueryType::Delete
        } else if sql_upper.starts_with("DROP") {
            QueryType::Drop
        } else if sql_upper.starts_with("TRUNCATE") {
            QueryType::Truncate
        } else if sql_upper.starts_with("ALTER") {
            QueryType::Alter
        } else if sql_upper.starts_with("CREATE") {
            QueryType::Create
        } else if sql_upper.starts_with("GRANT") {
            QueryType::Grant
        } else if sql_upper.starts_with("REVOKE") {
            QueryType::Revoke
        } else if sql_upper.starts_with("CALL") {
            QueryType::StoredProcedure
        } else {
            QueryType::Unknown
        }
    }

    pub fn get_approval_level(&self, sql: &str) -> ApprovalLevel {
        let query_type = self.classify_query(sql);
        let sql_upper = sql.trim().to_uppercase();

        match query_type {
            QueryType::Select => ApprovalLevel::None,
            QueryType::Insert => ApprovalLevel::UserConfirmation,
            QueryType::Update => {
                if !sql_upper.contains("WHERE") {
                    ApprovalLevel::AdminApproval
                } else {
                    ApprovalLevel::UserConfirmation
                }
            }
            QueryType::Delete => {
                if !sql_upper.contains("WHERE") {
                    ApprovalLevel::AdminApproval
                } else {
                    ApprovalLevel::UserConfirmation
                }
            }
            QueryType::Drop | QueryType::Truncate => ApprovalLevel::AdminApproval,
            QueryType::Alter => ApprovalLevel::AdminApproval,
            QueryType::Create => ApprovalLevel::UserConfirmation,
            QueryType::Grant | QueryType::Revoke => ApprovalLevel::Blocked,
            QueryType::StoredProcedure => ApprovalLevel::UserConfirmation,
            QueryType::Unknown => ApprovalLevel::Blocked,
        }
    }

    pub fn validate_query(&self, sql: &str) -> Result<QueryValidation> {
        let injection_warnings = self.check_sql_injection(sql)?;

        let query_type = self.classify_query(sql);

        let approval_level = self.get_approval_level(sql);

        Ok(QueryValidation {
            query_type,
            approval_level,
            injection_warnings: injection_warnings.clone(),
            safe: injection_warnings.is_empty() && approval_level != ApprovalLevel::Blocked,
        })
    }

    pub fn sanitize_identifier(identifier: &str) -> Result<String> {
        if identifier.chars().all(|c| c.is_alphanumeric() || c == '_') {
            Ok(identifier.to_string())
        } else {
            Err(Error::Other(format!(
                "Invalid identifier: {}. Only alphanumeric characters and underscores are allowed",
                identifier
            )))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryValidation {
    pub query_type: QueryType,
    pub approval_level: ApprovalLevel,
    pub injection_warnings: Vec<String>,
    pub safe: bool,
}

impl Default for SqlSecurityValidator {
    fn default() -> Self {
        Self::new().expect("Failed to create SQL security validator")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_injection_detection() {
        let validator = SqlSecurityValidator::new().unwrap();

        let sql = "SELECT * FROM users WHERE id = 1 UNION SELECT password FROM admins";
        let warnings = validator.check_sql_injection(sql).unwrap();
        assert!(!warnings.is_empty());

        let sql = "SELECT * FROM users WHERE id = 1 OR 1=1";
        let warnings = validator.check_sql_injection(sql).unwrap();
        assert!(!warnings.is_empty());

        let sql = "SELECT * FROM users WHERE email = ?";
        let warnings = validator.check_sql_injection(sql).unwrap();
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_query_classification() {
        let validator = SqlSecurityValidator::new().unwrap();

        assert_eq!(
            validator.classify_query("SELECT * FROM users"),
            QueryType::Select
        );
        assert_eq!(
            validator.classify_query("INSERT INTO users VALUES (1, 'test')"),
            QueryType::Insert
        );
        assert_eq!(
            validator.classify_query("UPDATE users SET name = 'test'"),
            QueryType::Update
        );
        assert_eq!(
            validator.classify_query("DELETE FROM users WHERE id = 1"),
            QueryType::Delete
        );
        assert_eq!(
            validator.classify_query("DROP TABLE users"),
            QueryType::Drop
        );
    }

    #[test]
    fn test_approval_levels() {
        let validator = SqlSecurityValidator::new().unwrap();

        assert_eq!(
            validator.get_approval_level("SELECT * FROM users"),
            ApprovalLevel::None
        );

        assert_eq!(
            validator.get_approval_level("UPDATE users SET name = 'test' WHERE id = 1"),
            ApprovalLevel::UserConfirmation
        );

        assert_eq!(
            validator.get_approval_level("UPDATE users SET name = 'test'"),
            ApprovalLevel::AdminApproval
        );

        assert_eq!(
            validator.get_approval_level("DELETE FROM users"),
            ApprovalLevel::AdminApproval
        );

        assert_eq!(
            validator.get_approval_level("DROP TABLE users"),
            ApprovalLevel::AdminApproval
        );
    }

    #[test]
    fn test_identifier_sanitization() {
        assert!(SqlSecurityValidator::sanitize_identifier("users").is_ok());
        assert!(SqlSecurityValidator::sanitize_identifier("user_table").is_ok());
        assert!(SqlSecurityValidator::sanitize_identifier("table123").is_ok());

        assert!(SqlSecurityValidator::sanitize_identifier("users; DROP TABLE").is_err());
        assert!(SqlSecurityValidator::sanitize_identifier("table-name").is_err());
        assert!(SqlSecurityValidator::sanitize_identifier("table name").is_err());
    }
}
