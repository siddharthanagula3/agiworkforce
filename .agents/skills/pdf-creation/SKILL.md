---
name: pdf-creation
description: Create text PDF documents such as reports, summaries, handouts and letters with clear headings and lists.
version: 1.0.0
requires:
  tools: [create_office_file]
---

# PDF creation

Use this skill when the user needs a `.pdf` deliverable they can share or print as it is.

1. Identify the audience, purpose, required sections, length, and source material.
2. Build a short outline before drafting.
3. Write the content with `#` to `###` headings, `-` bullet lines and short paragraphs. Numbered lines print as bullets, so write any number the reader needs into the text, and a `| pipe | table |` prints as plain rows with the cells separated by bars, not a drawn table.
4. Preserve factual uncertainty and cite supplied or researched sources where appropriate.
5. Create the file with `create_office_file` and format `pdf`; do not claim a file exists until the tool succeeds.
6. Check the returned file metadata and summarize what was created, including any content gaps.

The PDF holds text only: no images, logos, form fields, signatures or custom fonts, and it cannot edit, merge or fill an existing PDF. Its built-in font draws Latin-script text, so text in other scripts, such as Chinese, Arabic or Hindi, belongs in a Word document. When the user needs an editable document or real tables, offer a Word document instead.

Do not add confidential data, signatures, or legal claims the user did not provide or authorize.
