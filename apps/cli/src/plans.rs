use crate::cost_ledger::credit_amount;
use crate::tier_cache::{self, UserTier};

const PLAN_ORDER: [&str; 7] = [
    "free",
    "basic",
    "pro",
    "max",
    "max_15x",
    "team",
    "enterprise",
];

const PLAN_WINDOW_CREDITS: [(&str, u32, u32, u32); 6] = [
    ("free", 2, 15, 20),
    ("basic", 10, 100, 400),
    ("pro", 50, 500, 2_000),
    ("max", 250, 2_500, 10_000),
    ("max_15x", 1_000, 5_000, 20_000),
    ("team", 50, 500, 2_000),
];

const PER_SEAT_PLANS: [&str; 1] = ["team"];

const CLOUD_CHAT_TIERS: &[&str] = &[
    "free",
    "basic",
    "pro",
    "max",
    "max_15x",
    "team",
    "enterprise",
];

const PRO_TIERS: &[&str] = &["pro", "max", "max_15x", "team", "enterprise"];

const PLAN_CAPABILITY_TIERS: [(&str, &[&str]); 13] = [
    ("managed_chat", CLOUD_CHAT_TIERS),
    ("chat_tools", CLOUD_CHAT_TIERS),
    ("projects", CLOUD_CHAT_TIERS),
    ("memory_personalization", CLOUD_CHAT_TIERS),
    ("skills_connectors", CLOUD_CHAT_TIERS),
    ("cloud_sync", CLOUD_CHAT_TIERS),
    ("agi_work", PRO_TIERS),
    ("image_generation", PRO_TIERS),
    ("video_generation", &["max_15x", "enterprise"]),
    ("managed_api", PRO_TIERS),
    ("developer_surfaces", PRO_TIERS),
    ("team_admin", &["team", "enterprise"]),
    ("enterprise_controls", &["enterprise"]),
];

const PLAN_CAPABILITY_LABELS: [(&str, &str); 13] = [
    (
        "managed_chat",
        "Managed Cloud chat on web, desktop, mobile and Chrome",
    ),
    ("chat_tools", "Chat tools"),
    ("projects", "Projects"),
    ("memory_personalization", "Memory and personalization"),
    ("skills_connectors", "Skills and connectors"),
    ("cloud_sync", "Sync across devices"),
    ("agi_work", "AGI Work"),
    ("image_generation", "Image generation"),
    ("video_generation", "Video generation"),
    ("managed_api", "Managed API access"),
    ("developer_surfaces", "Managed Cloud in the CLI and VS Code"),
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

fn credits_phrase(plan: &str) -> String {
    let Some((_, five_hour, weekly, monthly)) =
        PLAN_WINDOW_CREDITS.iter().find(|(id, _, _, _)| *id == plan)
    else {
        return "usage set by your contract".to_string();
    };
    let window = format!(
        "{} / {} / {} credits",
        credit_amount(f64::from(*five_hour)),
        credit_amount(f64::from(*weekly)),
        credit_amount(f64::from(*monthly))
    );
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
