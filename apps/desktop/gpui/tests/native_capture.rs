use anyhow::{ensure, Context as _, Result};
use image::{Rgb, RgbImage};

fn ink(pixel: Rgb<u8>, background: Rgb<u8>) -> bool {
    pixel
        .0
        .iter()
        .zip(background.0)
        .map(|(a, b)| a.abs_diff(b) as u32)
        .sum::<u32>()
        >= 300
}

fn static_text_survives(captured: &RgbImage, rendered: &RgbImage) -> Result<()> {
    ensure!(
        captured.width() == rendered.width() && captured.height() >= rendered.height(),
        "Capture and renderer dimensions do not describe the same window"
    );
    let offset = captured.height() - rendered.height();
    ensure!(
        offset < rendered.height() / 3,
        "Unexpected native window chrome height"
    );
    let background = *rendered.get_pixel(rendered.width() / 2, rendered.height() - 1);
    let margin = rendered.width() / 50;
    let mut bands = Vec::new();
    let mut start = None;
    for y in 0..rendered.height() / 2 {
        let painted =
            (margin..rendered.width() - margin).any(|x| ink(*rendered.get_pixel(x, y), background));
        match (start, painted) {
            (None, true) => start = Some(y),
            (Some(top), false) => {
                bands.push(top..y);
                start = None;
                if bands.len() == 2 {
                    break;
                }
            }
            _ => {}
        }
    }
    ensure!(
        bands.len() == 2,
        "The renderer reference did not contain both static headings"
    );
    for (index, band) in bands.into_iter().enumerate() {
        let (mut expected, mut actual, mut intersection) = (0_u64, 0_u64, 0_u64);
        for y in band {
            for x in margin..rendered.width() - margin {
                let a = ink(*rendered.get_pixel(x, y), background);
                let b = ink(*captured.get_pixel(x, y + offset), background);
                expected += u64::from(a);
                actual += u64::from(b);
                intersection += u64::from(a && b);
            }
        }
        ensure!(
            expected >= 20,
            "Static heading {} has no usable ink",
            index + 1
        );
        ensure!(intersection * 10 >= expected * 9 && intersection * 10 >= actual * 9, "Static heading {} is missing or differs in the native capture: expected {expected}, actual {actual}, intersection {intersection}", index + 1);
        eprintln!(
            "Static heading {}: renderer {expected}, native {actual}, matching {intersection}",
            index + 1
        );
    }
    Ok(())
}

#[test]
#[ignore = "requires raw native-probe captures, not inline image diffs"]
fn raw_native_capture_preserves_static_text_after_state_changes() -> Result<()> {
    let capture = std::env::var_os("AGI_GPUI_NATIVE_CAPTURE")
        .context("Set AGI_GPUI_NATIVE_CAPTURE to the raw CUA image")?;
    let reference = std::env::var_os("AGI_GPUI_RENDERER_CAPTURE").context(
        "Set AGI_GPUI_RENDERER_CAPTURE to the renderer image from the same probe window",
    )?;
    let capture = image::ImageReader::open(capture)?
        .with_guessed_format()?
        .decode()?
        .to_rgb8();
    let reference = image::ImageReader::open(reference)?
        .with_guessed_format()?
        .decode()?
        .to_rgb8();
    static_text_survives(&capture, &reference)
}

#[test]
fn a_blank_or_shifted_capture_cannot_pass_as_unchanged_text() {
    let mut reference = RgbImage::new(100, 100);
    for top in [10, 25] {
        for y in top..top + 5 {
            for x in 10..30 {
                reference.put_pixel(x, y, Rgb([255; 3]));
            }
        }
    }
    let blank = RgbImage::new(100, 110);
    assert!(static_text_survives(&blank, &reference).is_err());
    assert!(static_text_survives(&blank, &RgbImage::new(100, 100)).is_err());
    let mut shifted = blank.clone();
    for (x, y, pixel) in reference.enumerate_pixels() {
        if x + 30 < shifted.width() {
            shifted.put_pixel(x + 30, y + 10, *pixel);
        }
    }
    assert!(static_text_survives(&shifted, &reference).is_err());
    let mut captured = blank;
    for (x, y, pixel) in reference.enumerate_pixels() {
        captured.put_pixel(x, y + 10, *pixel);
    }
    static_text_survives(&captured, &reference).unwrap();
}
