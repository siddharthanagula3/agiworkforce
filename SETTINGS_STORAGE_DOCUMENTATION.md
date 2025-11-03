# Settings Storage System Documentation

## Overview

The AGI Workforce application includes a comprehensive persistent settings storage system that provides type-safe, validated, and encrypted storage for application configuration and user preferences.

## Features

- **Type-Safe Settings**: Strongly typed settings with validation
- **Encryption**: Automatic encryption for sensitive data (API keys, credentials)
- **Validation**: Built-in validation for common setting types
- **Schema Migrations**: Versioned schema with automatic migrations
- **Caching**: In-memory caching for fast access
- **Categories**: Organized settings by category (LLM, UI, Security, Window, System)
- **Batch Operations**: Efficient bulk read/write operations
- **Thread-Safe**: Concurrent access support with mutex protection

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Commands Layer                     │
│  (settings_v2_get, settings_v2_set, settings_v2_get_batch)  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Settings Service Layer                     │
│  - Validation                                                │
│  - Encryption/Decryption (AES-256-GCM)                      │
│  - Caching                                                   │
│  - Business Logic                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Repository Layer                           │
│  - Database Operations (CRUD)                                │
│  - Query Building                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   SQLite Database                            │
│  Table: settings_v2 (key, value, category, encrypted, ...)  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### settings_v2 Table

```sql
CREATE TABLE settings_v2 (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,              -- JSON-serialized SettingValue
    category TEXT NOT NULL,            -- 'llm', 'ui', 'security', 'window', 'system'
    encrypted INTEGER NOT NULL,        -- 0 or 1
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_settings_v2_category ON settings_v2(category);
CREATE INDEX idx_settings_v2_updated ON settings_v2(updated_at DESC);
```

## API Design

### Rust API

#### Settings Service

```rust
use agiworkforce_desktop::settings::{
    SettingsService, SettingValue, SettingCategory
};

// Initialize service
let service = SettingsService::new(db_connection)?;

// Set a setting
service.set(
    "temperature".to_string(),
    SettingValue::Float(0.7),
    SettingCategory::Llm,
    false  // not encrypted
)?;

// Get a setting
let value = service.get("temperature")?;
let temp = value.as_float().unwrap();

// Get with default
let value = service.get_or_default(
    "font_size",
    SettingValue::Integer(14)
);

// Batch operations
service.set_batch(vec![
    ("key1".to_string(), SettingValue::String("val1".to_string()), SettingCategory::System, false),
    ("key2".to_string(), SettingValue::Integer(42), SettingCategory::Llm, false),
])?;

// Get by category
let llm_settings = service.get_by_category(SettingCategory::Llm)?;

// Save API key (encrypted in keyring)
service.save_api_key("openai", "sk-...")?;

// Get API key
let api_key = service.get_api_key("openai")?;

// Save complete app settings
let settings = AppSettings::default();
service.save_app_settings(&settings)?;

// Load complete app settings
let settings = service.load_app_settings()?;
```

### Tauri Commands (Frontend API)

#### Get a Single Setting

```typescript
import { invoke } from '@tauri-apps/api/tauri';

const value = await invoke('settings_v2_get', { key: 'temperature' });
console.log('Temperature:', value); // 0.7
```

#### Set a Setting

```typescript
await invoke('settings_v2_set', {
  request: {
    key: 'temperature',
    value: 0.8,
    category: 'llm',
    encrypted: false
  }
});
```

#### Get Multiple Settings

```typescript
const response = await invoke('settings_v2_get_batch', {
  request: {
    keys: ['temperature', 'max_tokens', 'default_model']
  }
});
console.log('Settings:', response.settings);
// { temperature: 0.7, max_tokens: 4096, default_model: "gpt-4o-mini" }
```

#### Get Settings by Category

```typescript
const response = await invoke('settings_v2_get_category', {
  category: 'llm'
});
console.log('LLM Settings:', response.settings);
```

#### Save API Key

```typescript
await invoke('settings_v2_save_api_key', {
  provider: 'openai',
  key: 'sk-...'
});
```

#### Get API Key

```typescript
const apiKey = await invoke('settings_v2_get_api_key', {
  provider: 'openai'
});
```

