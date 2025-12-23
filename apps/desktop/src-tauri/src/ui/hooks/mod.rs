pub mod config;
pub mod executor;
pub mod types;

pub use config::HookConfig;
pub use executor::HookExecutor;
pub use types::{EventContext, Hook, HookEvent, HookEventType, HookExecutionResult};

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct HookRegistry {
    executor: Arc<HookExecutor>,
    config_path: std::path::PathBuf,
}

impl HookRegistry {
    pub fn new() -> Result<Self> {
        let config_path = HookConfig::default_config_path()?;
        let executor = Arc::new(HookExecutor::new());

        Ok(Self {
            executor,
            config_path,
        })
    }

    pub async fn initialize(&self) -> Result<()> {
        let config = HookConfig::load_from_file(&self.config_path)?;
        self.executor.load_hooks(config.hooks).await;
        tracing::info!(
            "Hook registry initialized with {} hooks",
            self.executor.list_hooks().await.len()
        );
        Ok(())
    }

    pub fn emit_event(&self, event: HookEvent) {
        let executor = self.executor.clone();
        tokio::spawn(async move {
            let results = executor.execute_hooks(event).await;
            for result in results {
                if !result.success {
                    tracing::warn!("Hook '{}' failed: {:?}", result.hook_name, result.error);
                }
            }
        });
    }

    pub async fn emit_event_sync(&self, event: HookEvent) -> Vec<HookExecutionResult> {
        self.executor.execute_hooks(event).await
    }

    pub async fn list_hooks(&self) -> Vec<Hook> {
        self.executor.list_hooks().await
    }

    pub async fn add_hook(&self, hook: Hook) -> Result<()> {
        self.executor.add_hook(hook.clone()).await?;

        let mut config = HookConfig::load_from_file(&self.config_path)?;
        config.add_hook(hook)?;
        config.save_to_file(&self.config_path)?;

        Ok(())
    }

    pub async fn remove_hook(&self, name: &str) -> Result<()> {
        self.executor.remove_hook(name).await?;

        let mut config = HookConfig::load_from_file(&self.config_path)?;
        config.remove_hook(name)?;
        config.save_to_file(&self.config_path)?;

        Ok(())
    }

    pub async fn toggle_hook(&self, name: &str, enabled: bool) -> Result<()> {
        self.executor.toggle_hook(name, enabled).await?;

        let mut config = HookConfig::load_from_file(&self.config_path)?;
        config.toggle_hook(name, enabled)?;
        config.save_to_file(&self.config_path)?;

        Ok(())
    }

    pub async fn update_hook(&self, hook: Hook) -> Result<()> {
        self.executor.remove_hook(&hook.name).await?;
        self.executor.add_hook(hook.clone()).await?;

        let mut config = HookConfig::load_from_file(&self.config_path)?;
        config.update_hook(hook)?;
        config.save_to_file(&self.config_path)?;

        Ok(())
    }

    pub fn executor(&self) -> Arc<HookExecutor> {
        self.executor.clone()
    }
}

impl Default for HookRegistry {
    fn default() -> Self {
        Self::new().expect("Failed to create default hook registry")
    }
}

pub struct GlobalHookRegistry {
    registry: RwLock<Option<Arc<HookRegistry>>>,
}

impl Default for GlobalHookRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl GlobalHookRegistry {
    pub const fn new() -> Self {
        Self {
            registry: RwLock::const_new(None),
        }
    }

    pub async fn initialize(&self) -> Result<()> {
        let registry = Arc::new(HookRegistry::new()?);
        registry.initialize().await?;

        let mut guard = self.registry.write().await;
        *guard = Some(registry);

        Ok(())
    }

    pub async fn get(&self) -> Option<Arc<HookRegistry>> {
        self.registry.read().await.clone()
    }

    pub async fn emit(&self, event: HookEvent) {
        if let Some(registry) = self.get().await {
            registry.emit_event(event);
        }
    }

    pub async fn emit_sync(&self, event: HookEvent) -> Vec<HookExecutionResult> {
        if let Some(registry) = self.get().await {
            registry.emit_event_sync(event).await
        } else {
            Vec::new()
        }
    }
}

static GLOBAL_HOOKS: GlobalHookRegistry = GlobalHookRegistry::new();

pub fn global_hooks() -> &'static GlobalHookRegistry {
    &GLOBAL_HOOKS
}

pub async fn emit_event(event: HookEvent) {
    GLOBAL_HOOKS.emit(event).await;
}

pub async fn emit_event_sync(event: HookEvent) -> Vec<HookExecutionResult> {
    GLOBAL_HOOKS.emit_sync(event).await
}
