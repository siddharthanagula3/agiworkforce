---
name: powerpoint
description: Create professional PowerPoint presentations with slides, themes, and visual content
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

# PowerPoint Presentation Creation

Create professional PowerPoint presentations programmatically using python-pptx.

## Setup Requirements

Ensure python-pptx is installed:
```bash
pip install python-pptx
```

## Presentation Structure

### 1. Planning the Presentation
Before creating slides, understand:
- **Purpose**: What is the presentation trying to achieve?
- **Audience**: Who will be viewing this presentation?
- **Key messages**: What are the 3-5 main takeaways?
- **Story flow**: How should the content progress?

### 2. Slide Types

#### Title Slide
```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

prs = Presentation()
slide_layout = prs.slide_layouts[6]  # Blank layout
slide = prs.slides.add_slide(slide_layout)

# Add title
title_box = slide.shapes.add_textbox(Inches(0.5), Inches(2), Inches(9), Inches(1.5))
title_frame = title_box.text_frame
title_para = title_frame.paragraphs[0]
title_para.text = "Presentation Title"
title_para.font.size = Pt(44)
title_para.font.bold = True
title_para.alignment = PP_ALIGN.CENTER
```

#### Content Slide with Bullet Points
```python
slide_layout = prs.slide_layouts[1]  # Title and Content
slide = prs.slides.add_slide(slide_layout)
title = slide.shapes.title
title.text = "Key Points"

body_shape = slide.shapes.placeholders[1]
tf = body_shape.text_frame
tf.text = "First bullet point"

p = tf.add_paragraph()
p.text = "Second bullet point"
p.level = 0

p = tf.add_paragraph()
p.text = "Sub-bullet point"
p.level = 1
```

#### Two-Column Layout
```python
slide_layout = prs.slide_layouts[6]  # Blank
slide = prs.slides.add_slide(slide_layout)

# Left column
left_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(4.5), Inches(5))
left_frame = left_box.text_frame
left_frame.word_wrap = True
left_frame.paragraphs[0].text = "Left column content"

# Right column
right_box = slide.shapes.add_textbox(Inches(5.25), Inches(1.5), Inches(4.5), Inches(5))
right_frame = right_box.text_frame
right_frame.word_wrap = True
right_frame.paragraphs[0].text = "Right column content"
```

### 3. Adding Visual Elements

#### Images
```python
slide.shapes.add_picture('image.png', Inches(1), Inches(1), width=Inches(4))
```

#### Tables
```python
from pptx.util import Inches

rows, cols = 3, 4
left, top, width, height = Inches(1), Inches(2), Inches(8), Inches(2)
table = slide.shapes.add_table(rows, cols, left, top, width, height).table

# Set column widths
table.columns[0].width = Inches(2)

# Add data
table.cell(0, 0).text = "Header 1"
table.cell(1, 0).text = "Data 1"
```

#### Charts
```python
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE

chart_data = CategoryChartData()
chart_data.categories = ['Q1', 'Q2', 'Q3', 'Q4']
chart_data.add_series('Series 1', (19.2, 21.4, 16.7, 28.0))

x, y, cx, cy = Inches(1), Inches(2), Inches(8), Inches(4.5)
chart = slide.shapes.add_chart(
    XL_CHART_TYPE.COLUMN_CLUSTERED, x, y, cx, cy, chart_data
).chart
```

### 4. Applying Themes and Formatting

#### Colors and Fonts
```python
from pptx.dml.color import RgbColor
from pptx.enum.dml import MSO_THEME_COLOR

# Custom color
paragraph.font.color.rgb = RgbColor(0x00, 0x66, 0xCC)

# Theme color
paragraph.font.color.theme_color = MSO_THEME_COLOR.ACCENT_1
```

#### Shapes with Styling
```python
from pptx.enum.shapes import MSO_SHAPE

shape = slide.shapes.add_shape(
    MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1), Inches(1), Inches(3), Inches(1)
)
shape.fill.solid()
shape.fill.fore_color.rgb = RgbColor(0x00, 0x66, 0xCC)
shape.line.color.rgb = RgbColor(0x00, 0x33, 0x66)
```

### 5. Saving the Presentation
```python
prs.save('presentation.pptx')
```

## Best Practices

1. **Consistency**: Use consistent fonts, colors, and layouts throughout
2. **Simplicity**: One main idea per slide, limit bullet points to 5-7
3. **Visual hierarchy**: Use size and position to guide attention
4. **White space**: Do not overcrowd slides, leave breathing room
5. **Readability**: Minimum 24pt font for body text, 36pt+ for titles
6. **Contrast**: Ensure sufficient contrast between text and background

## Target: $ARGUMENTS

Create the PowerPoint presentation following these guidelines and best practices.
