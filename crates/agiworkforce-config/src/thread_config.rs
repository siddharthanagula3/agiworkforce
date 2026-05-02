use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

/// Trait for loading thread-specific configuration overrides.
pub trait ThreadConfigLoader: Send + Sync {
    fn load(
        &self,
        thread_id: &str,
    ) -> Pin<Box<dyn Future<Output = Option<toml::Value>> + Send + '_>>;
}

/// No-op thread config loader that always returns `None`.
pub struct NoopThreadConfigLoader;

impl ThreadConfigLoader for NoopThreadConfigLoader {
    fn load(
        &self,
        _thread_id: &str,
    ) -> Pin<Box<dyn Future<Output = Option<toml::Value>> + Send + '_>> {
        Box::pin(async { None })
    }
}

/// Where to load thread config from.
#[derive(Debug, Clone)]
pub enum ThreadConfigSource {
    /// Config associated with a specific session.
    Session(SessionThreadConfig),
}

/// Thread-specific config associated with a session.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SessionThreadConfig {
    #[serde(default)]
    pub features: BTreeMap<String, bool>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub sandbox_mode: Option<String>,
}

/// A thread config loader backed by a static list of `ThreadConfigSource` entries.
#[derive(Debug, Clone, Default)]
pub struct StaticThreadConfigLoader {
    sources: Vec<ThreadConfigSource>,
}

impl StaticThreadConfigLoader {
    pub fn new(sources: Vec<ThreadConfigSource>) -> Self {
        Self { sources }
    }
}

impl ThreadConfigLoader for StaticThreadConfigLoader {
    fn load(
        &self,
        _thread_id: &str,
    ) -> Pin<Box<dyn Future<Output = Option<toml::Value>> + Send + '_>> {
        let sources = self.sources.clone();
        Box::pin(async move {
            for source in &sources {
                match source {
                    ThreadConfigSource::Session(cfg) => {
                        if let Ok(value) = toml::Value::try_from(cfg) {
                            return Some(value);
                        }
                    }
                }
            }
            None
        })
    }
}

/// A thread config loader that delegates to a remote endpoint.
/// This is a stub; the real implementation is in `agiworkforce-app-server`.
pub struct RemoteThreadConfigLoader {
    inner: Arc<dyn ThreadConfigLoader>,
}

impl RemoteThreadConfigLoader {
    pub fn new(inner: Arc<dyn ThreadConfigLoader>) -> Self {
        Self { inner }
    }
}

impl ThreadConfigLoader for RemoteThreadConfigLoader {
    fn load(
        &self,
        thread_id: &str,
    ) -> Pin<Box<dyn Future<Output = Option<toml::Value>> + Send + '_>> {
        self.inner.load(thread_id)
    }
}
