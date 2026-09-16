use once_cell::sync::Lazy;
use regex::RegexSet;

pub const SENSITIVE_FILE_PATTERNS: &[&str] = &[
    r"(?i)(^|/)\.env(\..+)?$",
    r"(?i)(^|/)\.envrc$",
    r"(?i)(^|/)secrets?\.(json|ya?ml|toml|env|txt|js|ts)$",
    r"(?i)(^|/).*credentials?(\.[A-Za-z0-9]+)?$",
    r"(?i)(^|/)\.netrc$",
    r"(?i)(^|/)\.npmrc$",
    r"(?i)(^|/)\.pypirc$",
    r"(?i)(^|/)\.dockercfg$",
    r"(?i)(^|/)\.docker/config\.json$",
    r"(?i)(^|/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$",
    r"(?i)\.(pem|p12|pfx|key|crt|cer|gpg|asc)$",
    r"(?i)(^|/)authorized_keys$",
    r"(?i)(^|/)known_hosts$",
    r"(?i)(^|/)\.ssh/",
    r"(?i)(^|/)\.gnupg/",
    r"(?i)(^|/)\.aws/",
    r"(?i)(^|/)\.gcloud/",
    r"(?i)(^|/)\.config/gcloud/",
    r"(?i)(^|/)\.azure/",
    r"(?i)(^|/)\.kube/config$",
    r"(?i)(^|/)\.git/(config|credentials)$",
    r"(?i)(^|/)\.git-credentials$",
    r"(?i)(^|/)\.(github|gitlab)_token$",
];

static SENSITIVE_SET: Lazy<RegexSet> =
    Lazy::new(|| RegexSet::new(SENSITIVE_FILE_PATTERNS).expect("sensitive file patterns compile"));

pub fn is_sensitive_file(path_like: &str) -> bool {
    if path_like.is_empty() {
        return false;
    }
    SENSITIVE_SET.is_match(&path_like.replace('\\', "/"))
}

pub fn sensitive_refusal(path_like: &str) -> String {
    format!(
        "Refusing to read {}: it matches the credential-file policy, so its contents would reach \
         the model and the session transcript. Open it yourself, or pass the one value the task \
         needs.",
        path_like
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_the_files_that_hold_credentials() {
        for path in [
            ".env",
            ".env.local",
            "apps/web/.env.production",
            ".envrc",
            "config/secrets.json",
            "deploy/secrets.yaml",
            "aws_credentials",
            "app/credential.txt",
            ".netrc",
            ".npmrc",
            ".pypirc",
            ".dockercfg",
            ".docker/config.json",
            "~/.ssh/id_rsa",
            "keys/id_ed25519.pub",
            "certs/server.pem",
            "certs/client.p12",
            "private.key",
            ".ssh/authorized_keys",
            ".ssh/known_hosts",
            ".gnupg/secring.gpg",
            ".aws/credentials",
            ".gcloud/access_tokens.db",
            ".config/gcloud/creds",
            ".azure/accessTokens.json",
            ".kube/config",
            ".git/config",
            ".git-credentials",
            ".github_token",
        ] {
            assert!(is_sensitive_file(path), "should be sensitive: {path}");
        }
    }

    #[test]
    fn leaves_ordinary_source_files_alone() {
        for path in [
            "src/main.rs",
            "README.md",
            "package.json",
            "apps/web/app/page.tsx",
            "environment.ts",
            "docs/credentials-guide.md",
            "keyboard.ts",
        ] {
            assert!(!is_sensitive_file(path), "should be readable: {path}");
        }
    }

    #[test]
    fn reads_windows_separators_the_same_way() {
        assert!(is_sensitive_file(r"apps\web\.env"));
        assert!(is_sensitive_file(r"C:\Users\me\.ssh\id_rsa"));
    }

    #[test]
    fn an_empty_path_is_not_sensitive() {
        assert!(!is_sensitive_file(""));
    }
}

#[cfg(test)]
mod parity {
    use super::SENSITIVE_FILE_PATTERNS;
    use std::path::Path;

    /// The TypeScript surfaces gate on `packages/platform/utils/src/sensitiveFiles.ts`.
    /// Two lists that drift leave one surface reading what the other refuses, so the
    /// count is pinned here and the file is named for whoever changes either side.
    #[test]
    fn matches_the_typescript_policy_pattern_for_pattern() {
        let ts = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/platform/utils/src/sensitiveFiles.ts");
        let source =
            std::fs::read_to_string(&ts).unwrap_or_else(|e| panic!("read {}: {e}", ts.display()));
        let ts_count = source
            .lines()
            .filter(|line| {
                line.trim_start().starts_with("/(^|\\/)") || line.trim_start().starts_with("/\\.")
            })
            .count();
        assert_eq!(
            ts_count,
            SENSITIVE_FILE_PATTERNS.len(),
            "sensitiveFiles.ts has {} patterns, this module has {}; add the missing rule to both",
            ts_count,
            SENSITIVE_FILE_PATTERNS.len()
        );
    }
}
