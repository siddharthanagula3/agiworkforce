---
name: excel-analysis
description: Perform Excel data analysis including formulas, pivot tables, charts, and data transformation
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

# Excel Data Analysis

Perform comprehensive Excel data analysis using openpyxl and pandas.

## Setup Requirements

Ensure required libraries are installed:
```bash
pip install openpyxl pandas xlsxwriter
```

## Core Operations

### 1. Reading Excel Files

```python
import pandas as pd
from openpyxl import load_workbook

# Using pandas (recommended for data analysis)
df = pd.read_excel('data.xlsx', sheet_name='Sheet1')

# Using openpyxl (for more control)
wb = load_workbook('data.xlsx')
ws = wb.active
```

### 2. Data Cleaning and Transformation

#### Handling Missing Data
```python
# Check for missing values
df.isnull().sum()

# Fill missing values
df['column'].fillna(df['column'].mean(), inplace=True)

# Drop rows with missing values
df.dropna(subset=['important_column'], inplace=True)
```

#### Data Type Conversion
```python
# Convert to numeric
df['amount'] = pd.to_numeric(df['amount'], errors='coerce')

# Convert to datetime
df['date'] = pd.to_datetime(df['date'], format='%Y-%m-%d')

# Convert to category
df['status'] = df['status'].astype('category')
```

#### String Operations
```python
# Clean text columns
df['name'] = df['name'].str.strip().str.title()

# Extract patterns
df['year'] = df['date_string'].str.extract(r'(\d{4})')
```

### 3. Formulas and Calculations

#### Basic Formulas with openpyxl
```python
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active

# Add data
data = [
    ['Product', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['Widget A', 100, 150, 200, 175, None],
    ['Widget B', 80, 95, 120, 110, None],
]

for row in data:
    ws.append(row)

# Add SUM formulas
for row in range(2, 4):
    ws.cell(row=row, column=6, value=f'=SUM(B{row}:E{row})')

# Add column totals
ws['B4'] = '=SUM(B2:B3)'
ws['C4'] = '=SUM(C2:C3)'
```

#### Common Formula Patterns
```python
# SUMIF equivalent
ws['G2'] = '=SUMIF(A:A,"Widget A",B:B)'

# VLOOKUP equivalent
ws['H2'] = '=VLOOKUP(A2,LookupTable!A:B,2,FALSE)'

# IF formula
ws['I2'] = '=IF(F2>500,"High","Low")'

# COUNTIF
ws['J2'] = '=COUNTIF(A:A,A2)'

# Percentage of total
ws['K2'] = '=F2/SUM(F:F)'
```

### 4. Pivot Tables

#### Creating Pivot Tables with Pandas
```python
# Simple pivot table
pivot = pd.pivot_table(
    df,
    values='sales',
    index='region',
    columns='quarter',
    aggfunc='sum'
)

# Multiple aggregations
pivot = pd.pivot_table(
    df,
    values=['sales', 'quantity'],
    index=['region', 'category'],
    columns='year',
    aggfunc={
        'sales': ['sum', 'mean'],
        'quantity': 'sum'
    },
    margins=True
)

# Export to Excel
pivot.to_excel('pivot_output.xlsx')
```

#### Pivot Table with openpyxl (Excel native)
```python
from openpyxl.pivot import PivotTable, PivotField

# Note: Creating native Excel pivot tables requires more setup
# Pandas pivot tables exported to Excel are often sufficient
```

### 5. Charts and Visualizations

#### Creating Charts with openpyxl
```python
from openpyxl.chart import BarChart, LineChart, PieChart, Reference

# Bar Chart
chart = BarChart()
chart.title = "Quarterly Sales"
chart.x_axis.title = "Quarter"
chart.y_axis.title = "Sales ($)"

data = Reference(ws, min_col=2, max_col=5, min_row=1, max_row=3)
categories = Reference(ws, min_col=1, min_row=2, max_row=3)

chart.add_data(data, titles_from_data=True)
chart.set_categories(categories)
chart.shape = 4
ws.add_chart(chart, "H2")

# Line Chart
line_chart = LineChart()
line_chart.title = "Trend Analysis"
line_chart.add_data(data, titles_from_data=True)
line_chart.set_categories(categories)
ws.add_chart(line_chart, "H18")

# Pie Chart
pie = PieChart()
pie.title = "Market Share"
pie.add_data(Reference(ws, min_col=2, max_col=2, min_row=1, max_row=4))
pie.set_categories(Reference(ws, min_col=1, min_row=2, max_row=4))
ws.add_chart(pie, "H34")
```

### 6. Conditional Formatting

```python
from openpyxl.formatting.rule import ColorScaleRule, FormulaRule, CellIsRule
from openpyxl.styles import PatternFill

# Color scale (heat map)
color_scale = ColorScaleRule(
    start_type='min', start_color='F8696B',
    mid_type='percentile', mid_value=50, mid_color='FFEB84',
    end_type='max', end_color='63BE7B'
)
ws.conditional_formatting.add('B2:E10', color_scale)

# Highlight cells above threshold
red_fill = PatternFill(start_color='FF0000', end_color='FF0000', fill_type='solid')
rule = CellIsRule(operator='greaterThan', formula=['100'], fill=red_fill)
ws.conditional_formatting.add('B2:E10', rule)

# Formula-based rule
ws.conditional_formatting.add(
    'A2:A100',
    FormulaRule(formula=['COUNTIF($A:$A,A2)>1'], fill=red_fill)
)
```

### 7. Data Validation

```python
from openpyxl.worksheet.datavalidation import DataValidation

# Dropdown list
dv = DataValidation(
    type="list",
    formula1='"High,Medium,Low"',
    allow_blank=True
)
dv.add('F2:F100')
ws.add_data_validation(dv)

# Number range
dv_number = DataValidation(
    type="whole",
    operator="between",
    formula1=0,
    formula2=100
)
dv_number.add('G2:G100')
ws.add_data_validation(dv_number)
```

### 8. Styling and Formatting

```python
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

# Header styling
header_font = Font(bold=True, color='FFFFFF', size=12)
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
header_alignment = Alignment(horizontal='center', vertical='center')

for cell in ws[1]:
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = header_alignment

# Number formatting
for row in ws.iter_rows(min_row=2, min_col=2, max_col=5):
    for cell in row:
        cell.number_format = '$#,##0.00'

# Border
thin_border = Border(
    left=Side(style='thin'),
    right=Side(style='thin'),
    top=Side(style='thin'),
    bottom=Side(style='thin')
)
```

### 9. Saving Results

```python
# Save workbook
wb.save('output.xlsx')

# Save pandas DataFrame to Excel with formatting
with pd.ExcelWriter('analysis.xlsx', engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name='Data', index=False)
    pivot.to_excel(writer, sheet_name='Pivot')
```

## Best Practices

1. **Backup original data**: Always work on a copy of the original file
2. **Validate data types**: Check and convert data types before analysis
3. **Document formulas**: Add comments explaining complex formulas
4. **Use named ranges**: Make formulas more readable and maintainable
5. **Test edge cases**: Verify formulas handle empty cells and errors
6. **Optimize large files**: Use chunked reading for files over 100MB

## Target: $ARGUMENTS

Analyze the Excel data and create the requested output following these guidelines.
