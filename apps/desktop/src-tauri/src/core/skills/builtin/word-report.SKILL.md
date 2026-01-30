---
name: word-report
description: Create professional Word document reports with sections, table of contents, tables, images, and formatting
allowed-tools:
  - file_write
  - file_read
  - terminal_execute
  - python_execute
context: main
metadata:
  agiworkforce:
    requires:
      bins: ["python3"]
      env: []
    os: ["darwin", "linux", "windows"]
---

# Word Document Report Creation

Create professional Word documents programmatically using python-docx.

## Setup Requirements

Ensure python-docx is installed:
```bash
pip install python-docx
```

## Document Structure

### 1. Creating a New Document

```python
from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE

document = Document()
```

### 2. Document Sections and Layout

#### Page Setup
```python
from docx.enum.section import WD_ORIENT

section = document.sections[0]

# Page size (Letter: 8.5 x 11 inches)
section.page_width = Inches(8.5)
section.page_height = Inches(11)

# Margins
section.top_margin = Inches(1)
section.bottom_margin = Inches(1)
section.left_margin = Inches(1.25)
section.right_margin = Inches(1.25)

# Orientation
section.orientation = WD_ORIENT.PORTRAIT
```

#### Multiple Sections
```python
from docx.enum.section import WD_SECTION

# Add a new section (e.g., for landscape page)
new_section = document.add_section(WD_SECTION.NEW_PAGE)
new_section.orientation = WD_ORIENT.LANDSCAPE
new_section.page_width = Inches(11)
new_section.page_height = Inches(8.5)
```

### 3. Headings and Paragraphs

#### Headings
```python
# Title
document.add_heading('Annual Report 2024', 0)

# Section headings
document.add_heading('Executive Summary', level=1)
document.add_heading('Key Findings', level=2)
document.add_heading('Methodology', level=3)
```

#### Paragraphs with Formatting
```python
# Basic paragraph
p = document.add_paragraph('This is the introduction to the report.')

# Paragraph with inline formatting
p = document.add_paragraph()
p.add_run('Important: ').bold = True
p.add_run('This text follows the bold text.')

# Italics and underline
run = p.add_run(' This is italic.')
run.italic = True
run = p.add_run(' This is underlined.')
run.underline = True

# Alignment
p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
```

#### Paragraph Spacing
```python
from docx.shared import Pt

paragraph_format = p.paragraph_format
paragraph_format.space_before = Pt(12)
paragraph_format.space_after = Pt(12)
paragraph_format.line_spacing = 1.5
```

### 4. Table of Contents

```python
# Add TOC placeholder (Word will update it when opened)
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

paragraph = document.add_paragraph()
run = paragraph.add_run()

fldChar1 = OxmlElement('w:fldChar')
fldChar1.set(qn('w:fldCharType'), 'begin')

instrText = OxmlElement('w:instrText')
instrText.set(qn('xml:space'), 'preserve')
instrText.text = 'TOC \\o "1-3" \\h \\z \\u'

fldChar2 = OxmlElement('w:fldChar')
fldChar2.set(qn('w:fldCharType'), 'separate')

fldChar3 = OxmlElement('w:fldChar')
fldChar3.set(qn('w:fldCharType'), 'end')

run._r.append(fldChar1)
run._r.append(instrText)
run._r.append(fldChar2)
run._r.append(fldChar3)

# Add page break after TOC
document.add_page_break()
```

### 5. Tables

#### Basic Table
```python
from docx.enum.table import WD_TABLE_ALIGNMENT

# Create table
table = document.add_table(rows=4, cols=3)
table.style = 'Table Grid'
table.alignment = WD_TABLE_ALIGNMENT.CENTER

# Header row
header_cells = table.rows[0].cells
header_cells[0].text = 'Name'
header_cells[1].text = 'Department'
header_cells[2].text = 'Salary'

# Data rows
data = [
    ('John Smith', 'Engineering', '$85,000'),
    ('Jane Doe', 'Marketing', '$72,000'),
    ('Bob Johnson', 'Sales', '$68,000'),
]

for i, row_data in enumerate(data, start=1):
    row_cells = table.rows[i].cells
    for j, value in enumerate(row_data):
        row_cells[j].text = value
```

#### Table Styling
```python
from docx.oxml.ns import nsdecls
from docx.oxml import parse_xml

# Set column widths
table.columns[0].width = Inches(2)
table.columns[1].width = Inches(2)
table.columns[2].width = Inches(1.5)

# Header formatting
for cell in table.rows[0].cells:
    cell.paragraphs[0].runs[0].bold = True
    # Background color
    shading = parse_xml(r'<w:shd {} w:fill="4472C4"/>'.format(nsdecls('w')))
    cell._tc.get_or_add_tcPr().append(shading)

# Cell alignment
for row in table.rows:
    for cell in row.cells:
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
```

