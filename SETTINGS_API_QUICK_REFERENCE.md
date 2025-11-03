# Settings API Quick Reference

## Tauri Commands (Frontend)

### Get Single Setting
```typescript
const value = await invoke('settings_v2_get', { key: 'temperature' });
```

### Set Setting
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

### Get Multiple Settings
```typescript
const { settings } = await invoke('settings_v2_get_batch', {
  request: { keys: ['temperature', 'max_tokens'] }
});
```

### Get Category Settings
```typescript
const { settings } = await invoke('settings_v2_get_category', {
  category: 'llm'
});
```

### Save API Key
```typescript
await invoke('settings_v2_save_api_key', {
  provider: 'openai',
  key: 'sk-...'
});
```

### Get API Key
```typescript
const key = await invoke('settings_v2_get_api_key', {
  provider: 'openai'
});
```

### Load App Settings
```typescript
const settings = await invoke('settings_v2_load_app_settings');
```

### Save App Settings
```typescript
await invoke('settings_v2_save_app_settings', { settings });
```

### Delete Setting
```typescript
await invoke('settings_v2_delete', { key: 'old_setting' });
```

### Clear Cache
```typescript
await invoke('settings_v2_clear_cache');
```

## Rust API

### Initialize Service
```rust
use agiworkforce_desktop::settings::SettingsService;

let service = SettingsService::new(db_connection)?;
```

### Get Setting
```rust
let value = service.get("temperature")?;
let temp = value.as_float().unwrap();
```

### Set Setting
```rust
service.set(
    "temperature".to_string(),
    SettingValue::Float(0.7),
    SettingCategory::Llm,
    false
)?;
```

### Get with Default
```rust
let value = service.get_or_default(
    "font_size",
    SettingValue::Integer(14)
);
```

### Batch Set
```rust
service.set_batch(vec![
    ("key1".to_string(), SettingValue::String("val".to_string()), SettingCategory::System, false),
])?;
```

### Get by Category
```rust
let settings = service.get_by_category(SettingCategory::Llm)?;
```

### API Key Management
```rust
service.save_api_key("openai", "sk-...")?;
let key = service.get_api_key("openai")?;
```

## Setting Categories

- `llm` - LLM configuration
- `ui` - User interface preferences
- `security` - Security settings
- `window` - Window state preferences
- `system` - System configuration

## Setting Types

- `String` - Text values
- `Integer` - Whole numbers (i64)
- `Float` - Decimal numbers (f64)
- `Boolean` - true/false
- `Json` - Complex objects

## Validated Settings

| Key | Type | Range | Example |
|-----|------|-------|---------|
| temperature | Float | 0.0-2.0 | 0.7 |
| max_tokens | Integer | 1-200000 | 4096 |
| theme | String | light/dark/system | "system" |
| language | String | ISO 639-1 | "en" |
| font_size | Integer | 8-32 | 14 |

## Security

- API keys stored in system keyring
- Sensitive settings encrypted with AES-256-GCM
- Master key stored securely in keyring
- Automatic encryption/decryption
