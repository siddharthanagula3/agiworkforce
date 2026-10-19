use once_cell::sync::Lazy;
use regex::RegexSet;

pub const SENSITIVE_FILE_PATTERNS: &[&str] = &[
    r"(?i)(^|/)\.env(\..+)?$",
    r"(?i)(^|/)\.envrc$",
    r"(?i)(^|/)secrets?\.(json|ya?ml|toml|env|txt)$",
    r"(?i)(^|/)[^/]*credentials?(\.(json|ya?ml|toml|txt|ini|db|csv|xml))?$",
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
    // Terraform state holds every resource attribute in plain text, including the
    // secrets a provider generated, and a .tfvars file is where the inputs to it
    // are kept. Both are ordinary-looking project files.
    r"(?i)(^|/).*\.tfstate(\.backup)?$",
    r"(?i)(^|/)terraform\.tfstate\.d/",
    r"(?i)(^|/).*\.auto\.tfvars(\.json)?$",
    r"(?i)(^|/)terraform\.tfvars(\.json)?$",
    r"(?i)(^|/)\.terraform/terraform\.tfstate$",
    r"(?i)(^|/)\.terraformrc$",
    r"(?i)(^|/)terraform\.rc$",
];

static SENSITIVE_SET: Lazy<RegexSet> =
    Lazy::new(|| RegexSet::new(SENSITIVE_FILE_PATTERNS).expect("sensitive file patterns compile"));

const ENVIRONMENT_PATTERN_COUNT: usize = 2;
const ENVIRONMENT_TEMPLATE_SUFFIXES: [&str; 3] = [".example", ".sample", ".template"];

fn is_environment_template(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    name.starts_with(".env.")
        && ENVIRONMENT_TEMPLATE_SUFFIXES
            .iter()
            .any(|suffix| name.ends_with(suffix))
}

pub fn is_sensitive_file(path_like: &str) -> bool {
    if path_like.is_empty() {
        return false;
    }
    let normalized = path_like.replace('\\', "/");
    let matches = SENSITIVE_SET.matches(&normalized);
    if is_environment_template(&normalized) {
        return matches
            .iter()
            .any(|index| index >= ENVIRONMENT_PATTERN_COUNT);
    }
    matches.matched_any()
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
            "apps/web/lib/server/account-security/secrets.ts",
            "src/vault_credentials.rs",
            ".env.example",
            "apps/web/.env.local.template",
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

    /// The TypeScript surfaces gate on `packages/contracts/local-runtime/src/filesystem.ts`.
    /// Two lists that drift leave one surface reading what the other refuses, so every
    /// regex literal there must equal the rule at the same position here.
    #[test]
    fn matches_the_typescript_policy_pattern_for_pattern() {
        let ts = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/contracts/local-runtime/src/filesystem.ts");
        let source =
            std::fs::read_to_string(&ts).unwrap_or_else(|e| panic!("read {}: {e}", ts.display()));
        let literal = regex::Regex::new(
            r"/((?:\(\^\|\\/\)|\\\.)(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])*)/i[,\]]",
        )
        .expect("regex literal pattern compiles");
        let ts_patterns: Vec<String> = literal
            .captures_iter(&source)
            .map(|found| format!("(?i){}", found[1].replace(r"\/", "/")))
            .collect();
        assert_eq!(
            ts_patterns, SENSITIVE_FILE_PATTERNS,
            "filesystem.ts and this module list different credential-file rules; change both"
        );
    }
}