#### Merged Cells
```python
# Merge cells in first row
table.cell(0, 0).merge(table.cell(0, 2))
table.rows[0].cells[0].text = 'Employee Information'
```

### 6. Images and Figures

```python
# Add image
document.add_picture('chart.png', width=Inches(5))

# Add image with caption
document.add_picture('figure1.png', width=Inches(4))
caption = document.add_paragraph('Figure 1: Quarterly Revenue Trend')
caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
caption.style = 'Caption'
```

### 7. Lists

#### Bullet Lists
```python
# Simple bullet list
document.add_paragraph('First item', style='List Bullet')
document.add_paragraph('Second item', style='List Bullet')
document.add_paragraph('Third item', style='List Bullet')

# Nested bullets
document.add_paragraph('Main item', style='List Bullet')
document.add_paragraph('Sub item', style='List Bullet 2')
document.add_paragraph('Sub item', style='List Bullet 2')
```

#### Numbered Lists
```python
document.add_paragraph('First step', style='List Number')
document.add_paragraph('Second step', style='List Number')
document.add_paragraph('Third step', style='List Number')
```

### 8. Headers and Footers

```python
from docx.enum.text import WD_ALIGN_PARAGRAPH

section = document.sections[0]

# Header
header = section.header
header_para = header.paragraphs[0]
header_para.text = "Company Confidential"
header_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT

# Footer with page numbers
footer = section.footer
footer_para = footer.paragraphs[0]
footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Add page number field
run = footer_para.add_run()
fldChar1 = OxmlElement('w:fldChar')
fldChar1.set(qn('w:fldCharType'), 'begin')
run._r.append(fldChar1)

run = footer_para.add_run()
instrText = OxmlElement('w:instrText')
instrText.text = 'PAGE'
run._r.append(instrText)

run = footer_para.add_run()
fldChar2 = OxmlElement('w:fldChar')
fldChar2.set(qn('w:fldCharType'), 'end')
run._r.append(fldChar2)
```

### 9. Styles and Themes

#### Custom Styles
```python
from docx.enum.style import WD_STYLE_TYPE

# Create custom paragraph style
styles = document.styles
custom_style = styles.add_style('CustomHeading', WD_STYLE_TYPE.PARAGRAPH)
custom_style.font.size = Pt(14)
custom_style.font.bold = True
custom_style.font.color.rgb = RGBColor(0x00, 0x66, 0xCC)

# Apply custom style
document.add_paragraph('Custom Styled Text', style='CustomHeading')
```

#### Font Styling
```python
from docx.shared import RGBColor

run = paragraph.add_run('Styled text')
run.font.name = 'Arial'
run.font.size = Pt(12)
run.font.color.rgb = RGBColor(0x00, 0x00, 0x00)
```

### 10. Saving the Document

```python
document.save('report.docx')
```

## Report Templates

### Executive Summary Template
```python
def create_executive_summary(document, title, summary_points):
    document.add_heading(title, 0)
    document.add_heading('Executive Summary', level=1)

    for point in summary_points:
        document.add_paragraph(point, style='List Bullet')

    document.add_page_break()
```

### Data Report Section
```python
def add_data_section(document, section_title, description, table_data):
    document.add_heading(section_title, level=1)
    document.add_paragraph(description)

    # Create table from data
    if table_data:
        headers = table_data[0]
        rows = table_data[1:]

        table = document.add_table(rows=len(table_data), cols=len(headers))
        table.style = 'Table Grid'

        for i, header in enumerate(headers):
            table.rows[0].cells[i].text = header
            table.rows[0].cells[i].paragraphs[0].runs[0].bold = True

        for row_idx, row_data in enumerate(rows, start=1):
            for col_idx, value in enumerate(row_data):
                table.rows[row_idx].cells[col_idx].text = str(value)
```

## Best Practices

1. **Consistent formatting**: Use styles rather than direct formatting
2. **Clear hierarchy**: Use heading levels appropriately (H1 > H2 > H3)
3. **Professional appearance**: Adequate margins and spacing
4. **Accessible design**: Proper heading structure for screen readers
5. **Page breaks**: Control page flow for professional layouts
6. **Proofread**: Check spelling and grammar before finalizing

## Target: $ARGUMENTS

Create the Word document report following these guidelines and best practices.
