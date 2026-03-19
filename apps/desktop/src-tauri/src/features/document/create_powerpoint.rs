use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// A single slide in a PowerPoint presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationSlide {
    /// Slide title text.
    pub title: String,
    /// Bullet-point content lines.
    pub content: Vec<String>,
    /// Optional speaker notes for the slide.
    pub notes: Option<String>,
    /// Optional background color as a hex string (e.g. "FFFFFF").
    pub background_color: Option<String>,
}

/// Configuration for creating a PowerPoint presentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationConfig {
    /// Presentation title (used in document properties).
    pub title: String,
    /// Presentation author (used in document properties).
    pub author: String,
    /// Ordered list of slides.
    pub slides: Vec<PresentationSlide>,
}

/// Creates PowerPoint (.pptx) files by assembling the Office Open XML
/// ZIP structure using the `zip` crate.
pub struct PresentationCreator;

impl PresentationCreator {
    pub fn new() -> Self {
        Self
    }

    /// Create a full presentation from a config.
    pub fn create(&self, config: &PresentationConfig, output_path: &str) -> Result<()> {
        let path = Path::new(output_path);

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| Error::Generic(format!("Failed to create directory: {}", e)))?;
        }

        let file = std::fs::File::create(output_path)
            .map_err(|e| Error::Generic(format!("Failed to create file: {}", e)))?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        // [Content_Types].xml
        zip.start_file("[Content_Types].xml", options)
            .map_err(|e| Error::Generic(format!("Failed to write content types: {}", e)))?;
        zip.write_all(self.content_types_xml(&config.slides).as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write content types: {}", e)))?;

        // _rels/.rels
        zip.start_file("_rels/.rels", options)
            .map_err(|e| Error::Generic(format!("Failed to write rels: {}", e)))?;
        zip.write_all(Self::root_rels_xml().as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write rels: {}", e)))?;

        // docProps/app.xml
        zip.start_file("docProps/app.xml", options)
            .map_err(|e| Error::Generic(format!("Failed to write app properties: {}", e)))?;
        zip.write_all(self.app_xml(config.slides.len()).as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write app properties: {}", e)))?;

        // docProps/core.xml
        zip.start_file("docProps/core.xml", options)
            .map_err(|e| Error::Generic(format!("Failed to write core properties: {}", e)))?;
        zip.write_all(Self::core_xml(&config.title, &config.author).as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write core properties: {}", e)))?;

        // ppt/presentation.xml
        zip.start_file("ppt/presentation.xml", options)
            .map_err(|e| Error::Generic(format!("Failed to write presentation xml: {}", e)))?;
        zip.write_all(self.presentation_xml(&config.slides).as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write presentation xml: {}", e)))?;

        // ppt/_rels/presentation.xml.rels
        zip.start_file("ppt/_rels/presentation.xml.rels", options)
            .map_err(|e| Error::Generic(format!("Failed to write presentation rels: {}", e)))?;
        zip.write_all(self.presentation_rels_xml(&config.slides).as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write presentation rels: {}", e)))?;

        // ppt/slideMasters/slideMaster1.xml
        zip.start_file("ppt/slideMasters/slideMaster1.xml", options)
            .map_err(|e| Error::Generic(format!("Failed to write slide master: {}", e)))?;
        zip.write_all(Self::slide_master_xml().as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write slide master: {}", e)))?;

        // ppt/slideMasters/_rels/slideMaster1.xml.rels
        zip.start_file("ppt/slideMasters/_rels/slideMaster1.xml.rels", options)
            .map_err(|e| {
                Error::Generic(format!("Failed to write slide master rels: {}", e))
            })?;
        zip.write_all(Self::slide_master_rels_xml().as_bytes())
            .map_err(|e| {
                Error::Generic(format!("Failed to write slide master rels: {}", e))
            })?;

        // ppt/slideLayouts/slideLayout1.xml
        zip.start_file("ppt/slideLayouts/slideLayout1.xml", options)
            .map_err(|e| Error::Generic(format!("Failed to write slide layout: {}", e)))?;
        zip.write_all(Self::slide_layout_xml().as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write slide layout: {}", e)))?;

        // ppt/slideLayouts/_rels/slideLayout1.xml.rels
        zip.start_file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", options)
            .map_err(|e| {
                Error::Generic(format!("Failed to write slide layout rels: {}", e))
            })?;
        zip.write_all(Self::slide_layout_rels_xml().as_bytes())
            .map_err(|e| {
                Error::Generic(format!("Failed to write slide layout rels: {}", e))
            })?;

        // ppt/theme/theme1.xml
        zip.start_file("ppt/theme/theme1.xml", options)
            .map_err(|e| Error::Generic(format!("Failed to write theme: {}", e)))?;
        zip.write_all(Self::theme_xml().as_bytes())
            .map_err(|e| Error::Generic(format!("Failed to write theme: {}", e)))?;

        // Individual slides
        for (i, slide) in config.slides.iter().enumerate() {
            let slide_num = i + 1;

            // ppt/slides/slideN.xml
            let slide_path = format!("ppt/slides/slide{}.xml", slide_num);
            zip.start_file(slide_path.as_str(), options).map_err(|e| {
                Error::Generic(format!("Failed to write slide {}: {}", slide_num, e))
            })?;
            zip.write_all(self.slide_xml(slide).as_bytes())
                .map_err(|e| {
                    Error::Generic(format!("Failed to write slide {}: {}", slide_num, e))
                })?;

            // ppt/slides/_rels/slideN.xml.rels
            let slide_rels_path = format!("ppt/slides/_rels/slide{}.xml.rels", slide_num);
            zip.start_file(slide_rels_path.as_str(), options).map_err(|e| {
                Error::Generic(format!(
                    "Failed to write slide {} rels: {}",
                    slide_num, e
                ))
            })?;
            zip.write_all(Self::slide_rels_xml().as_bytes())
                .map_err(|e| {
                    Error::Generic(format!(
                        "Failed to write slide {} rels: {}",
                        slide_num, e
                    ))
                })?;

            // ppt/notesSlides/notesSlideN.xml (only if notes present)
            if let Some(notes) = &slide.notes {
                if !notes.is_empty() {
                    let notes_path = format!("ppt/notesSlides/notesSlide{}.xml", slide_num);
                    zip.start_file(notes_path.as_str(), options).map_err(|e| {
                        Error::Generic(format!(
                            "Failed to write notes slide {}: {}",
                            slide_num, e
                        ))
                    })?;
                    zip.write_all(Self::notes_slide_xml(notes).as_bytes())
                        .map_err(|e| {
                            Error::Generic(format!(
                                "Failed to write notes slide {}: {}",
                                slide_num, e
                            ))
                        })?;
                }
            }
        }

        zip.finish()
            .map_err(|e| Error::Generic(format!("Failed to finalize PPTX: {}", e)))?;

        Ok(())
    }

    /// Simplified creation interface: title, author, and slides as (title, bullet_points) tuples.
    pub fn create_simple(
        &self,
        title: &str,
        author: &str,
        slides: Vec<(String, Vec<String>)>,
        output_path: &str,
    ) -> Result<()> {
        let config = PresentationConfig {
            title: title.to_string(),
            author: author.to_string(),
            slides: slides
                .into_iter()
                .map(|(slide_title, content)| PresentationSlide {
                    title: slide_title,
                    content,
                    notes: None,
                    background_color: None,
                })
                .collect(),
        };

        self.create(&config, output_path)
    }

    // -----------------------------------------------------------------------
    // XML generation helpers
    // -----------------------------------------------------------------------

    fn content_types_xml(&self, slides: &[PresentationSlide]) -> String {
        let mut slide_overrides = String::new();
        for (i, slide) in slides.iter().enumerate() {
            let n = i + 1;
            slide_overrides.push_str(&format!(
                r#"  <Override PartName="/ppt/slides/slide{}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>"#,
                n
            ));
            slide_overrides.push('\n');
            if let Some(notes) = &slide.notes {
                if !notes.is_empty() {
                    slide_overrides.push_str(&format!(
                        r#"  <Override PartName="/ppt/notesSlides/notesSlide{}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>"#,
                        n
                    ));
                    slide_overrides.push('\n');
                }
            }
        }

        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.ms-officedocument.extended-properties+xml"/>
{slide_overrides}</Types>"#
        )
    }

    fn root_rels_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"#.to_string()
    }

    fn app_xml(&self, slide_count: usize) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>AGI Workforce</Application>
  <Slides>{slide_count}</Slides>
  <ScaleCrop>false</ScaleCrop>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
</Properties>"#
        )
    }

    fn core_xml(title: &str, author: &str) -> String {
        let title_escaped = xml_escape(title);
        let author_escaped = xml_escape(author);
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{title_escaped}</dc:title>
  <dc:creator>{author_escaped}</dc:creator>
  <cp:lastModifiedBy>{author_escaped}</cp:lastModifiedBy>
  <cp:revision>1</cp:revision>
</cp:coreProperties>"#
        )
    }

    fn presentation_xml(&self, slides: &[PresentationSlide]) -> String {
        let mut slide_list = String::new();
        for i in 0..slides.len() {
            let rid = format!("rId{}", i + 2); // rId1 = slideMaster, slides start at rId2
            slide_list.push_str(&format!(
                r#"    <p:sldId id="{}" r:id="{}"/>"#,
                256 + i,
                rid
            ));
            slide_list.push('\n');
        }

        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
{slide_list}  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>"#
        )
    }

    fn presentation_rels_xml(&self, slides: &[PresentationSlide]) -> String {
        let mut rels = String::new();

        // rId1 = slideMaster
        rels.push_str(
            r#"  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>"#,
        );
        rels.push('\n');

        // rId2..rIdN = slides
        for i in 0..slides.len() {
            let rid = format!("rId{}", i + 2);
            rels.push_str(&format!(
                r#"  <Relationship Id="{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{}.xml"/>"#,
                rid,
                i + 1
            ));
            rels.push('\n');
        }

        // theme reference
        let theme_rid = format!("rId{}", slides.len() + 2);
        rels.push_str(&format!(
            r#"  <Relationship Id="{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>"#,
            theme_rid
        ));
        rels.push('\n');

        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{rels}</Relationships>"#
        )
    }

    fn slide_master_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>"#.to_string()
    }

    fn slide_master_rels_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"#.to_string()
    }

    fn slide_layout_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sldLayout>"#.to_string()
    }

    fn slide_layout_rels_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"#.to_string()
    }

    fn theme_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="AGI Workforce Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>"#.to_string()
    }

    fn slide_xml(&self, slide: &PresentationSlide) -> String {
        let title_escaped = xml_escape(&slide.title);

        // Build bullet-point body paragraphs
        let mut body_paragraphs = String::new();
        for line in &slide.content {
            let escaped = xml_escape(line);
            body_paragraphs.push_str(&format!(
                r#"            <a:p>
              <a:pPr marL="342900" indent="-342900">
                <a:buChar char="&#x2022;"/>
              </a:pPr>
              <a:r>
                <a:rPr lang="en-US" sz="1800" dirty="0"/>
                <a:t>{escaped}</a:t>
              </a:r>
            </a:p>
"#
            ));
        }

        // If no content, add an empty paragraph so the shape is valid
        if slide.content.is_empty() {
            body_paragraphs.push_str("            <a:p><a:endParaRPr lang=\"en-US\"/></a:p>\n");
        }

        // Optional background fill
        let bg_xml = match &slide.background_color {
            Some(color) if color.len() == 6 => {
                format!(
                    r#"  <p:bg>
    <p:bgPr>
      <a:solidFill><a:srgbClr val="{color}"/></a:solidFill>
      <a:effectLst/>
    </p:bgPr>
  </p:bg>
"#
                )
            }
            _ => String::new(),
        };

        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
{bg_xml}    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1143000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="3200" b="1" dirty="0"/>
              <a:t>{title_escaped}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1600200"/>
            <a:ext cx="8229600" cy="4525963"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
{body_paragraphs}        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>"#
        )
    }

    fn slide_rels_xml() -> String {
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>"#.to_string()
    }

    fn notes_slide_xml(notes_text: &str) -> String {
        let escaped = xml_escape(notes_text);
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Notes Placeholder"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="body" idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" dirty="0"/>
              <a:t>{escaped}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>"#
        )
    }
}

