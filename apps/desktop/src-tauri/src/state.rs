use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, RwLock,
    },
};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DockPosition {
    Left,
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self {
            x: 120.0,
            y: 120.0,
            width: 420.0,
            height: 760.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentWindowState {
    pub pinned: bool,
    pub always_on_top: bool,
    pub dock: Option<DockPosition>,
    pub geometry: Option<WindowGeometry>,
    pub previous_geometry: Option<WindowGeometry>,
}

impl Default for PersistentWindowState {
    fn default() -> Self {
        Self {
            pinned: true,
            always_on_top: false,
            dock: None,
            geometry: Some(WindowGeometry::default()),
            previous_geometry: None,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    inner: Arc<RwLock<PersistentWindowState>>,
    storage_path: Arc<PathBuf>,
    suppress_events: Arc<AtomicBool>,
}

impl AppState {
    pub fn load(app: &AppHandle) -> anyhow::Result<Self> {
        let path = app.path().app_config_dir()?.join("window_state.json");

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let initial_state = match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str::<PersistentWindowState>(&contents)?,
            Err(_) => PersistentWindowState::default(),
        };

        Ok(Self {
            inner: Arc::new(RwLock::new(initial_state)),
            storage_path: Arc::new(path),
            suppress_events: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn snapshot(&self) -> PersistentWindowState {
        self.inner
            .read()
            .map(|state| state.clone())
            .unwrap_or_else(|_| PersistentWindowState::default())
    }

    pub fn update<F>(&self, mutator: F) -> anyhow::Result<()>
    where
        F: FnOnce(&mut PersistentWindowState) -> bool,
    {
        let mut guard = self.inner.write().unwrap();
        let mutated = mutator(&mut guard);
        if mutated {
            self.persist_locked(&guard)?;
        }
        Ok(())
    }

    pub fn with_state<F, T>(&self, accessor: F) -> T
    where
        F: FnOnce(&PersistentWindowState) -> T,
    {
        accessor(&self.inner.read().unwrap())
    }

    pub fn is_events_suppressed(&self) -> bool {
        self.suppress_events.load(Ordering::SeqCst)
    }

    pub fn suppress_events<F, T>(&self, action: F) -> tauri::Result<T>
    where
        F: FnOnce() -> tauri::Result<T>,
    {
        self.suppress_events.store(true, Ordering::SeqCst);
        let result = action();
        self.suppress_events.store(false, Ordering::SeqCst);
        result
    }

    fn persist_locked(&self, state: &PersistentWindowState) -> anyhow::Result<()> {
        let serialized = serde_json::to_string_pretty(state)?;
        fs::write(&*self.storage_path, serialized)?;
        Ok(())
    }
}
