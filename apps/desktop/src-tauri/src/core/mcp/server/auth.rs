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
        let expected = self.token.as_bytes();
        let got = provided.as_bytes();
        if expected.len() != got.len() {
            // Constant-time compare still runs to prevent timing attacks
            let _ = expected.ct_eq(expected);
            return false;
        }
        expected.ct_eq(got).into()
    }
}

impl Default for McpAuth {
    fn default() -> Self {
        Self::new()
    }
}
