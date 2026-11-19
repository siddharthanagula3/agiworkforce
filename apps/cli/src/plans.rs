use crate::cost_ledger::credit_amount;
use crate::tier_cache::{self, UserTier};

const PLAN_ORDER: [&str; 8] = [
    "free",
    "basic",
    "pro",
    "max",
    "max_15x",
    "team",
    "team_premium",
    "enterprise",
];

const USAGE_LIMITS_CONTRACT: &str =
    include_str!("../../../packages/contracts/types/src/managed-usage-limits.ts");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WindowCredits {
    five_hour: Option<u32>,
    weekly: u32,
    monthly: u32,
}

fn contract_credits(value: &str) -> Option<u32> {
    value.replace('_', "").parse().ok()
}

fn plan_window_credits(plan: &str) -> Option<WindowCredits> {
    let table = &USAGE_LIMITS_CONTRACT
        [USAGE_LIMITS_CONTRACT.find("export const MANAGED_USAGE_LIMITS:")?..];
    let heading = format!("{plan}: {{");
    let mut lines = table.lines().skip_while(|line| line.trim() != heading);
    lines.next()?;
    let (mut five_hour, mut weekly, mut monthly) = (None, None, None);
    for line in lines {
        let line = line.trim();
        if line.starts_with('}') {
            break;
        }
        let Some((key, value)) = line.trim_end_matches(',').split_once(": ") else {
            continue;
        };
        match key {
            "fiveHourCredits" if value == "null" => five_hour = Some(None),
            "fiveHourCredits" => five_hour = Some(Some(contract_credits(value)?)),
            "weeklyCredits" => weekly = Some(contract_credits(value)?),
            "monthlyCredits" => monthly = Some(contract_credits(value)?),
            _ => {}
        }
    }
    Some(WindowCredits {
        five_hour: five_hour?,
        weekly: weekly?,
        monthly: monthly?,
    })
}

const PER_SEAT_PLANS: [&str; 2] = ["team", "team_premium"];

const CLOUD_CHAT_TIERS: &[&str] = &[
    "free",
    "basic",
    "pro",
    "max",
    "max_15x",
    "team",
    "team_premium",
    "enterprise",
];

const PAID_TIERS: &[&str] = &[
    "basic",
    "pro",
    "max",
    "max_15x",
    "team",
    "team_premium",
    "enterprise",
];

const PRO_TIERS: &[&str] = &[
    "pro",
    "max",
    "max_15x",
    "team",
    "team_premium",
    "enterprise",
];

const PLAN_CAPABILITY_TIERS: [(&str, &[&str]); 18] = [
    ("managed_chat", CLOUD_CHAT_TIERS),
    ("chat_tools", CLOUD_CHAT_TIERS),
    ("projects", CLOUD_CHAT_TIERS),
    ("memory_personalization", CLOUD_CHAT_TIERS),
    ("skills", CLOUD_CHAT_TIERS),
    ("connectors", PAID_TIERS),
    ("remote_control", PAID_TIERS),
    ("cloud_sync", CLOUD_CHAT_TIERS),
    ("agi_work", PRO_TIERS),
    ("deep_research", PRO_TIERS),
    ("image_generation", PRO_TIERS),
    ("video_generation", &["max_15x", "enterprise"]),
    ("managed_api", PRO_TIERS),
    ("developer_surfaces", PRO_TIERS),
    ("slack_app", PRO_TIERS),
    ("artifact_connectors", PRO_TIERS),
    ("team_admin", &["team", "team_premium", "enterprise"]),
    ("enterprise_controls", &["enterprise"]),
];

const PLAN_CAPABILITY_LABELS: [(&str, &str); 18] = [
    (
        "managed_chat",
        "Cloud chat on web, desktop, mobile and Chrome",
    ),
    ("chat_tools", "Chat tools"),
    ("projects", "Projects"),
    ("memory_personalization", "Memory and personalization"),
    ("skills", "Skills"),
    ("connectors", "Connectors"),
    ("remote_control", "Remote Control"),
    ("cloud_sync", "Sync across devices"),
    ("agi_work", "AGI Work"),
    ("deep_research", "Deep Research"),
    ("image_generation", "Image generation"),
    ("video_generation", "Video generation"),
    ("managed_api", "Cloud API access"),
    ("developer_surfaces", "Cloud in the CLI and VS Code"),
    ("slack_app", "Chat in Slack"),
    ("artifact_connectors", "Connected apps in published apps"),
    ("team_admin", "Team administration"),
    ("enterprise_controls", "SSO, SCIM and admin controls"),
];

fn capability_label(capability: &str) -> &str {
    PLAN_CAPABILITY_LABELS
        .iter()
        .find(|(id, _)| *id == capability)
        .map(|(_, label)| *label)
        .unwrap_or(capability)
}

