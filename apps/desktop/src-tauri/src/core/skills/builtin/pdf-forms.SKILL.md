---
name: pdf-forms
description: Fill PDF forms programmatically and extract form field data
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

# PDF Form Filling and Extraction

Fill PDF forms programmatically and extract form field data using PyPDF2 and related libraries.

## Setup Requirements

Install required libraries:
```bash
pip install PyPDF2 pdfrw fillpdf reportlab
```

For advanced form handling:
```bash
pip install pdf2image PyMuPDF
```

## Core Operations

### 1. Extracting Form Fields

#### Using PyPDF2
```python
from PyPDF2 import PdfReader

def get_form_fields(pdf_path):
    """Extract all form fields from a PDF."""
    reader = PdfReader(pdf_path)
    fields = reader.get_fields()

    if fields:
        for field_name, field_data in fields.items():
            print(f"Field: {field_name}")
            print(f"  Type: {field_data.get('/FT', 'Unknown')}")
            print(f"  Value: {field_data.get('/V', 'Empty')}")
            print()

    return fields

# Usage
fields = get_form_fields('form.pdf')
```

#### Field Types
```python
def analyze_form_structure(pdf_path):
    """Analyze and categorize form fields."""
    reader = PdfReader(pdf_path)
    fields = reader.get_fields()

    field_types = {
        '/Tx': 'Text Field',
        '/Btn': 'Button/Checkbox/Radio',
        '/Ch': 'Choice/Dropdown',
        '/Sig': 'Signature'
    }

    analysis = {
        'text_fields': [],
        'checkboxes': [],
        'dropdowns': [],
        'signatures': [],
        'other': []
    }

    for name, data in (fields or {}).items():
        field_type = data.get('/FT', '')

        if field_type == '/Tx':
            analysis['text_fields'].append(name)
        elif field_type == '/Btn':
            analysis['checkboxes'].append(name)
        elif field_type == '/Ch':
            analysis['dropdowns'].append(name)
        elif field_type == '/Sig':
            analysis['signatures'].append(name)
        else:
            analysis['other'].append(name)

    return analysis
```

### 2. Filling Form Fields

#### Using PyPDF2 (Basic)
```python
from PyPDF2 import PdfReader, PdfWriter

def fill_pdf_form(input_path, output_path, field_values):
    """Fill PDF form fields with provided values."""
    reader = PdfReader(input_path)
    writer = PdfWriter()

    # Clone pages from reader
    for page in reader.pages:
        writer.add_page(page)

    # Update form fields
    writer.update_page_form_field_values(
        writer.pages[0],
        field_values
    )

    # Write output
    with open(output_path, 'wb') as output_file:
        writer.write(output_file)

# Usage
field_values = {
    'first_name': 'John',
    'last_name': 'Smith',
    'email': 'john.smith@email.com',
    'date': '2024-01-15'
}

fill_pdf_form('blank_form.pdf', 'filled_form.pdf', field_values)
```

#### Using pdfrw (Alternative)
```python
from pdfrw import PdfReader, PdfWriter, PageMerge

def fill_form_pdfrw(input_path, output_path, field_values):
    """Fill PDF form using pdfrw library."""
    template = PdfReader(input_path)

    for page in template.pages:
        annotations = page.get('/Annots')
        if annotations:
            for annotation in annotations:
                if annotation.get('/Subtype') == '/Widget':
                    field_name = annotation.get('/T')
                    if field_name:
                        # Remove parentheses from field name
                        clean_name = field_name[1:-1] if field_name.startswith('(') else str(field_name)

                        if clean_name in field_values:
                            annotation.update({
                                '/V': f'({field_values[clean_name]})',
                                '/AS': f'/{field_values[clean_name]}'
                            })

    PdfWriter(output_path, trailer=template).write()
```

### 3. Checkbox and Radio Button Handling

```python
def fill_checkboxes(input_path, output_path, checkbox_values):
    """Fill checkbox and radio button fields.

    checkbox_values should be a dict like:
    {'agree_terms': True, 'subscribe': False}
    """
    reader = PdfReader(input_path)
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    # For checkboxes, use '/Yes' for checked, '/Off' for unchecked
    field_updates = {}
    for field_name, is_checked in checkbox_values.items():
        field_updates[field_name] = '/Yes' if is_checked else '/Off'

    writer.update_page_form_field_values(
        writer.pages[0],
        field_updates
    )

    with open(output_path, 'wb') as f:
        writer.write(f)
```

### 4. Dropdown Selection

```python
def fill_dropdown(input_path, output_path, dropdown_values):
    """Fill dropdown/combo box fields.

    dropdown_values should be a dict like:
    {'country': 'United States', 'state': 'California'}
    """
    reader = PdfReader(input_path)
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    writer.update_page_form_field_values(
        writer.pages[0],
        dropdown_values
    )

    with open(output_path, 'wb') as f:
        writer.write(f)
```

### 5. Flattening Forms (Make Non-Editable)

