use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const DIGITAL_SOURCE_TYPE: &str =
    "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
pub const PROVENANCE_HEADER: &str = "x-agi-ai-provenance";

const AGI_NAMESPACE: &str = "https://agiworkforce.com/ns/provenance/1.0/";
const CLAIM_GENERATOR: &str = "AGI";
const CREATED_ASSERTION: &str = "c2pa.created:trainedAlgorithmicMedia";
const ACTIONS_LABEL: &str = "c2pa.actions";

const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_XMP_KEYWORD: &[u8] = b"XML:com.adobe.xmp";
const JPEG_XMP_NAMESPACE: &[u8] = b"http://ns.adobe.com/xap/1.0/\0";
const JPEG_EXIF_HEADER: &[u8] = b"Exif\0\0";
const JPEG_MAX_SEGMENT_LENGTH: usize = 0xffff;
const WEBP_XMP_FLAG: u8 = 0x04;
const WEBP_ALPHA_FLAG: u8 = 0x10;

pub fn local_claim(provider: &str, model: &str, bytes: &[u8], generated_at: &str) -> Value {
    json!({
        "version": 1,
        "claim_generator": CLAIM_GENERATOR,
        "kind": "image",
        "generated_at": generated_at,
        "provider": provider,
        "model": model,
        "content_hash_sha256": crate::hex::encode(&Sha256::digest(bytes)),
        "assertions": [{ "label": ACTIONS_LABEL, "action": CREATED_ASSERTION }],
        "signature": null,
    })
}

pub fn is_claim(value: &Value) -> bool {
    value.get("version").and_then(Value::as_u64) == Some(1)
        && value
            .get("model")
            .and_then(Value::as_str)
            .is_some_and(|model| !model.is_empty())
        && value
            .get("assertions")
            .and_then(Value::as_array)
            .is_some_and(|assertions| {
                assertions.iter().any(|assertion| {
                    assertion.get("action").and_then(Value::as_str) == Some(CREATED_ASSERTION)
                })
            })
}

pub fn xmp_packet(claim: &Value) -> String {
    let generator = claim
        .get("claim_generator")
        .and_then(Value::as_str)
        .unwrap_or(CLAIM_GENERATOR);
    let mut attributes = format!(
        "Iptc4xmpExt:DigitalSourceType=\"{DIGITAL_SOURCE_TYPE}\" xmp:CreatorTool=\"{}\"",
        xml_escape(generator)
    );
    if let Some(created) = claim.get("generated_at").and_then(Value::as_str) {
        attributes.push_str(&format!(" xmp:CreateDate=\"{}\"", xml_escape(created)));
    }
    attributes.push_str(&format!(
        " agi:Provenance=\"{}\"",
        xml_escape(&claim.to_string())
    ));
    format!(
        "<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\
         <x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\
         <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\
         <rdf:Description rdf:about=\"\" \
         xmlns:Iptc4xmpExt=\"http://iptc.org/std/Iptc4xmpExt/2008-02-29/\" \
         xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\" \
         xmlns:agi=\"{AGI_NAMESPACE}\" {attributes}/>\
         </rdf:RDF>\
         </x:xmpmeta>\
         <?xpacket end=\"r\"?>"
    )
}

pub fn embed_xmp(bytes: &[u8], xmp: &str) -> Option<Vec<u8>> {
    if bytes.starts_with(&PNG_SIGNATURE) {
        embed_png(bytes, xmp)
    } else if bytes.starts_with(&[0xff, 0xd8]) {
        embed_jpeg(bytes, xmp)
    } else if is_webp(bytes) {
        embed_webp(bytes, xmp)
    } else {
        None
    }
}

