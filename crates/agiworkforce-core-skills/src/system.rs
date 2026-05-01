pub(crate) use agiworkforce_skills::install_system_skills;
pub(crate) use agiworkforce_skills::system_cache_root_dir;

use agiworkforce_utils_absolute_path::AbsolutePathBuf;

pub(crate) fn uninstall_system_skills(agiworkforce_home: &AbsolutePathBuf) {
    let _ = std::fs::remove_dir_all(system_cache_root_dir(agiworkforce_home));
}
