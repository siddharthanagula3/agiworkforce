use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

use crate::error::{Error, Result};

/// Supported database types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    PostgreSQL,
    MySQL,
    SQLite,
    MongoDB,
    Redis,
}

impl fmt::Display for DatabaseType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DatabaseType::PostgreSQL => write!(f, "PostgreSQL"),
            DatabaseType::MySQL => write!(f, "MySQL"),
            DatabaseType::SQLite => write!(f, "SQLite"),
            DatabaseType::MongoDB => write!(f, "MongoDB"),
            DatabaseType::Redis => write!(f, "Redis"),
        }
    }
}

/// Database connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub db_type: DatabaseType,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    pub connection_string: Option<String>,
    pub options: HashMap<String, String>,
}

impl ConnectionConfig {
    /// Create PostgreSQL connection config
    pub fn postgres(host: &str, port: u16, database: &str, username: &str, password: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            db_type: DatabaseType::PostgreSQL,
            host: Some(host.to_string()),
            port: Some(port),
            username: Some(username.to_string()),
            password: Some(password.to_string()),
            database: Some(database.to_string()),
            connection_string: None,
            options: HashMap::new(),
        }
    }

    /// Create MySQL connection config
    pub fn mysql(host: &str, port: u16, database: &str, username: &str, password: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            db_type: DatabaseType::MySQL,
            host: Some(host.to_string()),
            port: Some(port),
            username: Some(username.to_string()),
            password: Some(password.to_string()),
            database: Some(database.to_string()),
            connection_string: None,
            options: HashMap::new(),
        }
    }

    /// Create SQLite connection config
    pub fn sqlite(path: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            db_type: DatabaseType::SQLite,
            host: None,
            port: None,
            username: None,
            password: None,
            database: Some(path.to_string()),
            connection_string: None,
            options: HashMap::new(),
        }
    }

    /// Create MongoDB connection config
    pub fn mongodb(
        host: &str,
        port: u16,
        database: &str,
        username: Option<&str>,
        password: Option<&str>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            db_type: DatabaseType::MongoDB,
            host: Some(host.to_string()),
            port: Some(port),
            username: username.map(|s| s.to_string()),
            password: password.map(|s| s.to_string()),
            database: Some(database.to_string()),
            connection_string: None,
            options: HashMap::new(),
        }
    }

    /// Create Redis connection config
    pub fn redis(host: &str, port: u16, password: Option<&str>, db: Option<u8>) -> Self {
        let mut options = HashMap::new();
        if let Some(db_num) = db {
            options.insert("db".to_string(), db_num.to_string());
        }

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            db_type: DatabaseType::Redis,
            host: Some(host.to_string()),
            port: Some(port),
            username: None,
            password: password.map(|s| s.to_string()),
            database: None,
            connection_string: None,
            options,
        }
    }

    /// Create from connection string
    pub fn from_connection_string(connection_string: &str) -> Result<Self> {
        let db_type = Self::detect_db_type(connection_string)?;

        Ok(Self {
            id: uuid::Uuid::new_v4().to_string(),
            db_type,
            host: None,
            port: None,
            username: None,
            password: None,
            database: None,
            connection_string: Some(connection_string.to_string()),
            options: HashMap::new(),
        })
    }

    /// Detect database type from connection string
    fn detect_db_type(connection_string: &str) -> Result<DatabaseType> {
        if connection_string.starts_with("postgres://")
            || connection_string.starts_with("postgresql://")
        {
            Ok(DatabaseType::PostgreSQL)
        } else if connection_string.starts_with("mysql://") {
            Ok(DatabaseType::MySQL)
        } else if connection_string.starts_with("sqlite://") || connection_string.ends_with(".db") {
            Ok(DatabaseType::SQLite)
        } else if connection_string.starts_with("mongodb://")
            || connection_string.starts_with("mongodb+srv://")
        {
            Ok(DatabaseType::MongoDB)
        } else if connection_string.starts_with("redis://") {
            Ok(DatabaseType::Redis)
        } else {
            Err(Error::Other(
                "Could not detect database type from connection string".to_string(),
            ))
        }
    }

    /// Build connection string from config
    pub fn build_connection_string(&self) -> Result<String> {
        if let Some(ref conn_str) = self.connection_string {
            return Ok(conn_str.clone());
        }

        match self.db_type {
            DatabaseType::PostgreSQL => {
                let host = self
                    .host
                    .as_ref()
                    .ok_or_else(|| Error::Other("Host required".to_string()))?;
                let port = self
                    .port
                    .ok_or_else(|| Error::Other("Port required".to_string()))?;
                let database = self
                    .database
                    .as_ref()
                    .ok_or_else(|| Error::Other("Database required".to_string()))?;
                let username = self
                    .username
                    .as_ref()
                    .ok_or_else(|| Error::Other("Username required".to_string()))?;
                let password = self
                    .password
                    .as_ref()
                    .ok_or_else(|| Error::Other("Password required".to_string()))?;

                Ok(format!(
                    "postgres://{}:{}@{}:{}/{}",
                    username, password, host, port, database
                ))
            }
            DatabaseType::MySQL => {
                let host = self
                    .host
                    .as_ref()
                    .ok_or_else(|| Error::Other("Host required".to_string()))?;
                let port = self
                    .port
                    .ok_or_else(|| Error::Other("Port required".to_string()))?;
                let database = self
                    .database
                    .as_ref()
                    .ok_or_else(|| Error::Other("Database required".to_string()))?;
                let username = self
                    .username
                    .as_ref()
                    .ok_or_else(|| Error::Other("Username required".to_string()))?;
                let password = self
                    .password
                    .as_ref()
                    .ok_or_else(|| Error::Other("Password required".to_string()))?;

                Ok(format!(
                    "mysql://{}:{}@{}:{}/{}",
                    username, password, host, port, database
                ))
            }
            DatabaseType::SQLite => {
                let path = self
                    .database
                    .as_ref()
                    .ok_or_else(|| Error::Other("Database path required".to_string()))?;
                Ok(format!("sqlite://{}", path))
            }
            DatabaseType::MongoDB => {
                let host = self
                    .host
                    .as_ref()
                    .ok_or_else(|| Error::Other("Host required".to_string()))?;
                let port = self
                    .port
                    .ok_or_else(|| Error::Other("Port required".to_string()))?;
                let database = self
                    .database
                    .as_ref()
                    .ok_or_else(|| Error::Other("Database required".to_string()))?;

                if let (Some(username), Some(password)) = (&self.username, &self.password) {
                    Ok(format!(
                        "mongodb://{}:{}@{}:{}/{}",
                        username, password, host, port, database
                    ))
                } else {
                    Ok(format!("mongodb://{}:{}/{}", host, port, database))
                }
            }
            DatabaseType::Redis => {
                let host = self
                    .host
                    .as_ref()
                    .ok_or_else(|| Error::Other("Host required".to_string()))?;
                let port = self
                    .port
                    .ok_or_else(|| Error::Other("Port required".to_string()))?;

                let db_num = self
                    .options
                    .get("db")
                    .and_then(|s| s.parse::<u8>().ok())
                    .unwrap_or(0);

                if let Some(password) = &self.password {
                    Ok(format!(
                        "redis://:{}@{}:{}/{}",
                        password, host, port, db_num
                    ))
                } else {
                    Ok(format!("redis://{}:{}/{}", host, port, db_num))
                }
            }
        }
    }

    /// Validate connection configuration
    pub fn validate(&self) -> Result<()> {
        match self.db_type {
            DatabaseType::PostgreSQL | DatabaseType::MySQL => {
                if self.host.is_none() {
                    return Err(Error::Other("Host is required".to_string()));
                }
                if self.port.is_none() {
                    return Err(Error::Other("Port is required".to_string()));
                }
                if self.username.is_none() {
                    return Err(Error::Other("Username is required".to_string()));
                }
                if self.password.is_none() {
                    return Err(Error::Other("Password is required".to_string()));
                }
                if self.database.is_none() {
                    return Err(Error::Other("Database name is required".to_string()));
                }
            }
            DatabaseType::SQLite => {
                if self.database.is_none() && self.connection_string.is_none() {
                    return Err(Error::Other("Database path is required".to_string()));
                }
            }
            DatabaseType::MongoDB => {
                if self.host.is_none() {
                    return Err(Error::Other("Host is required".to_string()));
                }
                if self.database.is_none() {
                    return Err(Error::Other("Database name is required".to_string()));
                }
            }
            DatabaseType::Redis => {
                if self.host.is_none() {
                    return Err(Error::Other("Host is required".to_string()));
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_postgres_config() {
        let config = ConnectionConfig::postgres("localhost", 5432, "mydb", "user", "pass");
        assert_eq!(config.db_type, DatabaseType::PostgreSQL);
        assert_eq!(config.host, Some("localhost".to_string()));
        assert_eq!(config.port, Some(5432));
    }

    #[test]
    fn test_mysql_config() {
        let config = ConnectionConfig::mysql("localhost", 3306, "mydb", "user", "pass");
        assert_eq!(config.db_type, DatabaseType::MySQL);
        assert_eq!(config.port, Some(3306));
    }

    #[test]
    fn test_sqlite_config() {
        let config = ConnectionConfig::sqlite("/path/to/database.db");
        assert_eq!(config.db_type, DatabaseType::SQLite);
        assert_eq!(config.database, Some("/path/to/database.db".to_string()));
    }

    #[test]
    fn test_mongodb_config() {
        let config =
            ConnectionConfig::mongodb("localhost", 27017, "mydb", Some("user"), Some("pass"));
        assert_eq!(config.db_type, DatabaseType::MongoDB);
        assert_eq!(config.port, Some(27017));
    }

    #[test]
    fn test_redis_config() {
        let config = ConnectionConfig::redis("localhost", 6379, Some("pass"), Some(2));
        assert_eq!(config.db_type, DatabaseType::Redis);
        assert_eq!(config.options.get("db"), Some(&"2".to_string()));
    }

    #[test]
    fn test_connection_string_detection() {
        assert!(matches!(
            ConnectionConfig::detect_db_type("postgres://localhost/db"),
            Ok(DatabaseType::PostgreSQL)
        ));
        assert!(matches!(
            ConnectionConfig::detect_db_type("mysql://localhost/db"),
            Ok(DatabaseType::MySQL)
        ));
        assert!(matches!(
            ConnectionConfig::detect_db_type("mongodb://localhost/db"),
            Ok(DatabaseType::MongoDB)
        ));
        assert!(matches!(
            ConnectionConfig::detect_db_type("redis://localhost"),
            Ok(DatabaseType::Redis)
        ));
    }

    #[test]
    fn test_build_postgres_connection_string() {
        let config = ConnectionConfig::postgres("localhost", 5432, "mydb", "user", "pass");
        let conn_str = config.build_connection_string().unwrap();
        assert_eq!(conn_str, "postgres://user:pass@localhost:5432/mydb");
    }

    #[test]
    fn test_validate_postgres_config() {
        let config = ConnectionConfig::postgres("localhost", 5432, "mydb", "user", "pass");
        assert!(config.validate().is_ok());

        let invalid_config = ConnectionConfig {
            id: uuid::Uuid::new_v4().to_string(),
            db_type: DatabaseType::PostgreSQL,
            host: None,
            port: None,
            username: None,
            password: None,
            database: None,
            connection_string: None,
            options: HashMap::new(),
        };
        assert!(invalid_config.validate().is_err());
    }
}
