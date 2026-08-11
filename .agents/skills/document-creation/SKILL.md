---
name: document-creation
description: Create polished Word documents from verified content and an audience-aware structure.
version: 1.0.0
requires:
  tools: [create_office_file]
---

# Document creation

Use this skill when the user needs a `.docx` deliverable.

1. Identify the audience, purpose, required sections, tone, and source material.
2. Build a short outline before drafting the document.
3. Use headings, concise paragraphs, lists, and tables only where they improve comprehension.
4. Preserve factual uncertainty and cite supplied or researched sources where appropriate.
5. Create the document with `create_office_file`; do not claim a file exists until the tool succeeds.
6. Check the returned file metadata and summarize what was created, including any unresolved content gaps.

Do not add confidential data, logos, signatures, or legal claims the user did not provide or authorize.
