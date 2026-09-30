//! The workspace's website allow and block lists, applied to web_search and
//! web_fetch on this machine. A contract match with the web gateway's
//! `researchDomainAllowed` (apps/web/.../research-sources.ts): a rule covers its
//! subdomains, a leading `www.` is ignored, a block beats an allow, and a
//! non-empty allow list refuses everything not on it.

use crate::claude_parity::connectors::ConnectorAccessPolicy;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct SiteRules {
    allow: Vec<String>,
    deny: Vec<String>,
}

fn strip_www(host: &str) -> &str {
    host.strip_prefix("www.").unwrap_or(host)
}

/// Accepts what an administrator types: a bare domain, a leading dot, a `*.`
/// wildcard or a whole URL. An internationalised name becomes its punycode
/// form, which is what a URL's host carries. Anything else narrows nothing.
fn normalize_rule(raw: &str) -> Option<String> {
    let value = raw.trim();
    let value = value
        .strip_prefix("*.")
        .or_else(|| value.strip_prefix('.'))
        .unwrap_or(value);
    let as_url = if value.contains("://") {
        value.to_string()
    } else {
        format!("https://{value}")
    };
    let parsed = reqwest::Url::parse(&as_url).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();
    let host = strip_www(host.trim_end_matches('.'));
    let valid = !host.is_empty()
        && host.contains('.')
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    valid.then(|| host.to_string())
}

fn host_of(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();
    Some(strip_www(host.trim_end_matches('.')).to_string())
}

fn matches_rule(host: &str, rule: &str) -> bool {
    host == rule || host.ends_with(&format!(".{rule}"))
}

impl SiteRules {
    pub(crate) fn from_policy(policy: &ConnectorAccessPolicy) -> Option<Self> {
        let normalize = |values: &[String]| {
            let mut rules: Vec<String> = values.iter().filter_map(|v| normalize_rule(v)).collect();
            rules.sort();
            rules.dedup();
            rules
        };
        let rules = Self {
            allow: normalize(&policy.allowed_web_domains),
            deny: normalize(&policy.blocked_web_domains),
        };
        (!rules.allow.is_empty() || !rules.deny.is_empty()).then_some(rules)
    }

    /// Why this URL may not be read, or None when the rules admit it. A URL
    /// that will not parse is refused only when an allow list is in force.
    pub(crate) fn refusal(&self, url: &str) -> Option<String> {
        let Some(host) = host_of(url) else {
            return (!self.allow.is_empty()).then(|| {
                format!(
                    "Your workspace administrator limits which websites the assistant may read, \
                     and {url} could not be checked against that list."
                )
            });
        };
        if self.deny.iter().any(|rule| matches_rule(&host, rule)) {
            return Some(format!(
                "Your workspace administrator has blocked {host}, so the assistant may not read it."
            ));
        }
        if !self.allow.is_empty() && !self.allow.iter().any(|rule| matches_rule(&host, rule)) {
            return Some(format!(
                "Your workspace administrator limits which websites the assistant may read, and \
                 {host} is not on the approved list."
            ));
        }
        None
    }
}

/// The rules in force for this process, read with the stored sign-in. Err
/// refuses every website: the account's workspace rules could not be read.
pub(crate) async fn current() -> Result<Option<SiteRules>, String> {
    use crate::claude_parity::connectors::{policy_for_local_tools, LocalToolPolicy};
    match policy_for_local_tools().await {
        LocalToolPolicy::Unrestricted => Ok(None),
        LocalToolPolicy::Rules(policy) => Ok(SiteRules::from_policy(&policy)),
        LocalToolPolicy::Unreadable(reason) => Err(reason),
    }
}

