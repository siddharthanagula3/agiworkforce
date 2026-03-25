pub(crate) use agiworkforce_skills::install_system_skills;
pub(crate) use agiworkforce_skills::system_cache_root_dir;

use std::path::Path;

pub(crate) fn uninstall_system_skills(agiworkforce_home: &Path) {
    let system_skills_dir = system_cache_root_dir(agiworkforce_home);
    let _ = std::fs::remove_dir_all(&system_skills_dir);
}
