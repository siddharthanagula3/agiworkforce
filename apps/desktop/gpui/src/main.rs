#![deny(unsafe_code)]

use anyhow::Result;
use clap::Parser;
use std::num::NonZeroU16;
use std::path::PathBuf;
use std::str::FromStr;

#[derive(Clone, Debug)]
struct WindowSize {
    width: NonZeroU16,
    height: NonZeroU16,
}

impl FromStr for WindowSize {
    type Err = String;
    fn from_str(value: &str) -> std::result::Result<Self, String> {
        let (width, height) = value
            .split_once('x')
            .ok_or("Use WIDTHxHEIGHT for window size")?;
        let invalid = |_| "Window dimensions must be positive 16-bit integers".to_owned();
        Ok(Self {
            width: width.parse().map_err(invalid)?,
            height: height.parse().map_err(invalid)?,
        })
    }
}

#[derive(Parser)]
#[command(version)]
struct Arguments {
    #[arg(long, value_name = "CLI_EXECUTABLE")]
    runtime: Option<PathBuf>,
    #[arg(long)]
    licenses: bool,
    #[arg(long, value_name = "WIDTHxHEIGHT")]
    window_size: Option<WindowSize>,
}

fn main() -> Result<()> {
    let arguments = Arguments::parse();
    if arguments.licenses {
        print!("{}", include_str!("../assets/THIRD_PARTY_NOTICES.txt"));
        print!("{}", agiworkforce_desktop_gpui::rich_text::syntax_notices());
        return Ok(());
    }
    let size = arguments
        .window_size
        .map(|value| (f32::from(value.width.get()), f32::from(value.height.get())));
    agiworkforce_desktop_gpui::ui::run(
        agiworkforce_desktop_gpui::bundle::resolve_runtime(arguments.runtime)?,
        size,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requested_window_dimensions_are_validated_before_startup() {
        let args = Arguments::try_parse_from(["native", "--window-size", "320x640"]).unwrap();
        let size = args.window_size.unwrap();
        assert_eq!((size.width.get(), size.height.get()), (320, 640));
        for value in [
            "0x640",
            "320x0",
            "-1x640",
            "NaNx640",
            "65536x640",
            "320x640x2",
            "320",
        ] {
            assert!(
                Arguments::try_parse_from(["native", "--window-size", value]).is_err(),
                "{value}"
            );
        }
    }
}
