use std::path::Path;
fn unsafe_to_overwrite(path: &Path) -> Option<String> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if metadata.file_type().is_symlink() {
        return Some("it is a symbolic link".to_string());
    }
    if !metadata.is_file() {
        return Some("it is not a regular file".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() > 1 {
            return Some("it is hard-linked to another file".to_string());
        }
    }
    None
}


fn main() {
    let base = std::env::args().nth(1).unwrap();
    let root = Path::new(&base);
    let workspace = root.join("workspace");
    let outside = root.join("outside");
    std::fs::create_dir_all(workspace.join("sub")).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    let path = workspace.join("sub/retained.txt");
    std::fs::write(&path, b"saved-before").unwrap();
    std::fs::write(outside.join("retained.txt"), b"outside-sentinel").unwrap();
    std::fs::write(outside.join("new-file.txt"), b"outside-sentinel").unwrap();
    std::fs::rename(workspace.join("sub"),workspace.join("sub-original")).unwrap();
    std::os::unix::fs::symlink(&outside,workspace.join("sub")).unwrap();
    let reason=unsafe_to_overwrite(&path);
    println!("extracted_guard_reason={reason:?}");
    if reason.is_none() {
        let bytes=b"saved-before";
        path.parent().map_or(Ok(()),std::fs::create_dir_all).and_then(|()|std::fs::write(&path,bytes)).unwrap();
    }
    println!("outside_file_overwritten={}",std::fs::read(outside.join("retained.txt")).unwrap()==b"saved-before");
    std::fs::remove_file(workspace.join("sub/new-file.txt")).unwrap();
    println!("outside_new_file_removed={}",!outside.join("new-file.txt").exists());
}
