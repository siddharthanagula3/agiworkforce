use crate::error::{Error, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};

/// SQL injection detection patterns
static DANGEROUS_PATTERNS: &[&str] = &[
    r"(?i)(\bUNION\b.*\bSELECT\b)",                    // UNION-based injection
    r"(?i)(\bOR\b\s+\d+\s*=\s*\d+)",                   // Boolean-based injection
    r"(?i)(\bAND\b\s+\d+\s*=\s*\d+)",                  // Boolean-based injection
    r"(?i)(;\s*(DROP|DELETE|TRUNCATE|ALTER)\b)",       // Stacked queries
    r"(?i)(\bEXEC\b.*\()",                             // Stored procedure execution
    r"(?i)(\bINTO\s+OUTFILE\b)",                       // File operations
    r"(?i)(\bLOAD_FILE\b)",                            // File operations
    r"(?i)(/\*.*\*/)",                                 // SQL comments (can hide injection)
    r"(?i)(--[^\n]*)",                                 // SQL line comments
    r"(?i)(\bSLEEP\b\s*\()",                           // Time-based injection
    r"(?i)(\bBENCHMARK\b\s*\()",                       // Time-based injection
    r"(?i)(0x[0-9a-f]+)",                              // Hex encoding bypass
];

/// Query approval levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApprovalLevel {
    /// No approval required (safe queries like SELECT)
    None,
    /// User confirmation required (UPDATE, INSERT)
    UserConfirmation,
    /// Admin approval required (DROP, DELETE without WHERE)
    AdminApproval,
    /// Blocked (dangerous operations)
    Blocked,
}

/// Query classification
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

/// SQL security validator
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

    /// Check if SQL query contains potential injection attempts
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

    /// Classify query type
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

    /// Determine required approval level for a query
    pub fn get_approval_level(&self, sql: &str) -> ApprovalLevel {
        let query_type = self.classify_query(sql);
        let sql_upper = sql.trim().to_uppercase();

        match query_type {
            QueryType::Select => ApprovalLevel::None,
            QueryType::Insert => ApprovalLevel::UserConfirmation,
            QueryType::Update => {
                // UPDATE without WHERE requires admin approval
                if !sql_upper.contains("WHERE") {
                    ApprovalLevel::AdminApproval
                } else {
                    ApprovalLevel::UserConfirmation
                }
            }
            QueryType::Delete => {
                // DELETE without WHERE requires admin approval
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

    /// Validate query and return approval requirements
    pub fn validate_query(&self, sql: &str) -> Result<QueryValidation> {
        // Check for SQL injection
        let injection_warnings = self.check_sql_injection(sql)?;

        // Classify query
        let query_type = self.classify_query(sql);

        // Determine approval level
        let approval_level = self.get_approval_level(sql);

        Ok(QueryValidation {
            query_type,
            approval_level,
            injection_warnings,
            safe: injection_warnings.is_empty() && approval_level != ApprovalLevel::Blocked,
        })
    }

    /// Sanitize table/column names (prevent SQL injection in identifiers)
    pub fn sanitize_identifier(identifier: &str) -> Result<String> {
        // Only allow alphanumeric characters and underscores
        if identifier
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_')
        {
            Ok(identifier.to_string())
        } else {
            Err(Error::Other(format!(
                "Invalid identifier: {}. Only alphanumeric characters and underscores are allowed",
                identifier
            )))
        }
    }
}

/// Query validation result
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

        // Test UNION-based injection
        let sql = "SELECT * FROM users WHERE id = 1 UNION SELECT password FROM admins";
        let warnings = validator.check_sql_injection(sql).unwrap();
        assert!(!warnings.is_empty());

        // Test boolean-based injection
        let sql = "SELECT * FROM users WHERE id = 1 OR 1=1";
        let warnings = validator.check_sql_injection(sql).unwrap();
        assert!(!warnings.is_empty());

        // Test safe query
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

        // SELECT should not require approval
        assert_eq!(
            validator.get_approval_level("SELECT * FROM users"),
            ApprovalLevel::None
        );

        // UPDATE with WHERE should require user confirmation
        assert_eq!(
            validator.get_approval_level("UPDATE users SET name = 'test' WHERE id = 1"),
            ApprovalLevel::UserConfirmation
        );

        // UPDATE without WHERE should require admin approval
        assert_eq!(
            validator.get_approval_level("UPDATE users SET name = 'test'"),
            ApprovalLevel::AdminApproval
        );

        // DELETE without WHERE should require admin approval
        assert_eq!(
            validator.get_approval_level("DELETE FROM users"),
            ApprovalLevel::AdminApproval
        );

        // DROP should require admin approval
        assert_eq!(
            validator.get_approval_level("DROP TABLE users"),
            ApprovalLevel::AdminApproval
        );
    }

    #[test]
    fn test_identifier_sanitization() {
        // Valid identifiers
        assert!(SqlSecurityValidator::sanitize_identifier("users").is_ok());
        assert!(SqlSecurityValidator::sanitize_identifier("user_table").is_ok());
        assert!(SqlSecurityValidator::sanitize_identifier("table123").is_ok());

        // Invalid identifiers
        assert!(SqlSecurityValidator::sanitize_identifier("users; DROP TABLE").is_err());
        assert!(SqlSecurityValidator::sanitize_identifier("table-name").is_err());
        assert!(SqlSecurityValidator::sanitize_identifier("table name").is_err());
    }
}
