use crate::config::Config;
pub use agiworkforce_rollout::ARCHIVED_SESSIONS_SUBDIR;
pub use agiworkforce_rollout::INTERACTIVE_SESSION_SOURCES;
pub use agiworkforce_rollout::RolloutRecorder;
pub use agiworkforce_rollout::RolloutRecorderParams;
pub use agiworkforce_rollout::SESSIONS_SUBDIR;
pub use agiworkforce_rollout::SessionMeta;
pub use agiworkforce_rollout::append_thread_name;
pub use agiworkforce_rollout::find_archived_thread_path_by_id_str;
#[deprecated(note = "use find_thread_path_by_id_str")]
pub use agiworkforce_rollout::find_conversation_path_by_id_str;
pub use agiworkforce_rollout::find_thread_name_by_id;
pub use agiworkforce_rollout::find_thread_path_by_id_str;
pub use agiworkforce_rollout::find_thread_path_by_name_str;
pub use agiworkforce_rollout::rollout_date_parts;

impl agiworkforce_rollout::RolloutConfigView for Config {
    fn agiworkforce_home(&self) -> &std::path::Path {
        self.agiworkforce_home.as_path()
    }

    fn sqlite_home(&self) -> &std::path::Path {
        self.sqlite_home.as_path()
    }

    fn cwd(&self) -> &std::path::Path {
        self.cwd.as_path()
    }

    fn model_provider_id(&self) -> &str {
        self.model_provider_id.as_str()
    }

    fn generate_memories(&self) -> bool {
        self.memories.generate_memories
    }
}

pub mod list {
    pub use agiworkforce_rollout::list::*;
}

pub(crate) mod metadata {
    pub(crate) use agiworkforce_rollout::metadata::builder_from_items;
}

pub mod policy {
    pub use agiworkforce_rollout::policy::*;
}

pub mod recorder {
    pub use agiworkforce_rollout::recorder::*;
}

pub mod session_index {
    pub use agiworkforce_rollout::session_index::*;
}

pub(crate) use crate::session_rollout_init_error::map_session_init_error;

pub(crate) mod truncation {
    pub(crate) use crate::thread_rollout_truncation::*;
}