#### Load/Save Complete App Settings

```typescript
// Load
const appSettings = await invoke('settings_v2_load_app_settings');
console.log('App Settings:', appSettings);

// Modify
appSettings.defaultProvider = 'anthropic';
appSettings.uiPreferences.theme = 'dark';

// Save
await invoke('settings_v2_save_app_settings', {
  settings: appSettings
});
```

#### Delete a Setting

```typescript
await invoke('settings_v2_delete', { key: 'old_setting' });
```

#### Clear Cache

```typescript
await invoke('settings_v2_clear_cache');
```

## Setting Types

### SettingValue Enum

Settings can be of multiple types:

```rust
pub enum SettingValue {
    String(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Json(serde_json::Value),
}
```

### Categories

```rust
pub enum SettingCategory {
    Llm,       // LLM configuration
    Ui,        // User interface preferences
    Security,  // Security settings
    Window,    // Window state preferences
    System,    // System configuration
}
```

## Validation

The system includes built-in validation for common settings:

### Validated Settings

| Setting Key | Type | Validation | Example |
|-------------|------|------------|---------|
| `temperature` | Float | 0.0 - 2.0 | 0.7 |
| `max_tokens` | Integer | 1 - 200,000 | 4096 |
| `theme` | String | "light", "dark", "system" | "system" |
| `language` | String | ISO 639-1 | "en" |
| `font_size` | Integer | 8 - 32 | 14 |
| `*_api_key` | String | Provider-specific format | "sk-..." |

### Custom Validation

```rust
use agiworkforce_desktop::settings::validation;

// Validate temperature
validation::validate_temperature(0.7)?; // OK
validation::validate_temperature(3.0)?; // Error

// Validate API key
validation::validate_api_key("openai", "sk-...")?; // OK
validation::validate_api_key("openai", "invalid")?; // Error

// Validate theme
validation::validate_theme("dark")?; // OK
validation::validate_theme("invalid")?; // Error
```

## Encryption

### How It Works

1. **Master Key**: A 256-bit AES key is generated and stored in the system keyring
2. **Encryption**: Sensitive values are encrypted using AES-256-GCM with random nonces
3. **Storage**: Encrypted values are base64-encoded and stored in the database
4. **Decryption**: Values are automatically decrypted when retrieved

### What Gets Encrypted

- Settings marked with `encrypted: true`
- API keys stored via `save_api_key()`
- Any sensitive configuration data

### Security Considerations

