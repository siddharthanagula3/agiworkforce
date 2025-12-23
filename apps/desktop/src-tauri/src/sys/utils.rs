use std::path::PathBuf;

pub fn app_data_dir() -> anyhow::Result<PathBuf> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| anyhow::anyhow!("Failed to get local data directory"))?
        .join("agiworkforce");

    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }

    Ok(dir)
}

pub fn database_path() -> anyhow::Result<PathBuf> {
    Ok(app_data_dir()?.join("agiworkforce.db"))
}

pub fn logs_dir() -> anyhow::Result<PathBuf> {
    let dir = app_data_dir()?.join("logs");

    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }

    Ok(dir)
}

pub fn cache_dir() -> anyhow::Result<PathBuf> {
    let dir = app_data_dir()?.join("cache");

    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }

    Ok(dir)
}

pub fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    format!("{:.2} {}", size, UNITS[unit_index])
}

pub fn format_duration(millis: u64) -> String {
    if millis < 1000 {
        format!("{}ms", millis)
    } else if millis < 60_000 {
        format!("{:.1}s", millis as f64 / 1000.0)
    } else if millis < 3_600_000 {
        format!("{:.1}m", millis as f64 / 60_000.0)
    } else {
        format!("{:.1}h", millis as f64 / 3_600_000.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(0), "0.00 B");
        assert_eq!(format_bytes(512), "512.00 B");
        assert_eq!(format_bytes(1024), "1.00 KB");
        assert_eq!(format_bytes(1536), "1.50 KB");
        assert_eq!(format_bytes(1_048_576), "1.00 MB");
    }

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(500), "500ms");
        assert_eq!(format_duration(1500), "1.5s");
        assert_eq!(format_duration(90_000), "1.5m");
        assert_eq!(format_duration(7_200_000), "2.0h");
    }
}
