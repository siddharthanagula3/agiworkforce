fn main() {
    // winres is only relevant on Windows; on other platforms this is a no-op.
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.compile().expect("failed to compile Windows resources");
    }
}
