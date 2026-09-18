---
id: files-and-attachments
title: Attach files to a chat
path: /chat
category: files
tags: attach, attachment, upload, file, pdf, image, docx, xlsx, pptx, csv, drag and drop, paste, screenshot, too large, unsupported file
updated: 2026-09-17
scope: public
---

## Attaching a file

Use the **+** button beside the composer, drag files onto the conversation, or
paste them from the clipboard. Attachments appear as previews above the
composer, and each one can be removed before you send.

## What a chat can read

Images (PNG, JPEG, GIF, WebP), PDFs, plain text and Markdown, CSV, JSON and
notebooks, HTML, CSS, XML, and Word, Excel and PowerPoint documents. Source
files in common languages are accepted as text.

## When a file does not go with the message

The composer refuses a file rather than sending your message without it, and the
outgoing turn carries a line naming the file and the reason, so the model knows
an attachment is missing instead of inventing its contents. The reasons you can
see are:

- larger than this chat can send
- not a file type this chat can read
- this message already carries as many files as it can
- this conversation has reached its attachment limit
- removed from your Library, so attach it again
- could not be loaded, so attach it again

If a file is refused for size, convert or split it; if it is refused for type,
paste the contents as text instead.

## Where attachments end up

Files you attach in an ordinary chat are stored in your **Library**, where you
can find, preview, re-attach or delete them. Files attached in a temporary chat
are deliberately kept out of the Library.

## Files AGI creates

Generated images, documents and other outputs appear in the conversation and in
the Library alongside your uploads. In an AGI Work session they also collect in
the session dock under **Outputs**, with **Open** and **Download** on each one.