pub fn dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.starts_with(&PNG_SIGNATURE) {
        if bytes.get(12..16)? != b"IHDR" {
            return None;
        }
        return Some((read_u32_be(bytes, 16)?, read_u32_be(bytes, 20)?));
    }
    if bytes.starts_with(&[0xff, 0xd8]) {
        return jpeg_dimensions(bytes);
    }
    if is_webp(bytes) {
        let (fourcc, data) = webp_chunks(bytes)?.into_iter().next()?;
        return webp_canvas(&fourcc, data).map(|(width, height, _)| (width, height));
    }
    None
}

fn xml_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            other => escaped.push(other),
        }
    }
    escaped
}

fn read_u32_be(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

fn read_u16_be(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

fn read_u24_le(bytes: &[u8], at: usize) -> Option<u32> {
    let raw = bytes.get(at..at + 3)?;
    Some(u32::from(raw[0]) | (u32::from(raw[1]) << 8) | (u32::from(raw[2]) << 16))
}

fn png_chunks(bytes: &[u8]) -> Option<Vec<([u8; 4], &[u8])>> {
    let mut chunks = Vec::new();
    let mut offset = PNG_SIGNATURE.len();
    while offset < bytes.len() {
        let length = usize::try_from(read_u32_be(bytes, offset)?).ok()?;
        let kind: [u8; 4] = bytes.get(offset + 4..offset + 8)?.try_into().ok()?;
        let data = bytes.get(offset + 8..offset.checked_add(8 + length)?)?;
        bytes.get(offset + 8 + length..offset + 12 + length)?;
        chunks.push((kind, data));
        offset += 12 + length;
        if &kind == b"IEND" {
            break;
        }
    }
    if chunks.first().map(|(kind, _)| *kind) != Some(*b"IHDR")
        || chunks.last().map(|(kind, _)| *kind) != Some(*b"IEND")
    {
        return None;
    }
    Some(chunks)
}

fn is_png_xmp(data: &[u8]) -> bool {
    data.starts_with(PNG_XMP_KEYWORD) && data.get(PNG_XMP_KEYWORD.len()) == Some(&0)
}

fn png_chunk(kind: &[u8; 4], data: &[u8]) -> Option<Vec<u8>> {
    let length = u32::try_from(data.len()).ok()?;
    let mut chunk = Vec::with_capacity(data.len() + 12);
    chunk.extend_from_slice(&length.to_be_bytes());
    chunk.extend_from_slice(kind);
    chunk.extend_from_slice(data);
    let mut checked = Vec::with_capacity(data.len() + 4);
    checked.extend_from_slice(kind);
    checked.extend_from_slice(data);
    chunk.extend_from_slice(&crc32(&checked).to_be_bytes());
    Some(chunk)
}

fn embed_png(bytes: &[u8], xmp: &str) -> Option<Vec<u8>> {
    let chunks = png_chunks(bytes)?;
    let mut text = Vec::with_capacity(PNG_XMP_KEYWORD.len() + xmp.len() + 5);
    text.extend_from_slice(PNG_XMP_KEYWORD);
    text.extend_from_slice(&[0, 0, 0, 0, 0]);
    text.extend_from_slice(xmp.as_bytes());
    let label = png_chunk(b"iTXt", &text)?;

    let mut out = Vec::with_capacity(bytes.len() + label.len());
    out.extend_from_slice(&PNG_SIGNATURE);
    for (kind, data) in chunks {
        if &kind == b"iTXt" && is_png_xmp(data) {
            continue;
        }
        out.extend_from_slice(&png_chunk(&kind, data)?);
        if &kind == b"IHDR" {
            out.extend_from_slice(&label);
        }
    }
    Some(out)
}

fn jpeg_segments(bytes: &[u8]) -> Option<(Vec<&[u8]>, &[u8])> {
    let mut segments = Vec::new();
    let mut offset = 2;
    loop {
        if *bytes.get(offset)? != 0xff {
            return None;
        }
        let mut marker_at = offset + 1;
        while *bytes.get(marker_at)? == 0xff {
            marker_at += 1;
        }
        let marker = *bytes.get(marker_at)?;
        if marker == 0xda {
            return Some((segments, &bytes[offset..]));
        }
        if marker == 0xd9 || (0xd0..=0xd8).contains(&marker) || marker == 0x01 {
            return None;
        }
        let length = usize::from(read_u16_be(bytes, marker_at + 1)?);
        if length < 2 {
            return None;
        }
        let end = marker_at + 1 + length;
        segments.push(bytes.get(marker_at - 1..end)?);
        offset = end;
    }
}

fn is_jpeg_xmp(segment: &[u8]) -> bool {
    segment.get(1) == Some(&0xe1)
        && segment
            .get(4..)
            .is_some_and(|payload| payload.starts_with(JPEG_XMP_NAMESPACE))
}

fn jpeg_leads(segment: &[u8]) -> bool {
    match segment.get(1) {
        Some(0xe0) => true,
        Some(0xe1) => segment
            .get(4..)
            .is_some_and(|payload| payload.starts_with(JPEG_EXIF_HEADER)),
        _ => false,
    }
}

fn embed_jpeg(bytes: &[u8], xmp: &str) -> Option<Vec<u8>> {
    let (segments, tail) = jpeg_segments(bytes)?;
    let length = 2 + JPEG_XMP_NAMESPACE.len() + xmp.len();
    if length > JPEG_MAX_SEGMENT_LENGTH {
        return None;
    }
    let mut label = Vec::with_capacity(length + 2);
    label.extend_from_slice(&[0xff, 0xe1]);
    label.extend_from_slice(&u16::try_from(length).ok()?.to_be_bytes());
    label.extend_from_slice(JPEG_XMP_NAMESPACE);
    label.extend_from_slice(xmp.as_bytes());

    let kept: Vec<&[u8]> = segments
        .into_iter()
        .filter(|segment| !is_jpeg_xmp(segment))
        .collect();
    let lead = kept
        .iter()
        .take_while(|segment| jpeg_leads(segment))
        .count();

    let mut out = Vec::with_capacity(bytes.len() + label.len());
    out.extend_from_slice(&[0xff, 0xd8]);
    for segment in &kept[..lead] {
        out.extend_from_slice(segment);
    }
    out.extend_from_slice(&label);
    for segment in &kept[lead..] {
        out.extend_from_slice(segment);
    }
    out.extend_from_slice(tail);
    Some(out)
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let (segments, _) = jpeg_segments(bytes)?;
    segments.into_iter().find_map(|segment| {
        let marker = *segment.get(1)?;
        let is_frame = (0xc0..=0xcf).contains(&marker) && !matches!(marker, 0xc4 | 0xc8 | 0xcc);
        if !is_frame {
            return None;
        }
        let height = read_u16_be(segment, 5)?;
        let width = read_u16_be(segment, 7)?;
        Some((u32::from(width), u32::from(height)))
    })
}

fn is_webp(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP"
}

fn webp_chunks(bytes: &[u8]) -> Option<Vec<([u8; 4], &[u8])>> {
    let declared = usize::try_from(u32::from_le_bytes(bytes.get(4..8)?.try_into().ok()?)).ok()?;
    let end = declared.checked_add(8)?.min(bytes.len());
    let mut chunks = Vec::new();
    let mut offset = 12;
    while offset + 8 <= end {
        let fourcc: [u8; 4] = bytes.get(offset..offset + 4)?.try_into().ok()?;
        let size = usize::try_from(u32::from_le_bytes(
            bytes.get(offset + 4..offset + 8)?.try_into().ok()?,
        ))
        .ok()?;
        let data = bytes.get(offset + 8..offset.checked_add(8 + size)?)?;
        chunks.push((fourcc, data));
        offset += 8 + size + (size & 1);
    }
    if chunks.is_empty() {
        None
    } else {
        Some(chunks)
    }
}

fn webp_canvas(fourcc: &[u8; 4], data: &[u8]) -> Option<(u32, u32, bool)> {
    match fourcc {
        b"VP8X" => Some((
            read_u24_le(data, 4)? + 1,
            read_u24_le(data, 7)? + 1,
            data.first()? & WEBP_ALPHA_FLAG != 0,
        )),
        b"VP8 " => {
            if data.get(3..6)? != [0x9d, 0x01, 0x2a] {
                return None;
            }
            let width = u32::from(u16::from_le_bytes(data.get(6..8)?.try_into().ok()?) & 0x3fff);
            let height = u32::from(u16::from_le_bytes(data.get(8..10)?.try_into().ok()?) & 0x3fff);
            Some((width, height, false))
        }
        b"VP8L" => {
            if *data.first()? != 0x2f {
                return None;
            }
            let bits = u32::from_le_bytes(data.get(1..5)?.try_into().ok()?);
            Some((
                (bits & 0x3fff) + 1,
                ((bits >> 14) & 0x3fff) + 1,
                (bits >> 28) & 1 == 1,
            ))
        }
        _ => None,
    }
}

fn webp_chunk(fourcc: &[u8; 4], data: &[u8]) -> Option<Vec<u8>> {
    let size = u32::try_from(data.len()).ok()?;
    let mut chunk = Vec::with_capacity(data.len() + 9);
    chunk.extend_from_slice(fourcc);
    chunk.extend_from_slice(&size.to_le_bytes());
    chunk.extend_from_slice(data);
    if data.len() % 2 == 1 {
        chunk.push(0);
    }
    Some(chunk)
}

fn embed_webp(bytes: &[u8], xmp: &str) -> Option<Vec<u8>> {
    let chunks = webp_chunks(bytes)?;
    let (first_fourcc, first_data) = *chunks.first()?;
    let mut body = Vec::with_capacity(bytes.len() + xmp.len() + 32);
    body.extend_from_slice(b"WEBP");
    if &first_fourcc == b"VP8X" {
        let mut header = first_data.to_vec();
        *header.first_mut()? |= WEBP_XMP_FLAG;
        body.extend_from_slice(&webp_chunk(b"VP8X", &header)?);
    } else {
        let (width, height, alpha) = webp_canvas(&first_fourcc, first_data)?;
        if width == 0 || height == 0 {
            return None;
        }
        let flags = WEBP_XMP_FLAG | if alpha { WEBP_ALPHA_FLAG } else { 0 };
        let mut header = vec![flags, 0, 0, 0];
        header.extend_from_slice(&(width - 1).to_le_bytes()[..3]);
        header.extend_from_slice(&(height - 1).to_le_bytes()[..3]);
        body.extend_from_slice(&webp_chunk(b"VP8X", &header)?);
        body.extend_from_slice(&webp_chunk(&first_fourcc, first_data)?);
    }
    for (fourcc, data) in chunks.iter().skip(1) {
        if fourcc == b"XMP " {
            continue;
        }
        body.extend_from_slice(&webp_chunk(fourcc, data)?);
    }
    body.extend_from_slice(&webp_chunk(b"XMP ", xmp.as_bytes())?);

    let mut out = Vec::with_capacity(body.len() + 8);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&u32::try_from(body.len()).ok()?.to_le_bytes());
    out.extend_from_slice(&body);
    Some(out)
}

const CRC_TABLE: [u32; 256] = crc_table();

const fn crc_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    let mut index = 0;
    while index < 256 {
        let mut value = index as u32;
        let mut bit = 0;
        while bit < 8 {
            value = if value & 1 == 1 {
                0xedb8_8320 ^ (value >> 1)
            } else {
                value >> 1
            };
            bit += 1;
        }
        table[index] = value;
        index += 1;
    }
    table
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc = CRC_TABLE[((crc ^ u32::from(*byte)) & 0xff) as usize] ^ (crc >> 8);
    }
    crc ^ 0xffff_ffff
}