#### Key Storage
- Master encryption key is stored in the system keyring (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- Never stored in the database or files
- Generated once per installation

#### Encryption Algorithm
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits
- **Nonce**: 96 bits (random per encryption)
- **Authentication**: Built-in with GCM

#### Best Practices

1. **Always encrypt sensitive data**:
   ```rust
   service.set(
       "api_key".to_string(),
       SettingValue::String(key),
       SettingCategory::Security,
       true  // encrypted
   )?;
   ```

2. **Use keyring for API keys**:
   ```rust
   // Preferred method
   service.save_api_key("openai", "sk-...")?;

   // Avoid storing in regular settings
   ```

3. **Don't log encrypted values**:
   ```rust
   // Good
   tracing::info!("Setting updated: {}", key);

   // Bad - might leak sensitive data
   tracing::info!("Setting value: {:?}", value);
   ```

4. **Validate before storing**:
   All settings are validated before being stored to prevent invalid data.

5. **Clear sensitive data from memory**:
   The service automatically handles this for encrypted data.

## Default Settings

### AppSettings Structure

```rust
pub struct AppSettings {
    pub default_provider: String,        // "openai"
    pub default_model: String,           // "gpt-4o-mini"
    pub model_configs: HashMap<String, ModelConfig>,
    pub provider_configs: HashMap<String, LLMProviderConfig>,
    pub ui_preferences: UIPreferences,
    pub window_preferences: WindowStatePreferences,
    pub security_settings: SecuritySettings,
    pub schema_version: u32,
}
```

### UIPreferences

```rust
pub struct UIPreferences {
    pub theme: String,              // "system"
    pub language: String,           // "en"
    pub font_size: u32,            // 14
    pub compact_mode: bool,        // false
    pub show_token_counts: bool,   // true
    pub show_cost_estimates: bool, // true
}
```

### SecuritySettings

```rust
pub struct SecuritySettings {
    pub require_confirmation_for_actions: bool,  // true
    pub allow_file_system_access: bool,          // true
    pub allow_network_access: bool,              // true
    pub enable_telemetry: bool,                  // true
    pub auto_clear_sensitive_data: bool,         // false
    pub session_timeout_minutes: u32,            // 30
}
```

## Migration Support

### Schema Versioning

The system supports schema migrations for backward compatibility:

```rust
// Current version: 4
// Migration v4: Enhanced settings table with categories
```

### Adding New Migrations

```rust
// In db/migrations.rs

const CURRENT_VERSION: i32 = 5;  // Increment version

fn apply_migration_v5(conn: &Connection) -> Result<()> {
    // Add new column or table
    conn.execute(
        "ALTER TABLE settings_v2 ADD COLUMN new_field TEXT",
        [],
    )?;

    // Migrate existing data if needed
    // ...

    Ok(())
}

// Update run_migrations() to call the new migration
```

## Usage Examples

### Example 1: User Preference Management

```typescript
// React component
import { invoke } from '@tauri-apps/api/tauri';

async function saveUserPreferences() {
  const settings = await invoke('settings_v2_load_app_settings');

  settings.uiPreferences.theme = 'dark';
  settings.uiPreferences.fontSize = 16;
  settings.uiPreferences.compactMode = true;

  await invoke('settings_v2_save_app_settings', { settings });
}

async function loadUserPreferences() {
  const settings = await invoke('settings_v2_load_app_settings');

  // Apply theme
  document.body.className = settings.uiPreferences.theme;

  // Apply font size
  document.documentElement.style.fontSize =
    `${settings.uiPreferences.fontSize}px`;
}
```

### Example 2: LLM Provider Configuration

```typescript
async function configureLLMProvider(provider: string, apiKey: string) {
  // Save API key securely
  await invoke('settings_v2_save_api_key', {
    provider,
    key: apiKey
  });

  // Update provider settings
  await invoke('settings_v2_set', {
    request: {
      key: 'default_provider',
      value: provider,
      category: 'llm',
      encrypted: false
    }
  });

  // Set default model for provider
  const modelMap = {
    'openai': 'gpt-4o-mini',
    'anthropic': 'claude-3-5-sonnet-20241022',
    'google': 'gemini-1.5-flash'
  };

  await invoke('settings_v2_set', {
    request: {
      key: 'default_model',
      value: modelMap[provider],
      category: 'llm',
      encrypted: false
    }
  });
}
```

### Example 3: Settings Export/Import

```typescript
async function exportSettings() {
  const settings = await invoke('settings_v2_load_app_settings');

  // Remove sensitive data
  delete settings.providerConfigs;  // Contains API keys

  const json = JSON.stringify(settings, null, 2);

  // Save to file
  await invoke('save_file', {
    path: 'settings_export.json',
    contents: json
  });
}

async function importSettings(json: string) {
  const settings = JSON.parse(json);

  // Validate schema version
  if (settings.schemaVersion !== 1) {
    throw new Error('Incompatible settings version');
  }

  // Import (will prompt for API keys separately)
  await invoke('settings_v2_save_app_settings', { settings });
}
```

### Example 4: First-Run Setup Wizard

```typescript
async function firstRunSetup(config: {
  provider: string,
  apiKey: string,
  theme: string,
  language: string
}) {
  const settings = await invoke('settings_v2_load_app_settings');

  // Configure LLM provider
  await invoke('settings_v2_save_api_key', {
    provider: config.provider,
    key: config.apiKey
  });

  settings.defaultProvider = config.provider;
  settings.uiPreferences.theme = config.theme;
  settings.uiPreferences.language = config.language;

  await invoke('settings_v2_save_app_settings', { settings });

  // Mark setup as complete
  await invoke('settings_v2_set', {
    request: {
      key: 'setup_completed',
      value: true,
      category: 'system',
      encrypted: false
    }
  });
}
```

## Testing

### Running Tests

```bash
# Run all settings tests
cd apps/desktop/src-tauri
cargo test settings::

# Run specific test
cargo test settings::integration_tests::test_encryption_flow

# Run with output
cargo test settings:: -- --nocapture
```

### Test Coverage

The test suite covers:
- ✅ Basic CRUD operations
- ✅ Encryption/decryption flow
- ✅ Batch operations
- ✅ Category filtering
- ✅ Validation
- ✅ Caching functionality
- ✅ AppSettings roundtrip
- ✅ Default values
- ✅ Multiple value types
- ✅ Concurrent access
- ✅ Error handling

## Performance Considerations

### Caching Strategy

- **First Read**: Loads from database, caches result
- **Subsequent Reads**: Serves from cache (O(1) lookup)
- **Writes**: Updates both database and cache atomically
- **Clear Cache**: Use sparingly, only when needed

### Batch Operations

For bulk updates, use batch operations:

```rust
// Inefficient
for (key, value) in settings {
    service.set(key, value, category, false)?;
}

// Efficient
service.set_batch(settings)?;
```

### Database Indexes

Optimized queries with indexes on:
- `category` (for category-based queries)
- `updated_at` (for recently changed settings)
- `key` (primary key, automatically indexed)

## Troubleshooting

### Common Issues

#### 1. Keyring Access Errors

**Problem**: `Failed to access keyring` error on Linux

**Solution**: Install required packages:
```bash
# Ubuntu/Debian
sudo apt-get install libsecret-1-dev

# Fedora
sudo dnf install libsecret-devel
```

#### 2. Encryption/Decryption Errors

**Problem**: `Decryption failed` error

**Solution**: Master key may be corrupted or missing
```rust
// Reset master key (WARNING: loses all encrypted data)
// Manually delete from keyring and restart app
```

#### 3. Validation Errors

**Problem**: `Validation error: Invalid value` when setting

**Solution**: Check validation constraints:
```rust
// See validation rules in validation.rs
// Example: temperature must be 0.0-2.0
service.set("temperature", SettingValue::Float(0.7), ...)?;
```

#### 4. Database Migration Errors

**Problem**: `Migration failed` on startup

**Solution**: Check database integrity:
```bash
# Backup database
cp agiworkforce.db agiworkforce.db.backup

# Reset database (loses all data)
rm agiworkforce.db
# App will recreate on next launch
```

## Files Created/Modified

### New Files

1. `apps/desktop/src-tauri/src/settings/mod.rs` - Module definition
2. `apps/desktop/src-tauri/src/settings/models.rs` - Data models
3. `apps/desktop/src-tauri/src/settings/validation.rs` - Validation logic
4. `apps/desktop/src-tauri/src/settings/repository.rs` - Database operations
5. `apps/desktop/src-tauri/src/settings/service.rs` - Business logic and encryption
6. `apps/desktop/src-tauri/src/settings/tests.rs` - Integration tests
7. `apps/desktop/src-tauri/src/commands/settings_v2.rs` - Tauri commands
8. `SETTINGS_STORAGE_DOCUMENTATION.md` - This documentation

### Modified Files

1. `apps/desktop/src-tauri/src/lib.rs` - Added settings module export
2. `apps/desktop/src-tauri/src/commands/mod.rs` - Added settings_v2 module
3. `apps/desktop/src-tauri/src/main.rs` - Initialize settings service and commands
4. `apps/desktop/src-tauri/src/db/migrations.rs` - Added migration v4
5. `apps/desktop/src-tauri/Cargo.toml` - Added rand dependency

## Future Enhancements

Potential improvements for future versions:

1. **Settings Sync**: Cloud sync across devices
2. **Settings Profiles**: Multiple configuration profiles
3. **Settings Versioning**: Track setting change history
4. **Settings Export**: Import/export with encryption
5. **Settings UI**: Auto-generated settings UI from schema
6. **Settings Validation Schema**: JSON Schema validation
7. **Settings Notifications**: Notify on setting changes
8. **Settings Presets**: Predefined setting bundles

## Conclusion

The settings storage system provides a robust, secure, and type-safe foundation for managing application configuration. It follows best practices for security, performance, and maintainability while providing a clean API for both Rust and TypeScript/JavaScript frontends.

For questions or issues, please refer to the test suite in `settings/tests.rs` for additional usage examples.
