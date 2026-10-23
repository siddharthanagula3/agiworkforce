pub const OPEN_SOURCE_NOTICES: &str = include_str!("../assets/THIRD_PARTY_NOTICES.txt");

#[cfg(test)]
mod tests {
    use super::OPEN_SOURCE_NOTICES;

    #[test]
    fn notices_name_the_crates_the_binary_links() {
        assert!(OPEN_SOURCE_NOTICES.starts_with("Command-line tool open-source notices\n"));
        for crate_name in ["serde ", "tokio ", "clap "] {
            assert!(
                OPEN_SOURCE_NOTICES.contains(&format!("\n{crate_name}")),
                "missing {crate_name}"
            );
        }
        assert!(OPEN_SOURCE_NOTICES.contains("License texts"));
        assert!(OPEN_SOURCE_NOTICES.ends_with('\n'));
    }
}
