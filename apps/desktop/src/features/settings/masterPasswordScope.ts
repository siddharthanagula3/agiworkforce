/**
 * What a master password protects and what it leaves alone. Every screen that
 * says so uses this sentence, so it changes in one place when the native rule
 * in `sys/security/vault_credentials.rs` does.
 */
export const MASTER_PASSWORD_SCOPE =
  "A master password seals your saved provider API keys and nothing else: connector sign-ins, connector app credentials, MCP server credentials and tool permissions stay under this device's key, so they keep working while locked.";