pub(crate) fn cached_plan_allows(capability: &str) -> bool {
    tier_cache::read_tier_cache().is_some_and(|cached| {
        plan_capabilities(&tier_cache::tier_slug(&cached.tier)).contains(&capability)
    })
}

fn plan_capabilities(plan: &str) -> Vec<&'static str> {
    PLAN_CAPABILITY_TIERS
        .iter()
        .filter(|(_, tiers)| tiers.contains(&plan))
        .map(|(capability, _)| *capability)
        .collect()
}

fn plan_label(plan: &str) -> String {
    tier_cache::parse_tier(plan)
        .map(|tier| tier.label().to_string())
        .unwrap_or_else(|| plan.to_string())
}

fn window_phrase(credits: WindowCredits) -> String {
    let five_hour = credits.five_hour.map_or_else(
        || "no 5-hour limit".to_string(),
        |five_hour| credit_amount(f64::from(five_hour)),
    );
    format!(
        "{five_hour} / {} / {} credits",
        credit_amount(f64::from(credits.weekly)),
        credit_amount(f64::from(credits.monthly))
    )
}

fn credits_phrase(plan: &str) -> String {
    let Some(credits) = plan_window_credits(plan) else {
        return "usage set by your contract".to_string();
    };
    let window = window_phrase(credits);
    if plan == "free" {
        format!("{window}, free models only")
    } else if PER_SEAT_PLANS.contains(&plan) {
        format!("{window} per seat")
    } else {
        window
    }
}