impl Default for PresentationCreator {
    fn default() -> Self {
        Self::new()
    }
}

/// Escape special XML characters in user-provided text.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_create_simple_presentation() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let output_path = temp_dir.path().join("test.pptx");
        let output_path_str = output_path.to_str().expect("invalid path");

        let creator = PresentationCreator::new();
        let result = creator.create_simple(
            "Test Presentation",
            "Test Author",
            vec![
                (
                    "Introduction".to_string(),
                    vec![
                        "First point".to_string(),
                        "Second point".to_string(),
                    ],
                ),
                (
                    "Conclusion".to_string(),
                    vec!["Summary".to_string()],
                ),
            ],
            output_path_str,
        );

        assert!(result.is_ok(), "create_simple failed: {:?}", result.err());
        assert!(output_path.exists());

        // Verify it is a valid ZIP
        let file = std::fs::File::open(&output_path).expect("failed to open pptx");
        let archive = zip::ZipArchive::new(file).expect("not a valid zip");
        let names: Vec<&str> = archive.file_names().collect();
        assert!(names.contains(&"[Content_Types].xml"));
        assert!(names.contains(&"ppt/presentation.xml"));
        assert!(names.contains(&"ppt/slides/slide1.xml"));
        assert!(names.contains(&"ppt/slides/slide2.xml"));
    }

    #[test]
    fn test_create_presentation_with_config() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let output_path = temp_dir.path().join("full.pptx");
        let output_path_str = output_path.to_str().expect("invalid path");

        let config = PresentationConfig {
            title: "Full Presentation".to_string(),
            author: "AGI Workforce".to_string(),
            slides: vec![
                PresentationSlide {
                    title: "Title Slide".to_string(),
                    content: vec!["Welcome".to_string()],
                    notes: Some("Speaker notes here".to_string()),
                    background_color: Some("E7E6E6".to_string()),
                },
                PresentationSlide {
                    title: "Data Slide".to_string(),
                    content: vec![
                        "Point A".to_string(),
                        "Point B".to_string(),
                        "Point C".to_string(),
                    ],
                    notes: None,
                    background_color: None,
                },
            ],
        };

        let creator = PresentationCreator::new();
        let result = creator.create(&config, output_path_str);

        assert!(result.is_ok(), "create failed: {:?}", result.err());
        assert!(output_path.exists());

        let file = std::fs::File::open(&output_path).expect("failed to open pptx");
        let archive = zip::ZipArchive::new(file).expect("not a valid zip");
        let names: Vec<&str> = archive.file_names().collect();
        assert!(names.contains(&"ppt/notesSlides/notesSlide1.xml"));
        // Slide 2 has no notes, so notesSlide2 should not exist
        assert!(!names.contains(&"ppt/notesSlides/notesSlide2.xml"));
    }

    #[test]
    fn test_xml_escape() {
        assert_eq!(xml_escape("A & B"), "A &amp; B");
        assert_eq!(xml_escape("<tag>"), "&lt;tag&gt;");
        assert_eq!(xml_escape(r#"She said "hello""#), "She said &quot;hello&quot;");
    }

    #[test]
    fn test_empty_slides_vec() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let output_path = temp_dir.path().join("empty.pptx");
        let output_path_str = output_path.to_str().expect("invalid path");

        let creator = PresentationCreator::new();
        let result = creator.create_simple("Empty", "Author", vec![], output_path_str);

        assert!(result.is_ok());
        assert!(output_path.exists());
    }

    #[test]
    fn test_slide_with_empty_content() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let output_path = temp_dir.path().join("no_bullets.pptx");
        let output_path_str = output_path.to_str().expect("invalid path");

        let creator = PresentationCreator::new();
        let result = creator.create_simple(
            "No Bullets",
            "Author",
            vec![("Title Only".to_string(), vec![])],
            output_path_str,
        );

        assert!(result.is_ok());
        assert!(output_path.exists());
    }
}
