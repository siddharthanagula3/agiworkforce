pub fn host_absolute(path: &str) -> String {
    debug_assert!(path.starts_with('/'));
    if cfg!(windows) {
        format!("C:{path}")
    } else {
        path.to_owned()
    }
}