fn capability_list(capabilities: &[&str]) -> String {
    capabilities
        .iter()
        .map(|capability| capability_label(capability))
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn render_plans(current: Option<&UserTier>) -> Vec<String> {
    let current_plan = current
        .map(tier_cache::tier_slug)
        .filter(|plan| PLAN_ORDER.contains(&plan.as_str()));
    let mut lines = vec!["Plans, with credits per 5 hours / week / month".to_string()];
    for plan in PLAN_ORDER {
        let is_current = current_plan.as_deref() == Some(plan);
        lines.push(format!(
            "  {}{}: {}",
            plan_label(plan),
            if is_current { " (your plan)" } else { "" },
            credits_phrase(plan)
        ));
        let capabilities = plan_capabilities(plan);
        match current_plan.as_deref() {
            Some(current) if !is_current => {
                let included = plan_capabilities(current);
                let added: Vec<&str> = capabilities
                    .iter()
                    .copied()
                    .filter(|capability| !included.contains(capability))
                    .collect();
                lines.push(if added.is_empty() {
                    format!("    No features beyond {}", plan_label(current))
                } else {
                    format!(
                        "    Adds over {}: {}",
                        plan_label(current),
                        capability_list(&added)
                    )
                });
            }
            _ => lines.push(format!("    Includes: {}", capability_list(&capabilities))),
        }
    }
    lines.push(format!(
        "Prices and checkout: {}/pricing",
        tier_cache::default_api_base()
    ));
    lines
}

pub fn plans_lines() -> Vec<String> {
    render_plans(
        tier_cache::read_tier_cache()
            .map(|cached| cached.tier)
            .as_ref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window_credits(plan: &str) -> String {
        window_phrase(
            plan_window_credits(plan).unwrap_or_else(|| panic!("{plan} states no window credits")),
        )
    }

    fn labels(capabilities: &[&str]) -> String {
        capabilities
            .iter()
            .map(|capability| capability_label(capability))
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn plan_rows(lines: &[String]) -> Vec<(&str, &str)> {
        lines[1..lines.len() - 1]
            .chunks(2)
            .map(|row| (row[0].as_str(), row[1].as_str()))
            .collect()
    }

    #[test]
    fn remote_control_and_connectors_need_a_paid_plan_while_skills_and_memory_stay_on_free() {
        let free = plan_capabilities("free");
        assert!(!free.contains(&"remote_control"));
        assert!(!free.contains(&"connectors"));
        assert!(free.contains(&"skills"));
        assert!(free.contains(&"memory_personalization"));
        for plan in PLAN_ORDER.iter().filter(|plan| **plan != "free") {
            let included = plan_capabilities(plan);
            assert!(included.contains(&"remote_control"), "{plan}");
            assert!(included.contains(&"connectors"), "{plan}");
        }
    }

    #[test]
    fn the_200_dollar_plan_is_named_max_20x_and_every_plan_by_its_catalog_label() {
        assert_eq!(plan_label("max_15x"), "Ultra");
        assert_eq!(plan_label("max"), "Max");
        let lines = render_plans(None);
        let headings: Vec<&str> = plan_rows(&lines)
            .into_iter()
            .map(|(heading, _)| heading.split(':').next().unwrap_or_default().trim())
            .collect();
        assert_eq!(
            headings,
            [
                "Free",
                "Basic",
                "Premium",
                "Max",
                "Ultra",
                "Team",
                "Team Premium",
                "Enterprise"
            ]
        );
    }

    #[test]
    fn without_a_plan_each_row_states_its_credits_per_window_and_what_it_includes() {
        let lines = render_plans(None);
        assert_eq!(lines[0], "Plans, with credits per 5 hours / week / month");
        assert_eq!(
            lines.last().map(String::as_str),
            Some(
                format!(
                    "Prices and checkout: {}/pricing",
                    tier_cache::default_api_base()
                )
                .as_str()
            )
        );
        let rows = plan_rows(&lines);
        assert_eq!(rows.len(), PLAN_ORDER.len());
        assert_eq!(
            rows[0],
            (
                format!("  Free: {}, free models only", window_credits("free")).as_str(),
                format!("    Includes: {}", labels(&plan_capabilities("free"))).as_str(),
            )
        );
        assert_eq!(rows[4].0, format!("  Ultra: {}", window_credits("max_15x")));
        assert_eq!(
            rows[5].0,
            format!("  Team: {} per seat", window_credits("team"))
        );
        assert_eq!(
            rows[6].0,
            format!(
                "  Team Premium: {} per seat",
                window_credits("team_premium")
            )
        );
        assert_eq!(rows[7].0, "  Enterprise: usage set by your contract");
        for (heading, detail) in rows {
            assert!(!heading.contains("(your plan)"), "{heading}");
            assert!(detail.starts_with("    Includes: "), "{detail}");
            assert!(!heading.contains('$') && !detail.contains('$'), "{heading}");
        }
    }

    #[test]
    fn a_current_plan_is_marked_and_every_other_row_says_what_it_adds() {
        let lines = render_plans(Some(&UserTier::Pro));
        let rows = plan_rows(&lines);
        let row = |label: &str| {
            rows.iter()
                .find(|(heading, _)| heading.starts_with(&format!("  {label}")))
                .copied()
                .unwrap_or_else(|| panic!("no {label} row"))
        };

        assert_eq!(
            row("Premium"),
            (
                format!("  Premium (your plan): {}", window_credits("pro")).as_str(),
                format!("    Includes: {}", labels(&plan_capabilities("pro"))).as_str(),
            )
        );
        assert_eq!(row("Free").1, "    No features beyond Premium");
        assert_eq!(row("Max").1, "    No features beyond Premium");
        assert_eq!(
            row("Ultra").1,
            format!(
                "    Adds over Premium: {}",
                capability_label("video_generation")
            )
        );
        assert_eq!(
            row("Team").1,
            format!("    Adds over Premium: {}", capability_label("team_admin"))
        );
        assert_eq!(
            row("Enterprise").1,
            format!(
                "    Adds over Premium: {}",
                labels(&["video_generation", "team_admin", "enterprise_controls"])
            )
        );
        assert_eq!(
            rows.iter()
                .filter(|(heading, _)| heading.contains("(your plan)"))
                .count(),
            1
        );
    }

    #[test]
    fn a_max_20x_account_sees_itself_marked_under_its_catalog_label() {
        let lines = render_plans(Some(&UserTier::Max15x));
        let rows = plan_rows(&lines);
        assert_eq!(
            rows[4].0,
            format!("  Ultra (your plan): {}", window_credits("max_15x"))
        );
        assert_eq!(rows[3].1, "    No features beyond Ultra");
        assert_eq!(
            rows[7].1,
            format!(
                "    Adds over Ultra: {}",
                labels(&["team_admin", "enterprise_controls"])
            )
        );
    }

    #[test]
    fn every_plan_but_enterprise_reads_its_credits_from_the_shared_usage_limits() {
        for plan in PLAN_ORDER {
            assert_eq!(
                plan_window_credits(plan).is_some(),
                plan != "enterprise",
                "{plan}"
            );
        }
        let ultra = plan_window_credits("max_15x").expect("Ultra credits");
        assert_eq!(ultra.five_hour, None);
        assert!(
            ultra.weekly > 0 && ultra.monthly > ultra.weekly,
            "{ultra:?}"
        );
        assert!(credits_phrase("max_15x").starts_with("no 5-hour limit / "));
        assert!(plan_window_credits("free")
            .and_then(|credits| credits.five_hour)
            .is_some());
    }

    #[test]
    fn a_byok_session_has_no_managed_plan_to_mark() {
        assert_eq!(render_plans(Some(&UserTier::Byok)), render_plans(None));
    }

    #[test]
    fn every_capability_a_plan_includes_has_a_label_of_its_own() {
        for (capability, _) in PLAN_CAPABILITY_TIERS {
            assert_ne!(capability_label(capability), capability);
        }
        assert_eq!(
            capability_label("developer_surfaces"),
            "Cloud in the CLI and VS Code"
        );
    }
}
