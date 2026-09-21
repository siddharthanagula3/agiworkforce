fn main() {
    let mut attributes = tauri_build::Attributes::new();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rerun-if-changed=windows-app-manifest.xml");
        println!("cargo:rerun-if-changed=windows-app-manifest.rc");
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        // Tauri links its manifest only to binaries; library tests also need Common Controls v6.
        embed_resource::compile_for_everything("windows-app-manifest.rc", embed_resource::NONE)
            .manifest_required()
            .expect("failed to embed the Windows application manifest");
    }
    tauri_build::try_build(attributes).expect("failed to build Tauri resources");
}
