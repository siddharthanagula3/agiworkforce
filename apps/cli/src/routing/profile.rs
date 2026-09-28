use agiworkforce_protocol::developer_session::DeveloperRoutingProfile;

pub const PROFILE_IDS: [&str; 4] = ["auto", "speed", "quality", "cost"];

pub fn parse(value: &str) -> Option<DeveloperRoutingProfile> {
    serde_json::from_value(serde_json::Value::String(value.trim().to_ascii_lowercase())).ok()
}

pub fn id(profile: DeveloperRoutingProfile) -> &'static str {
    match profile {
        DeveloperRoutingProfile::Auto => "auto",
        DeveloperRoutingProfile::Speed => "speed",
        DeveloperRoutingProfile::Quality => "quality",
        DeveloperRoutingProfile::Cost => "cost",
    }
}

pub fn auto_selection(profile: DeveloperRoutingProfile) -> &'static str {
    match profile {
        DeveloperRoutingProfile::Auto => "auto",
        DeveloperRoutingProfile::Quality => "auto-premium",
        DeveloperRoutingProfile::Speed | DeveloperRoutingProfile::Cost => "auto-economy",
    }
}
