use chrono::{DateTime, TimeZone, Utc};
use chrono_tz::Tz;
use std::str::FromStr;

use crate::error::{Error, Result};

/// Convert UTC time to specified timezone
pub fn convert_to_timezone(utc_time: DateTime<Utc>, tz_str: &str) -> Result<DateTime<Tz>> {
    let tz =
        Tz::from_str(tz_str).map_err(|_| Error::Other(format!("Invalid timezone: {}", tz_str)))?;

    Ok(utc_time.with_timezone(&tz))
}

/// Get system timezone
pub fn get_system_timezone() -> Tz {
    // Try to get system timezone, fallback to UTC
    #[cfg(windows)]
    {
        if let Ok(tz_id) = windows_timezone_to_iana() {
            if let Ok(tz) = Tz::from_str(&tz_id) {
                return tz;
            }
        }
    }

    // Fallback to UTC
    Tz::UTC
}

/// Convert Windows timezone to IANA timezone identifier
#[cfg(windows)]
fn windows_timezone_to_iana() -> Result<String> {
    use std::process::Command;

    let output = Command::new("powershell")
        .args([
            "-Command",
            "Get-TimeZone | Select-Object -ExpandProperty Id",
        ])
        .output()
        .map_err(|e| Error::Other(format!("Failed to get timezone: {}", e)))?;

    let windows_tz = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Map common Windows timezone names to IANA
    let iana_tz = match windows_tz.as_str() {
        "Pacific Standard Time" => "America/Los_Angeles",
        "Mountain Standard Time" => "America/Denver",
        "Central Standard Time" => "America/Chicago",
        "Eastern Standard Time" => "America/New_York",
        "GMT Standard Time" => "Europe/London",
        "Central European Standard Time" => "Europe/Berlin",
        "China Standard Time" => "Asia/Shanghai",
        "Tokyo Standard Time" => "Asia/Tokyo",
        "AUS Eastern Standard Time" => "Australia/Sydney",
        "India Standard Time" => "Asia/Kolkata",
        _ => {
            tracing::warn!("Unknown Windows timezone: {}, using UTC", windows_tz);
            "UTC"
        }
    };

    Ok(iana_tz.to_string())
}

/// Format datetime with timezone
pub fn format_with_timezone(dt: DateTime<Tz>, format: &str) -> String {
    dt.format(format).to_string()
}

/// Parse datetime string with timezone
pub fn parse_datetime_with_timezone(datetime_str: &str, tz_str: &str) -> Result<DateTime<Utc>> {
    let tz =
        Tz::from_str(tz_str).map_err(|_| Error::Other(format!("Invalid timezone: {}", tz_str)))?;

    // Try parsing as RFC3339 first
    if let Ok(dt) = DateTime::parse_from_rfc3339(datetime_str) {
        return Ok(dt.with_timezone(&Utc));
    }

    // Try parsing with chrono's naive datetime
    use chrono::NaiveDateTime;
    let naive_dt = NaiveDateTime::parse_from_str(datetime_str, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(datetime_str, "%Y-%m-%d %H:%M:%S"))
        .map_err(|e| Error::Other(format!("Failed to parse datetime: {}", e)))?;

    // Convert to specified timezone, then to UTC
    let dt_in_tz = tz
        .from_local_datetime(&naive_dt)
        .single()
        .ok_or_else(|| Error::Other("Ambiguous datetime".to_string()))?;

    Ok(dt_in_tz.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Timelike};

    #[test]
    fn test_convert_to_timezone() {
        let utc_time = Utc.with_ymd_and_hms(2024, 1, 1, 12, 0, 0).unwrap();

        // Test conversion to EST
        let est_time = convert_to_timezone(utc_time, "America/New_York").unwrap();
        assert_eq!(est_time.hour(), 7); // EST is UTC-5

        // Test conversion to PST
        let pst_time = convert_to_timezone(utc_time, "America/Los_Angeles").unwrap();
        assert_eq!(pst_time.hour(), 4); // PST is UTC-8
    }

    #[test]
    fn test_parse_datetime_with_timezone() {
        let result = parse_datetime_with_timezone("2024-01-01T12:00:00", "America/New_York");
        assert!(result.is_ok());

        let utc_time = result.unwrap();
        // 12:00 EST should be 17:00 UTC
        assert_eq!(utc_time.hour(), 17);
    }

    #[test]
    fn test_invalid_timezone() {
        let utc_time = Utc::now();
        let result = convert_to_timezone(utc_time, "Invalid/Timezone");
        assert!(result.is_err());
    }
}
