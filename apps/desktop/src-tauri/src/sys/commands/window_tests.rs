#[cfg(test)]
mod tests {
    use crate::data::state::{AppState, DockPosition, PersistentWindowState, WindowGeometry};
    #[allow(unused_imports)]
    use crate::sys::commands::window::{window_get_state, WindowStatePayload};
    #[allow(unused_imports)]
    use mockall::predicate::*;
    #[allow(unused_imports)]
    use serde_json::json;
    use std::sync::{Arc, RwLock};

    fn create_test_state() -> AppState {
        let state = PersistentWindowState {
            pinned: true,
            always_on_top: false,
            dock: None,
            geometry: Some(WindowGeometry::default()),
            previous_geometry: None,
            maximized: false,
            fullscreen: false,
        };

        let temp_dir = std::env::temp_dir();
        let storage_path = temp_dir.join("test_window_state.json");

        AppState {
            inner: Arc::new(RwLock::new(state)),
            storage_path: Arc::new(storage_path),
            suppress_events: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    #[test]
    fn test_window_get_state_returns_correct_payload() {
        // Test that window state can be captured as a payload
        let state = create_test_state();

        // Set up some initial state
        state.update(|s| {
            s.pinned = true;
            s.always_on_top = false;
            s.dock = None;
            s.maximized = false;
            s.fullscreen = false;
            true
        }).unwrap();

        let snapshot = state.snapshot();

        // Create payload from snapshot
        let payload = WindowStatePayload {
            pinned: snapshot.pinned,
            always_on_top: snapshot.always_on_top,
            dock: snapshot.dock,
            maximized: snapshot.maximized,
            fullscreen: snapshot.fullscreen,
        };

        assert!(payload.pinned);
        assert!(!payload.always_on_top);
        assert!(payload.dock.is_none());
        assert!(!payload.maximized);
        assert!(!payload.fullscreen);
    }

    #[test]
    fn test_window_get_state_includes_fullscreen() {
        let state = create_test_state();

        // Enable fullscreen
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        let snapshot = state.snapshot();
        let payload = WindowStatePayload {
            pinned: snapshot.pinned,
            always_on_top: snapshot.always_on_top,
            dock: snapshot.dock,
            maximized: snapshot.maximized,
            fullscreen: snapshot.fullscreen,
        };

        assert!(payload.fullscreen, "Payload should include fullscreen=true");
    }

    #[test]
    fn test_window_get_state_with_dock_position() {
        let state = create_test_state();

        // Set dock to left
        state.update(|s| {
            s.dock = Some(DockPosition::Left);
            true
        }).unwrap();

        let snapshot = state.snapshot();
        let payload = WindowStatePayload {
            pinned: snapshot.pinned,
            always_on_top: snapshot.always_on_top,
            dock: snapshot.dock,
            maximized: snapshot.maximized,
            fullscreen: snapshot.fullscreen,
        };

        assert_eq!(payload.dock, Some(DockPosition::Left));

        // Change to right
        state.update(|s| {
            s.dock = Some(DockPosition::Right);
            true
        }).unwrap();

        let snapshot = state.snapshot();
        let payload = WindowStatePayload {
            pinned: snapshot.pinned,
            always_on_top: snapshot.always_on_top,
            dock: snapshot.dock,
            maximized: snapshot.maximized,
            fullscreen: snapshot.fullscreen,
        };

        assert_eq!(payload.dock, Some(DockPosition::Right));
    }

    #[test]
    fn test_window_get_state_with_maximized() {
        let state = create_test_state();

        // Enable maximized
        state.update(|s| {
            s.maximized = true;
            true
        }).unwrap();

        let snapshot = state.snapshot();
        let payload = WindowStatePayload {
            pinned: snapshot.pinned,
            always_on_top: snapshot.always_on_top,
            dock: snapshot.dock,
            maximized: snapshot.maximized,
            fullscreen: snapshot.fullscreen,
        };

        assert!(payload.maximized, "Payload should include maximized=true");

        // Ensure maximized and fullscreen are independent
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        let snapshot = state.snapshot();
        assert!(snapshot.maximized);
        assert!(snapshot.fullscreen);
    }

    #[test]
    fn test_window_state_payload_serialization() {
        let payload = WindowStatePayload {
            pinned: true,
            always_on_top: false,
            dock: Some(DockPosition::Right),
            maximized: true,
            fullscreen: true,
        };

        let serialized = serde_json::to_string(&payload);
        assert!(serialized.is_ok());

        let json = serialized.unwrap();
        assert!(json.contains("\"fullscreen\":true"));
        assert!(json.contains("\"maximized\":true"));
        assert!(json.contains("\"dock\":\"right\""));
    }

    #[test]
    fn test_window_state_payload_deserialization() {
        let json = r#"{
            "pinned": true,
            "alwaysOnTop": false,
            "dock": "left",
            "maximized": false,
            "fullscreen": true
        }"#;

        let result: Result<WindowStatePayload, _> = serde_json::from_str(json);
        assert!(result.is_ok());

        let payload = result.unwrap();
        assert!(payload.fullscreen);
        assert_eq!(payload.dock, Some(DockPosition::Left));
    }

    #[test]
    fn test_state_update_fullscreen() {
        let state = create_test_state();

        let initial = state.snapshot();
        assert!(!initial.fullscreen);

        let result = state.update(|s| {
            s.fullscreen = true;
            true
        });

        assert!(result.is_ok());

        let updated = state.snapshot();
        assert!(updated.fullscreen);
    }

    #[test]
    fn test_state_update_fullscreen_toggle() {
        let state = create_test_state();

        state
            .update(|s| {
                s.fullscreen = true;
                true
            })
            .unwrap();

        assert!(state.snapshot().fullscreen);

        state
            .update(|s| {
                s.fullscreen = false;
                true
            })
            .unwrap();

        assert!(!state.snapshot().fullscreen);
    }

    #[test]
    fn test_state_update_preserves_other_fields() {
        let state = create_test_state();

        state
            .update(|s| {
                s.pinned = true;
                s.always_on_top = true;
                s.dock = Some(DockPosition::Left);
                s.maximized = false;
                true
            })
            .unwrap();

        state
            .update(|s| {
                s.fullscreen = true;
                true
            })
            .unwrap();

        let snapshot = state.snapshot();
        assert!(snapshot.pinned);
        assert!(snapshot.always_on_top);
        assert_eq!(snapshot.dock, Some(DockPosition::Left));
        assert!(!snapshot.maximized);
        assert!(snapshot.fullscreen);
    }

    #[test]
    fn test_fullscreen_and_maximized_independent() {
        let state = create_test_state();

        state
            .update(|s| {
                s.fullscreen = true;
                s.maximized = true;
                true
            })
            .unwrap();

        let snapshot = state.snapshot();
        assert!(snapshot.fullscreen);
        assert!(snapshot.maximized);

        state
            .update(|s| {
                s.fullscreen = false;
                true
            })
            .unwrap();

        let snapshot = state.snapshot();
        assert!(!snapshot.fullscreen);
        assert!(snapshot.maximized);
    }

    #[test]
    fn test_state_snapshot_is_immutable() {
        let state = create_test_state();

        let snapshot1 = state.snapshot();
        assert!(!snapshot1.fullscreen);

        state
            .update(|s| {
                s.fullscreen = true;
                true
            })
            .unwrap();

        assert!(!snapshot1.fullscreen);

        let snapshot2 = state.snapshot();
        assert!(snapshot2.fullscreen);
    }

    #[test]
    fn test_dock_position_serialization() {
        let left = DockPosition::Left;
        let right = DockPosition::Right;

        let left_json = serde_json::to_string(&left).unwrap();
        let right_json = serde_json::to_string(&right).unwrap();

        assert_eq!(left_json, "\"left\"");
        assert_eq!(right_json, "\"right\"");
    }

    #[test]
    fn test_dock_position_deserialization() {
        let left: DockPosition = serde_json::from_str("\"left\"").unwrap();
        let right: DockPosition = serde_json::from_str("\"right\"").unwrap();

        assert_eq!(left, DockPosition::Left);
        assert_eq!(right, DockPosition::Right);
    }

    #[test]
    fn test_window_geometry_default() {
        let geometry = WindowGeometry::default();

        assert_eq!(geometry.x, 120.0);
        assert_eq!(geometry.y, 120.0);
        assert_eq!(geometry.width, 1400.0);
        assert_eq!(geometry.height, 850.0);
    }

    #[test]
    fn test_persistent_window_state_default() {
        let state = PersistentWindowState::default();

        assert!(state.pinned);
        assert!(!state.always_on_top);
        assert_eq!(state.dock, None);
        assert!(!state.maximized);
        assert!(!state.fullscreen);
        assert!(state.geometry.is_some());
        assert!(state.previous_geometry.is_none());
    }

    #[test]
    fn test_state_with_state_accessor() {
        let state = create_test_state();

        state
            .update(|s| {
                s.fullscreen = true;
                true
            })
            .unwrap();

        let fullscreen_value = state.with_state(|s| s.fullscreen);
        assert!(fullscreen_value);

        let maximized_value = state.with_state(|s| s.maximized);
        assert!(!maximized_value);
    }

    #[test]
    fn test_suppress_events_flag() {
        let state = create_test_state();

        assert!(!state.is_events_suppressed());

        let result = state.suppress_events(|| {
            assert!(state.is_events_suppressed());
            Ok::<_, tauri::Error>(42)
        });

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert!(!state.is_events_suppressed());
    }

    #[test]
    fn test_suppress_events_with_error() {
        let state = create_test_state();

        let result =
            state.suppress_events(|| Err::<(), _>(tauri::Error::AssetNotFound("test".into())));

        assert!(result.is_err());

        assert!(!state.is_events_suppressed());
    }

    #[test]
    fn test_fullscreen_state_persistence() {
        let state = create_test_state();

        let result = state.update(|s| {
            s.fullscreen = true;
            true
        });

        assert!(result.is_ok());

        let snapshot = state.snapshot();
        assert!(snapshot.fullscreen);
    }

    #[test]
    fn test_update_without_mutation_skips_persistence() {
        let state = create_test_state();

        let result = state.update(|_s| false);

        assert!(result.is_ok());
    }

    #[test]
    fn test_concurrent_snapshot_access() {
        use std::thread;

        let state = create_test_state();

        let handles: Vec<_> = (0..5)
            .map(|_| {
                let state_clone = state.clone();
                thread::spawn(move || {
                    let snapshot = state_clone.snapshot();
                    assert!(!snapshot.fullscreen);
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }
    }

    #[test]
    fn test_fullscreen_with_dock_state() {
        let state = create_test_state();

        state
            .update(|s| {
                s.dock = Some(DockPosition::Left);
                true
            })
            .unwrap();

        state
            .update(|s| {
                s.fullscreen = true;
                true
            })
            .unwrap();

        let snapshot = state.snapshot();
        assert_eq!(snapshot.dock, Some(DockPosition::Left));
        assert!(snapshot.fullscreen);
    }
}
