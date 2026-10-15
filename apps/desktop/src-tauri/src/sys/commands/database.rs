use crate::data::database::SqlClient;

/// The SQL connections the assistant's database tools run against. Nothing
/// the page can call opens one or runs a query on it: those commands had no
/// screen behind them and asked no one, so they are gone.
pub struct DatabaseState {
    pub sql_client: SqlClient,
}

impl Default for DatabaseState {
    fn default() -> Self {
        Self::new()
    }
}

impl DatabaseState {
    pub fn new() -> Self {
        Self {
            sql_client: SqlClient::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_state_creation() {
        let state = DatabaseState::new();

        drop(state);
    }

    #[test]
    fn the_page_has_no_database_command() {
        let source = include_str!("database.rs");
        let attribute = ["#[tauri", "::command]"].concat();
        assert!(
            !source.contains(&attribute),
            "a database command the page can call needs a screen and an approval of its own"
        );
    }
}
