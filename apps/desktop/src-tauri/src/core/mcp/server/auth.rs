use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct McpAuth {
    token: String,
}

impl McpAuth {
    pub fn new() -> Self {
        Self {
            token: Uuid::new_v4().to_string(),
        }
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn verify(&self, provided: &str) -> bool {
        self.token.as_bytes().ct_eq(provided.as_bytes()).into()
    }
}

impl Default for McpAuth {
    fn default() -> Self {
        Self::new()
    }
}
