use agiworkforce_desktop_gpui::rich_text::browser_link;

#[test]
fn only_absolute_credential_free_web_links_reach_the_browser() {
    for target in [
        "https://example.com/research?q=rust#section",
        "http://localhost:4318/report",
        "https://例え.テスト/第二章",
    ] {
        assert!(browser_link(target).is_ok(), "{target}");
    }
    for target in [
        "file:///etc/passwd",
        "/tmp/report.html",
        "../notes.txt",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "command:execute",
        "agiworkforce://run/tool",
        "mailto:someone@example.com",
        "https://name:password@example.com/",
        "https://name@example.com/",
        "https://example.com/\nreport",
        "https://example.com/\0report",
        "//example.com/report",
        "#section",
    ] {
        assert!(browser_link(target).is_err(), "{target}");
    }
}
