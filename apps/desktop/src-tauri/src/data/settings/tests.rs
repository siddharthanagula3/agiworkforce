#[cfg(test)]
mod integration_tests {
    use crate::data::settings::{
        models::{AppSettings, SettingCategory, SettingValue},
        repository, SettingsService,
    };
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        conn
    }

    fn setup_test_service_with_conn() -> (SettingsService, Arc<Mutex<Connection>>) {
        let conn = Arc::new(Mutex::new(setup_test_db()));
        let service = SettingsService::new(conn.clone()).unwrap();
        (service, conn)
    }

    fn setup_test_service() -> SettingsService {
        let (service, _) = setup_test_service_with_conn();
        service
    }

    #[test]
    fn test_basic_crud_operations() {
        let service = setup_test_service();

        service
            .set(
                "test_key".to_string(),
                SettingValue::String("test_value".to_string()),
                SettingCategory::System,
                false,
            )
            .unwrap();

        let value = service.get("test_key").unwrap();
        assert_eq!(value.as_string(), Some("test_value"));

        service
            .set(
                "test_key".to_string(),
                SettingValue::String("updated_value".to_string()),
                SettingCategory::System,
                false,
            )
            .unwrap();

        let value = service.get("test_key").unwrap();
        assert_eq!(value.as_string(), Some("updated_value"));

        service.delete("test_key").unwrap();
        assert!(service.get("test_key").is_err());
    }

    #[test]
    fn test_encryption_flow() {
        let (service, conn) = setup_test_service_with_conn();

        let sensitive = "my_secret_api_key";

        service
            .set(
                "api_key".to_string(),
                SettingValue::String(sensitive.to_string()),
                SettingCategory::Security,
                true,
            )
            .unwrap();

        let value = service.get("api_key").unwrap();
        assert_eq!(value.as_string(), Some(sensitive));

        let raw_setting = {
            let conn_guard = conn.lock().unwrap();
            repository::get_setting(&conn_guard, "api_key").unwrap()
        };
        assert!(raw_setting.encrypted);

        assert_ne!(raw_setting.value, format!("\"{}\"", sensitive));
    }

    #[test]
    fn test_batch_operations() {
        let service = setup_test_service();

        let batch = vec![
            (
                "key1".to_string(),
                SettingValue::String("value1".to_string()),
                SettingCategory::System,
                false,
            ),
            (
                "key2".to_string(),
                SettingValue::Integer(42),
                SettingCategory::Llm,
                false,
            ),
            (
                "key3".to_string(),
                SettingValue::Boolean(true),
                SettingCategory::Ui,
                false,
            ),
        ];

        service.set_batch(batch).unwrap();

        assert_eq!(service.get("key1").unwrap().as_string(), Some("value1"));
        assert_eq!(service.get("key2").unwrap().as_integer(), Some(42));
        assert_eq!(service.get("key3").unwrap().as_boolean(), Some(true));
    }

    #[test]
    fn test_category_filtering() {
        let service = setup_test_service();

        service
            .set(
                "llm_setting".to_string(),
                SettingValue::String("llm_value".to_string()),
                SettingCategory::Llm,
                false,
            )
            .unwrap();

        service
            .set(
                "ui_setting".to_string(),
                SettingValue::String("ui_value".to_string()),
                SettingCategory::Ui,
                false,
            )
            .unwrap();

        let llm_settings = service.get_by_category(SettingCategory::Llm).unwrap();
        assert_eq!(llm_settings.len(), 1);
        assert_eq!(llm_settings[0].key, "llm_setting");

        let ui_settings = service.get_by_category(SettingCategory::Ui).unwrap();
        assert_eq!(ui_settings.len(), 1);
        assert_eq!(ui_settings[0].key, "ui_setting");
    }

    #[test]
    fn test_validation() {
        let service = setup_test_service();

        let result = service.set(
            "temperature".to_string(),
            SettingValue::Float(3.0),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_err());

        let result = service.set(
            "temperature".to_string(),
            SettingValue::Float(0.7),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_ok());

        let result = service.set(
            "max_tokens".to_string(),
            SettingValue::Integer(300_000),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_err());

        let result = service.set(
            "max_tokens".to_string(),
            SettingValue::Integer(4096),
            SettingCategory::Llm,
            false,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_cache_functionality() {
        let service = setup_test_service();

        service
            .set(
                "cached_key".to_string(),
                SettingValue::String("cached_value".to_string()),
                SettingCategory::System,
                false,
            )
            .unwrap();

        let value1 = service.get("cached_key").unwrap();
        assert_eq!(value1.as_string(), Some("cached_value"));

        let value2 = service.get("cached_key").unwrap();
        assert_eq!(value2.as_string(), Some("cached_value"));

        service.clear_cache();

        let value3 = service.get("cached_key").unwrap();
        assert_eq!(value3.as_string(), Some("cached_value"));
    }

    #[test]
    fn test_app_settings_roundtrip() {
        let service = setup_test_service();

        let mut settings = AppSettings {
            default_provider: "anthropic".to_string(),
            ..Default::default()
        };
        settings.default_model = "claude-3-5-sonnet".to_string();
        settings.ui_preferences.theme = "dark".to_string();
        settings.ui_preferences.font_size = 16;

        service.save_app_settings(&settings).unwrap();

        let loaded = service.load_app_settings().unwrap();

        assert_eq!(loaded.default_provider, "anthropic");
        assert_eq!(loaded.default_model, "claude-3-5-sonnet");
        assert_eq!(loaded.ui_preferences.theme, "dark");
        assert_eq!(loaded.ui_preferences.font_size, 16);
    }

    #[test]
    fn test_default_values() {
        let service = setup_test_service();

        let value = service.get_or_default(
            "nonexistent_key",
            SettingValue::String("default_value".to_string()),
        );
        assert_eq!(value.as_string(), Some("default_value"));

        service
            .set(
                "existing_key".to_string(),
                SettingValue::String("actual_value".to_string()),
                SettingCategory::System,
                false,
            )
            .unwrap();

        let value = service.get_or_default(
            "existing_key",
            SettingValue::String("default_value".to_string()),
        );
        assert_eq!(value.as_string(), Some("actual_value"));
    }

    #[test]
    fn test_setting_value_types() {
        let service = setup_test_service();

        service
            .set(
                "string_key".to_string(),
                SettingValue::String("test".to_string()),
                SettingCategory::System,
                false,
            )
            .unwrap();
        assert_eq!(service.get("string_key").unwrap().as_string(), Some("test"));

        service
            .set(
                "int_key".to_string(),
                SettingValue::Integer(42),
                SettingCategory::System,
                false,
            )
            .unwrap();
        assert_eq!(service.get("int_key").unwrap().as_integer(), Some(42));

        service
            .set(
                "float_key".to_string(),
                SettingValue::Float(3.15),
                SettingCategory::System,
                false,
            )
            .unwrap();
        assert_eq!(service.get("float_key").unwrap().as_float(), Some(3.15));

        service
            .set(
                "bool_key".to_string(),
                SettingValue::Boolean(true),
                SettingCategory::System,
                false,
            )
            .unwrap();
        assert_eq!(service.get("bool_key").unwrap().as_boolean(), Some(true));

        let json_val = serde_json::json!({"nested": "object"});
        service
            .set(
                "json_key".to_string(),
                SettingValue::Json(json_val.clone()),
                SettingCategory::System,
                false,
            )
            .unwrap();
        assert_eq!(service.get("json_key").unwrap().as_json(), Some(&json_val));
    }

    #[test]
    fn test_concurrent_access() {
        use std::thread;

        let service = Arc::new(Mutex::new(setup_test_service()));

        let handles: Vec<_> = (0..10)
            .map(|i| {
                let service_clone = Arc::clone(&service);
                thread::spawn(move || {
                    let service = service_clone.lock().unwrap();
                    service
                        .set(
                            format!("concurrent_key_{}", i),
                            SettingValue::Integer(i),
                            SettingCategory::System,
                            false,
                        )
                        .unwrap();
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }

        let service = service.lock().unwrap();
        for i in 0..10 {
            let value = service.get(&format!("concurrent_key_{}", i)).unwrap();
            assert_eq!(value.as_integer(), Some(i));
        }
    }

    #[test]
    fn test_error_handling() {
        let service = setup_test_service();

        assert!(service.get("nonexistent").is_err());

        let result = service.set(
            "theme".to_string(),
            SettingValue::String("invalid_theme".to_string()),
            SettingCategory::Ui,
            false,
        );
        assert!(result.is_err());
    }
}