/// Why the workspace's rules refuse this URL, if they do.
pub(crate) async fn refusal_for(url: &str) -> Option<String> {
    match current().await {
        Ok(rules) => rules.and_then(|rules| rules.refusal(url)),
        Err(reason) => Some(reason),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(allow: &[&str], deny: &[&str]) -> SiteRules {
        SiteRules::from_policy(&ConnectorAccessPolicy {
            allowed_web_domains: allow.iter().map(|s| s.to_string()).collect(),
            blocked_web_domains: deny.iter().map(|s| s.to_string()).collect(),
            ..ConnectorAccessPolicy::default()
        })
        .expect("rules in force")
    }

    #[test]
    fn no_lists_means_no_rules() {
        assert_eq!(
            SiteRules::from_policy(&ConnectorAccessPolicy::default()),
            None
        );
    }

    #[test]
    fn a_block_covers_subdomains_and_ignores_www() {
        let r = rules(&[], &["example.com"]);
        assert!(r.refusal("https://example.com/a").is_some());
        assert!(r.refusal("https://www.example.com/a").is_some());
        assert!(r.refusal("https://docs.example.com/a").is_some());
        assert!(r.refusal("https://notexample.com/a").is_none());
        assert!(r.refusal("not a url").is_none());
    }

    #[test]
    fn an_allow_list_refuses_everything_else_and_a_block_beats_it() {
        let r = rules(
            &["*.docs.rs", "https://www.rust-lang.org/learn"],
            &["blog.rust-lang.org"],
        );
        assert!(r.refusal("https://docs.rs/serde").is_none());
        assert!(r.refusal("https://rust-lang.org/").is_none());
        assert!(r.refusal("https://blog.rust-lang.org/post").is_some());
        assert!(r.refusal("https://example.com/").is_some());
        assert!(r.refusal("not a url").is_some());
    }

    #[test]
    fn a_trailing_dot_does_not_slip_past_a_block() {
        let r = rules(&[], &["blocked.com"]);
        assert!(r.refusal("https://blocked.com./page").is_some());
        assert!(r.refusal("https://www.blocked.com./page").is_some());
    }

    #[test]
    fn an_internationalised_rule_matches_its_punycode_host() {
        let r = rules(&[], &["bücher.example"]);
        assert!(r.refusal("https://xn--bcher-kva.example/").is_some());
        assert!(r.refusal("https://bücher.example/").is_some());
    }

    #[test]
    fn a_rule_that_is_not_a_domain_narrows_nothing() {
        assert_eq!(
            SiteRules::from_policy(&ConnectorAccessPolicy {
                blocked_web_domains: vec!["not a domain".to_string(), "localhost".to_string()],
                ..ConnectorAccessPolicy::default()
            }),
            None
        );
    }

    mod policy_read {
        use crate::claude_parity::connectors::{
            local_tool_policy_from, ConnectorAccessPolicy, LocalToolPolicy,
        };
        use crate::cloud::CloudError;

        fn transport() -> CloudError {
            CloudError::Transport("connection reset".to_string())
        }

        #[test]
        fn signed_out_or_personal_accounts_stay_unrestricted() {
            assert_eq!(
                local_tool_policy_from(Err(CloudError::SignedOut), true),
                LocalToolPolicy::Unrestricted
            );
            let not_member = CloudError::Api {
                status: 403,
                message: "not a member".to_string(),
            };
            assert_eq!(
                local_tool_policy_from(Err(not_member), true),
                LocalToolPolicy::Unrestricted
            );
            assert_eq!(
                local_tool_policy_from(Err(transport()), false),
                LocalToolPolicy::Unrestricted
            );
            assert_eq!(
                local_tool_policy_from(Ok(None), true),
                LocalToolPolicy::Unrestricted
            );
        }

        #[test]
        fn a_workspace_member_whose_rules_cannot_be_read_is_refused() {
            assert!(matches!(
                local_tool_policy_from(Err(transport()), true),
                LocalToolPolicy::Unreadable(_)
            ));
            assert!(matches!(
                local_tool_policy_from(Err(CloudError::SessionExpired), true),
                LocalToolPolicy::Unreadable(reason) if reason.contains("agi login")
            ));
        }

        #[test]
        fn a_read_is_reused_only_for_the_same_account() {
            use crate::claude_parity::connectors::cached_read_reusable;
            use std::time::Duration;
            let rules = LocalToolPolicy::Rules(ConnectorAccessPolicy::default());
            assert!(cached_read_reusable(
                Some("a"),
                rules.clone(),
                Duration::ZERO,
                Some("a")
            ));
            assert!(!cached_read_reusable(
                Some("a"),
                rules.clone(),
                Duration::ZERO,
                Some("b")
            ));
            assert!(!cached_read_reusable(
                Some("a"),
                rules,
                Duration::ZERO,
                None
            ));
            let unreadable = LocalToolPolicy::Unreadable("x".to_string());
            assert!(cached_read_reusable(
                Some("a"),
                unreadable.clone(),
                Duration::from_secs(5),
                Some("a")
            ));
            assert!(!cached_read_reusable(
                Some("a"),
                unreadable,
                Duration::from_secs(120),
                Some("a")
            ));
        }

        #[test]
        fn read_rules_apply() {
            let policy = ConnectorAccessPolicy {
                blocked_web_domains: vec!["example.com".to_string()],
                ..ConnectorAccessPolicy::default()
            };
            assert_eq!(
                local_tool_policy_from(Ok(Some(policy.clone())), false),
                LocalToolPolicy::Rules(policy)
            );
        }
    }
}