```python
from PyPDF2 import PdfReader, PdfWriter

def flatten_pdf_form(input_path, output_path):
    """Flatten form fields to make them non-editable."""
    reader = PdfReader(input_path)
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    # Remove form field interactivity
    if '/AcroForm' in writer._root_object:
        del writer._root_object['/AcroForm']

    with open(output_path, 'wb') as f:
        writer.write(f)
```

### 6. Batch Form Filling

```python
import csv
import os

def batch_fill_forms(template_path, csv_path, output_dir):
    """Fill multiple forms from CSV data."""
    os.makedirs(output_dir, exist_ok=True)

    with open(csv_path, 'r') as csv_file:
        reader = csv.DictReader(csv_file)

        for i, row in enumerate(reader, start=1):
            output_path = os.path.join(output_dir, f'form_{i:04d}.pdf')
            fill_pdf_form(template_path, output_path, row)
            print(f'Created: {output_path}')

# CSV format example:
# first_name,last_name,email,phone
# John,Smith,john@email.com,555-1234
# Jane,Doe,jane@email.com,555-5678
```

### 7. Creating Fillable Forms from Scratch

```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

def create_fillable_form(output_path):
    """Create a new fillable PDF form."""
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter

    # Title
    c.setFont('Helvetica-Bold', 16)
    c.drawString(1*inch, height - 1*inch, 'Registration Form')

    # Form fields (using acroforms)
    form = c.acroForm

    # Text field
    c.setFont('Helvetica', 12)
    c.drawString(1*inch, height - 2*inch, 'Name:')
    form.textfield(
        name='name',
        tooltip='Enter your full name',
        x=2*inch,
        y=height - 2.2*inch,
        width=4*inch,
        height=0.3*inch
    )

    # Email field
    c.drawString(1*inch, height - 2.8*inch, 'Email:')
    form.textfield(
        name='email',
        tooltip='Enter your email address',
        x=2*inch,
        y=height - 3*inch,
        width=4*inch,
        height=0.3*inch
    )

    # Checkbox
    c.drawString(1*inch, height - 3.8*inch, 'Subscribe:')
    form.checkbox(
        name='subscribe',
        tooltip='Check to subscribe to newsletter',
        x=2*inch,
        y=height - 4*inch,
        size=0.3*inch
    )

    # Dropdown
    c.drawString(1*inch, height - 4.8*inch, 'Country:')
    form.choice(
        name='country',
        tooltip='Select your country',
        options=['United States', 'Canada', 'United Kingdom', 'Other'],
        x=2*inch,
        y=height - 5*inch,
        width=2*inch,
        height=0.3*inch
    )

    c.save()
```

### 8. Extracting Form Data to CSV

```python
import csv
from PyPDF2 import PdfReader
import os

def extract_forms_to_csv(pdf_folder, output_csv):
    """Extract form data from multiple PDFs to CSV."""
    all_data = []
    all_fields = set()

    # First pass: collect all field names
    for filename in os.listdir(pdf_folder):
        if filename.endswith('.pdf'):
            pdf_path = os.path.join(pdf_folder, filename)
            reader = PdfReader(pdf_path)
            fields = reader.get_fields()
            if fields:
                all_fields.update(fields.keys())

    # Second pass: extract data
    for filename in os.listdir(pdf_folder):
        if filename.endswith('.pdf'):
            pdf_path = os.path.join(pdf_folder, filename)
            reader = PdfReader(pdf_path)
            fields = reader.get_fields()

            row = {'filename': filename}
            if fields:
                for field_name in all_fields:
                    value = ''
                    if field_name in fields:
                        field_data = fields[field_name]
                        value = field_data.get('/V', '')
                        if isinstance(value, str) and value.startswith('/'):
                            value = value[1:]  # Remove leading slash
                    row[field_name] = value

            all_data.append(row)

    # Write CSV
    fieldnames = ['filename'] + sorted(all_fields)
    with open(output_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_data)
```

## Error Handling

```python
def safe_fill_form(input_path, output_path, field_values):
    """Fill form with comprehensive error handling."""
    try:
        reader = PdfReader(input_path)

        # Check if PDF has form fields
        fields = reader.get_fields()
        if not fields:
            raise ValueError("PDF has no fillable form fields")

        # Validate provided field names
        invalid_fields = set(field_values.keys()) - set(fields.keys())
        if invalid_fields:
            print(f"Warning: Unknown fields will be ignored: {invalid_fields}")

        # Fill the form
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)

        valid_values = {k: v for k, v in field_values.items() if k in fields}
        writer.update_page_form_field_values(writer.pages[0], valid_values)

        with open(output_path, 'wb') as f:
            writer.write(f)

        return True, "Form filled successfully"

    except FileNotFoundError:
        return False, f"PDF file not found: {input_path}"
    except Exception as e:
        return False, f"Error filling form: {str(e)}"
```

## Best Practices

1. **Validate fields**: Always check available fields before filling
2. **Handle encoding**: Be aware of character encoding in field values
3. **Preserve appearance**: Some PDFs need appearance streams regenerated
4. **Test thoroughly**: Different PDF creators produce different form structures
5. **Backup originals**: Keep original forms before modification
6. **Flatten for distribution**: Flatten forms when sending final versions

## Target: $ARGUMENTS

Process the PDF form following these guidelines and best practices.
