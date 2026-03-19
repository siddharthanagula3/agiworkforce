# Mobile Document Handling Implementation Guide

> Comprehensive patterns for creating, viewing, importing, exporting, and syncing documents in Expo/React Native (SDK 54+, React Native 0.83+, 2026).

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File System Fundamentals (expo-file-system)](#file-system-fundamentals)
3. [Creating PDF Documents](#creating-pdf-documents)
4. [Creating Word Documents (.docx)](#creating-word-documents)
5. [Importing Files (expo-document-picker)](#importing-files)
6. [Viewing Documents](#viewing-documents)
7. [Sharing Files (expo-sharing)](#sharing-files)
8. [Saving to Device Storage](#saving-to-device-storage)
9. [Cloud Sync](#cloud-sync)
10. [Library Reference](#library-reference)
11. [Platform Considerations](#platform-considerations)

---

## Architecture Overview

```
services/
  fileCreation.ts       # PDF + text export (already exists)
  documentService.ts    # DOCX generation, file management (new)
  cloudSync.ts          # Cloud storage integration (new)

lib/
  fileUtils.ts          # Path helpers, MIME detection, sanitization (new)

components/
  chat/
    FileExportButton.tsx    # Export bottom sheet (already exists)
    AttachmentButton.tsx    # Import via camera/library/picker (already exists)
  documents/
    DocumentViewer.tsx      # In-app file viewer (new)
    DocumentList.tsx        # File manager list (new)
```

### Dependency Map

| Package                      | Purpose                    | Expo Managed  | Native Module |
| ---------------------------- | -------------------------- | :-----------: | :-----------: |
| `expo-file-system`           | Read/write/download files  |      Yes      |      Yes      |
| `expo-print`                 | HTML-to-PDF generation     |      Yes      |      Yes      |
| `expo-sharing`               | Native share sheet         |      Yes      |      Yes      |
| `expo-document-picker`       | System file picker         |      Yes      |      Yes      |
| `docx` (npm)                 | Generate .docx from JS     | Yes (pure JS) |      No       |
| `react-native-pdf`           | PDF viewer component       |   EAS Build   |      Yes      |
| `react-native-blob-util`     | Large file download/upload |   EAS Build   |      Yes      |
| `react-native-cloud-storage` | iCloud + Google Drive      |   EAS Build   |      Yes      |

---

## File System Fundamentals

### SDK 54+ Modern API (expo-file-system)

Expo SDK 54 promoted the `expo-file-system/next` API to stable. The old API remains under `expo-file-system/legacy`. The new API uses `File` and `Directory` classes with an object-oriented interface.

```typescript
// Modern API (SDK 54+ stable)
import { File, Directory, Paths } from 'expo-file-system';

// Legacy API (still supported)
import {
  documentDirectory,
  cacheDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  getInfoAsync,
  deleteAsync,
  moveAsync,
  copyAsync,
  makeDirectoryAsync,
  EncodingType,
} from 'expo-file-system/legacy';
```

### Key Directories

```typescript
import { documentDirectory, cacheDirectory } from 'expo-file-system/legacy';

// documentDirectory — persistent, survives app updates, backed up
// Example: file:///data/user/0/com.app/files/
const DOCS_DIR = `${documentDirectory}documents/`;

// cacheDirectory — system may purge when storage is low
// Example: file:///data/user/0/com.app/cache/
const CACHE_DIR = `${cacheDirectory}tmp/`;
```

### Core File Operations

```typescript
import {
  writeAsStringAsync,
  readAsStringAsync,
  getInfoAsync,
  deleteAsync,
  moveAsync,
  copyAsync,
  makeDirectoryAsync,
  downloadAsync,
  EncodingType,
  documentDirectory,
} from 'expo-file-system/legacy';

// ---- Ensure directory exists ----
async function ensureDir(path: string): Promise<void> {
  const info = await getInfoAsync(path);
  if (!info.exists) {
    await makeDirectoryAsync(path, { intermediates: true });
  }
}

// ---- Write text file ----
async function writeTextFile(fileName: string, content: string): Promise<string> {
  const dir = `${documentDirectory}documents/`;
  await ensureDir(dir);
  const uri = `${dir}${fileName}`;
  await writeAsStringAsync(uri, content, { encoding: EncodingType.UTF8 });
  return uri;
}

// ---- Write binary (base64) ----
async function writeBinaryFile(fileName: string, base64Data: string): Promise<string> {
  const dir = `${documentDirectory}documents/`;
  await ensureDir(dir);
  const uri = `${dir}${fileName}`;
  await writeAsStringAsync(uri, base64Data, { encoding: EncodingType.Base64 });
  return uri;
}

// ---- Read file ----
async function readTextFile(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: EncodingType.UTF8 });
}

// ---- File info ----
async function getFileSize(uri: string): Promise<number> {
  const info = await getInfoAsync(uri, { size: true });
  return info.exists ? (info.size ?? 0) : 0;
}

// ---- Download from URL ----
async function downloadFile(url: string, fileName: string): Promise<string> {
  const dir = `${documentDirectory}downloads/`;
  await ensureDir(dir);
  const destUri = `${dir}${fileName}`;
  const { uri } = await downloadAsync(url, destUri);
  return uri;
}

// ---- Delete file ----
async function removeFile(uri: string): Promise<void> {
  const info = await getInfoAsync(uri);
  if (info.exists) {
    await deleteAsync(uri, { idempotent: true });
  }
}

// ---- Move / rename ----
async function renameFile(fromUri: string, toUri: string): Promise<void> {
  await moveAsync({ from: fromUri, to: toUri });
}

// ---- Copy ----
async function duplicateFile(fromUri: string, toUri: string): Promise<void> {
  await copyAsync({ from: fromUri, to: toUri });
}
```

### Modern API (File + Directory classes, SDK 54+)

```typescript
import { File, Directory, Paths } from 'expo-file-system';

// ---- Create and write ----
const file = new File(Paths.document, 'report.txt');
file.text = 'Hello from the new API';

// ---- Read ----
const content = file.text; // string contents
const bytes = file.bytes; // Uint8Array
const base64 = file.base64; // base64 string

// ---- File metadata ----
console.log(file.exists); // boolean
console.log(file.size); // number (bytes)
console.log(file.uri); // full URI

// ---- Directory operations ----
const dir = new Directory(Paths.document, 'exports');
dir.create(); // mkdir -p equivalent
const files = dir.list(); // string[] of child names

// ---- Delete ----
file.delete();
dir.delete(); // recursive

// ---- Move / Copy ----
file.move(new Directory(Paths.cache, 'tmp'));
file.copy(new File(Paths.document, 'report-copy.txt'));

// ---- Blob interface (works with fetch/expo-fetch) ----
const response = await fetch('https://example.com/api/data');
const blob = await response.blob();
const downloaded = new File(Paths.cache, 'data.json');
// File implements Blob, so ecosystem compat is built in
```

---

## Creating PDF Documents

### Approach 1: expo-print (Recommended for Managed Expo)

This is what the project already uses in `services/fileCreation.ts`. It converts HTML to PDF natively with zero extra dependencies.

```typescript
import * as Print from 'expo-print';
import { documentDirectory, moveAsync, deleteAsync, getInfoAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface PDFOptions {
  html: string;
  fileName: string;
  /** Page dimensions in pixels (default: A4) */
  width?: number;
  height?: number;
  /** Base64-encoded data for header/footer images */
  base64Images?: Record<string, string>;
}

async function generatePDF(options: PDFOptions): Promise<string> {
  const { html, fileName, width, height } = options;

  // Generate PDF to cache
  const { uri } = await Print.printToFileAsync({
    html,
    width: width ?? 612, // A4 width in points
    height: height ?? 792, // A4 height in points
  });

  // Move to persistent storage with meaningful name
  const destUri = `${documentDirectory}${fileName}`;
  const existing = await getInfoAsync(destUri);
  if (existing.exists) {
    await deleteAsync(destUri, { idempotent: true });
  }
  await moveAsync({ from: uri, to: destUri });

  return destUri;
}

// ---- Usage: Generate a styled report ----
async function createReport(title: string, sections: { heading: string; body: string }[]) {
  const sectionsHtml = sections.map((s) => `<h2>${s.heading}</h2><p>${s.body}</p>`).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { margin: 1in; }
        body {
          font-family: -apple-system, Helvetica, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #333;
        }
        h1 { color: #1a1a1a; border-bottom: 2px solid #21808d; padding-bottom: 8px; }
        h2 { color: #444; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        .footer { text-align: center; font-size: 10px; color: #999; margin-top: 40px; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${sectionsHtml}
      <div class="footer">Generated by AGI Workforce</div>
    </body>
    </html>
  `;

  const uri = await generatePDF({
    html,
    fileName: `${sanitize(title)}.pdf`,
  });

  return uri;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 64);
}
```

### Approach 2: pdf-lib (Pure JS, No Native Modules)

Works in Expo Go since it is a pure JavaScript library. Good for programmatic PDF construction (not HTML-based).

```bash
npx expo install pdf-lib @pdf-lib/fontkit
```

```typescript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { writeAsStringAsync, documentDirectory, EncodingType } from 'expo-file-system/legacy';

async function createPDFWithPdfLib(title: string, content: string): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([612, 792]); // A4
  const { height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Title
  page.drawText(title, {
    x: margin,
    y,
    size: 24,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 40;

  // Horizontal rule
  page.drawLine({
    start: { x: margin, y },
    end: { x: 612 - margin, y },
    thickness: 1,
    color: rgb(0.13, 0.5, 0.55),
  });
  y -= 30;

  // Body text (word-wrap)
  const maxWidth = 612 - margin * 2;
  const fontSize = 12;
  const lineHeight = fontSize * 1.5;
  const words = content.split(' ');
  let line = '';

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const textWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (textWidth > maxWidth && line) {
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
      y -= lineHeight;
      line = word;

      // New page if needed
      if (y < margin) {
        const newPage = pdfDoc.addPage([612, 792]);
        y = 792 - margin;
        // Continue drawing on newPage...
      }
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
  }

  // Serialize to base64
  const pdfBytes = await pdfDoc.saveAsBase64();
  const fileName = `${sanitize(title)}.pdf`;
  const uri = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(uri, pdfBytes, { encoding: EncodingType.Base64 });

  return uri;
}
```

### Approach 3: react-native-html-to-pdf (EAS Build Required)

Requires native modules. Use with EAS Build or bare workflow.

```bash
npx expo install react-native-html-to-pdf
```

```typescript
import RNHTMLtoPDF from 'react-native-html-to-pdf';

async function generatePDFNative(html: string, fileName: string): Promise<string> {
  const result = await RNHTMLtoPDF.convert({
    html,
    fileName,
    directory: 'Documents',
    width: 612,
    height: 792,
    padding: 24,
  });

  return result.filePath!;
}
```

### Markdown to PDF

```bash
npx expo install react-native-md-to-pdf
```

```typescript
import { convertMdToPdf } from 'react-native-md-to-pdf';

async function markdownToPDF(markdown: string): Promise<string> {
  const result = await convertMdToPdf({
    markdown,
    // Optional: custom CSS for styling
    css: `
      body { font-family: -apple-system, sans-serif; padding: 40px; }
      h1 { color: #1a1a1a; }
      code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
      pre { background: #1a1a2e; color: #e0e0e0; padding: 16px; border-radius: 8px; }
    `,
  });

  return result.uri;
}
```

---

## Creating Word Documents (.docx)

### Using the `docx` Library (Pure JS, Works Everywhere)

The `docx` library is a pure JavaScript package that generates .docx files with a declarative API. It works in Expo Go, EAS Build, and bare React Native.

```bash
npx expo install docx
```

```typescript
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  SectionType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from 'docx';
import { writeAsStringAsync, documentDirectory, EncodingType } from 'expo-file-system/legacy';
import { Buffer } from 'buffer'; // polyfill if needed

// ---- Basic Document ----
async function createBasicDocx(title: string, content: string): Promise<string> {
  const doc = new Document({
    creator: 'AGI Workforce',
    title,
    description: `Generated on ${new Date().toISOString()}`,
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 48, // half-points, so 48 = 24pt
                font: 'Calibri',
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 300 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated on ${new Date().toLocaleDateString()}`,
                italics: true,
                size: 20,
                color: '999999',
              }),
            ],
            spacing: { after: 400 },
          }),
          // Body paragraphs
          ...content.split('\n\n').map(
            (para) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: para.trim(),
                    size: 24,
                    font: 'Calibri',
                  }),
                ],
                spacing: { after: 200, line: 360 },
              }),
          ),
        ],
      },
    ],
  });

  // Pack to base64
  const buffer = await Packer.toBase64String(doc);
  const fileName = `${sanitize(title)}.docx`;
  const uri = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(uri, buffer, { encoding: EncodingType.Base64 });

  return uri;
}

// ---- Document with Tables ----
async function createDocxWithTable(
  title: string,
  headers: string[],
  rows: string[][],
): Promise<string> {
  const tableRows = [
    // Header row
    new TableRow({
      tableHeader: true,
      children: headers.map(
        (h) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true, size: 22, font: 'Calibri' })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            shading: { fill: 'E8E8E8' },
          }),
      ),
    }),
    // Data rows
    ...rows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: cell, size: 22, font: 'Calibri' })],
                  }),
                ],
              }),
          ),
        }),
    ),
  ];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 300 },
          }),
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBase64String(doc);
  const fileName = `${sanitize(title)}.docx`;
  const uri = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(uri, buffer, { encoding: EncodingType.Base64 });

  return uri;
}

// ---- Document with Headers/Footers ----
async function createDocxWithHeaderFooter(title: string, body: string): Promise<string> {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            pageNumbers: { start: 1 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'AGI Workforce', italics: true, size: 18, color: '888888' }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                  new TextRun({ text: ' of ', size: 18 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          ...body
            .split('\n\n')
            .map((p) => new Paragraph({ children: [new TextRun({ text: p.trim(), size: 24 })] })),
        ],
      },
    ],
  });

  const buffer = await Packer.toBase64String(doc);
  const uri = `${documentDirectory}${sanitize(title)}.docx`;
  await writeAsStringAsync(uri, buffer, { encoding: EncodingType.Base64 });
  return uri;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 64);
}
```

### Using docxtemplater (Template-Based)

Best for filling in templated documents (contracts, invoices, letters).

```bash
npx expo install docxtemplater pizzip
```

```typescript
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  readAsStringAsync,
  writeAsStringAsync,
  documentDirectory,
  EncodingType,
} from 'expo-file-system/legacy';

async function fillTemplate(
  templateUri: string,
  data: Record<string, string | number>,
): Promise<string> {
  // Read template as base64
  const base64 = await readAsStringAsync(templateUri, {
    encoding: EncodingType.Base64,
  });

  // Parse template
  const zip = new PizZip(base64, { base64: true });
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Fill placeholders: {first_name}, {company}, etc.
  doc.render(data);

  // Generate output
  const output = doc.getZip().generate({ type: 'base64' });
  const outputUri = `${documentDirectory}filled_${Date.now()}.docx`;
  await writeAsStringAsync(outputUri, output, { encoding: EncodingType.Base64 });

  return outputUri;
}

// Usage:
// const uri = await fillTemplate(templateUri, {
//   first_name: 'Jane',
//   last_name: 'Doe',
//   company: 'Acme Corp',
//   date: '2026-03-18',
//   amount: '$5,000',
// });
```

---

## Importing Files

### expo-document-picker

Already implemented in `components/chat/AttachmentButton.tsx`. Here is the full pattern with extended MIME types.

```typescript
import * as DocumentPicker from 'expo-document-picker';
import { copyAsync, documentDirectory, getInfoAsync } from 'expo-file-system/legacy';

interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

// ---- Pick any document ----
async function pickDocument(allowedTypes?: string[]): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: allowedTypes ?? ['*/*'],
    copyToCacheDirectory: true, // IMPORTANT: ensures expo-file-system can read it
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.size ?? 0,
  };
}

// ---- Pick multiple documents ----
async function pickMultipleDocuments(): Promise<PickedDocument[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['*/*'],
    copyToCacheDirectory: true,
    multiple: true,
  });

  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.size ?? 0,
  }));
}

// ---- Pick with specific types ----
const DOCUMENT_TYPES = {
  pdf: ['application/pdf'],
  word: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  excel: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  text: ['text/plain', 'text/csv', 'text/markdown'],
  images: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  all: ['*/*'],
} as const;

async function pickPDF(): Promise<PickedDocument | null> {
  return pickDocument(DOCUMENT_TYPES.pdf);
}

async function pickWordDoc(): Promise<PickedDocument | null> {
  return pickDocument(DOCUMENT_TYPES.word);
}

// ---- Copy imported file to app storage ----
async function importToAppStorage(picked: PickedDocument): Promise<string> {
  const destDir = `${documentDirectory}imports/`;
  const destUri = `${destDir}${picked.name}`;

  // Ensure directory exists
  const dirInfo = await getInfoAsync(destDir);
  if (!dirInfo.exists) {
    const { makeDirectoryAsync } = await import('expo-file-system/legacy');
    await makeDirectoryAsync(destDir, { intermediates: true });
  }

  await copyAsync({ from: picked.uri, to: destUri });
  return destUri;
}
```

---

## Viewing Documents

### PDF Viewer (react-native-pdf)

Requires EAS Build (native module). The main PDF viewer for React Native.

```bash
npx expo install react-native-pdf react-native-blob-util
```

```typescript
import React, { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import Pdf from 'react-native-pdf';

interface PDFViewerProps {
  source: { uri: string } | { base64: string };
  onError?: (error: Error) => void;
}

export function PDFViewer({ source, onError }: PDFViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.container}>
      <Pdf
        source={source}
        style={styles.pdf}
        trustAllCerts={false}
        onLoadComplete={(numberOfPages) => {
          setTotalPages(numberOfPages);
          setLoading(false);
        }}
        onPageChanged={(page) => setCurrentPage(page)}
        onError={(error) => {
          setLoading(false);
          onError?.(error as Error);
        }}
        enablePaging={true}
        horizontal={false}
        fitPolicy={0} // fit width
        spacing={8}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#21808d" />
        </View>
      )}

      {totalPages > 0 && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            {currentPage} / {totalPages}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pageText: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
```

### WebView-Based Viewer (No Native Modules)

Works in Expo Go. Uses Google Docs viewer for remote URLs or inline HTML for local content.

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface WebDocViewerProps {
  /** Remote URL to a PDF, DOCX, XLSX, or PPTX */
  url: string;
}

export function WebDocViewer({ url }: WebDocViewerProps) {
  // Google Docs viewer can render PDF, DOCX, XLSX, PPTX from remote URLs
  const viewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: viewerUrl }}
        style={styles.webview}
        startInLoadingState
        javaScriptEnabled
      />
    </View>
  );
}

// For local files, use inline HTML:
interface LocalPDFViewerProps {
  /** Local file URI */
  uri: string;
}

export function LocalPDFViewer({ uri }: LocalPDFViewerProps) {
  // On iOS, WebView can render local PDFs directly
  // On Android, you may need to serve via a local HTTP server or use base64
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri }}
        style={styles.webview}
        originWhitelist={['*']}
        startInLoadingState
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
```

### react-native-pdf-renderer (Lightweight, New Architecture)

Zero dependencies, pure native renderer. Supports Fabric (New Architecture).

```bash
npx expo install react-native-pdf-renderer
```

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import PdfRenderer from 'react-native-pdf-renderer';

interface LightPDFViewerProps {
  source: string; // file URI or remote URL
}

export function LightPDFViewer({ source }: LightPDFViewerProps) {
  return (
    <View style={styles.container}>
      <PdfRenderer
        source={source}
        style={styles.pdf}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1 },
});
```

---

## Sharing Files

### expo-sharing

Already implemented in `services/fileCreation.ts`. Extended patterns below.

```typescript
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// MIME type mapping
const MIME_TYPES: Record<string, { uti: string; mimeType: string }> = {
  '.pdf': { uti: 'com.adobe.pdf', mimeType: 'application/pdf' },
  '.docx': {
    uti: 'org.openxmlformats.wordprocessingml.document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  '.doc': { uti: 'com.microsoft.word.doc', mimeType: 'application/msword' },
  '.xlsx': {
    uti: 'org.openxmlformats.spreadsheetml.sheet',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  '.txt': { uti: 'public.plain-text', mimeType: 'text/plain' },
  '.csv': { uti: 'public.comma-separated-values-text', mimeType: 'text/csv' },
  '.png': { uti: 'public.png', mimeType: 'image/png' },
  '.jpg': { uti: 'public.jpeg', mimeType: 'image/jpeg' },
  '.json': { uti: 'public.json', mimeType: 'application/json' },
};

function getExtension(uri: string): string {
  const match = uri.match(/\.\w+$/);
  return match ? match[0].toLowerCase() : '';
}

export async function shareFile(uri: string, dialogTitle?: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }

  const ext = getExtension(uri);
  const typeInfo = MIME_TYPES[ext];

  await Sharing.shareAsync(uri, {
    UTI: typeInfo?.uti ?? 'public.data',
    mimeType: typeInfo?.mimeType ?? 'application/octet-stream',
    dialogTitle: dialogTitle ?? 'Share file',
  });
}

// ---- Share multiple files (uses react-native-share) ----
// expo-sharing only supports single files. For multi-file sharing:
// npx expo install react-native-share

import Share from 'react-native-share';

async function shareMultipleFiles(uris: string[], message?: string): Promise<void> {
  await Share.open({
    urls: uris,
    message: message ?? '',
    failOnCancel: false,
  });
}
```

### Receiving Shared Files (expo-share-intent)

To receive files shared TO your app from other apps:

```bash
npx expo install expo-share-intent
```

```typescript
// In app/_layout.tsx or root layout
import { useShareIntent } from 'expo-share-intent';

export default function RootLayout() {
  const { shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (shareIntent) {
      // shareIntent.type: 'text' | 'media' | 'file' | 'weburl'
      if (shareIntent.type === 'file' && shareIntent.files) {
        for (const file of shareIntent.files) {
          console.log('Received file:', file.path, file.mimeType);
          // Import file into app storage...
        }
      }
      resetShareIntent();
    }
  }, [shareIntent]);

  return <Slot />;
}
```

---

## Saving to Device Storage

### Android: Storage Access Framework (SAF)

On Android 10+, apps cannot write directly to the Downloads folder. You must use SAF to request a directory permission from the user.

```typescript
import {
  StorageAccessFramework,
  documentDirectory,
  readAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SAF_DIR_KEY = 'saf_downloads_uri';

// ---- Request permission once, cache for future use ----
async function getDownloadsPermission(): Promise<string | null> {
  // Check cached permission
  const cached = await AsyncStorage.getItem(SAF_DIR_KEY);
  if (cached) return cached;

  // Request from user
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return null;

  // Cache for future saves
  await AsyncStorage.setItem(SAF_DIR_KEY, permissions.directoryUri);
  return permissions.directoryUri;
}

// ---- Save file to user-chosen directory ----
async function saveToDeviceStorage(
  sourceUri: string,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  if (Platform.OS !== 'android') {
    // On iOS, use Sharing which shows "Save to Files" option
    const Sharing = await import('expo-sharing');
    await Sharing.shareAsync(sourceUri, { mimeType });
    return sourceUri;
  }

  const dirUri = await getDownloadsPermission();
  if (!dirUri) return null;

  // Create file in the SAF directory
  const fileUri = await StorageAccessFramework.createFileAsync(dirUri, fileName, mimeType);

  // Read source content and write to SAF file
  const content = await readAsStringAsync(sourceUri, {
    encoding: EncodingType.Base64,
  });

  await StorageAccessFramework.writeAsStringAsync(fileUri, content, {
    encoding: EncodingType.Base64,
  });

  return fileUri;
}

// ---- Usage ----
// await saveToDeviceStorage(pdfUri, 'report.pdf', 'application/pdf');
// await saveToDeviceStorage(docxUri, 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
```

### iOS: Save to Files App

On iOS, the standard pattern is to use `Sharing.shareAsync()` which shows the system share sheet. Users can select "Save to Files" from the share sheet to save to iCloud Drive, On My iPhone, or other providers.

```typescript
import * as Sharing from 'expo-sharing';

async function saveToFilesApp(uri: string, mimeType: string): Promise<void> {
  await Sharing.shareAsync(uri, {
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.data',
    mimeType,
  });
}
```

---

## Cloud Sync

### react-native-cloud-storage (iCloud + Google Drive)

Unified API for iCloud (iOS) and Google Drive (all platforms).

```bash
npx expo install react-native-cloud-storage
```

```typescript
import CloudStorage, { CloudStorageScope, CloudStorageProvider } from 'react-native-cloud-storage';
import { Platform } from 'react-native';

// ---- Check availability ----
async function isCloudAvailable(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return CloudStorage.isCloudAvailable();
  }
  // For Google Drive, you need to set an access token first
  return false; // must authenticate first
}

// ---- Write file to cloud ----
async function uploadToCloud(
  cloudPath: string,
  content: string,
  scope: CloudStorageScope = CloudStorageScope.Documents,
): Promise<void> {
  await CloudStorage.writeFile(cloudPath, content, scope);
}

// ---- Read file from cloud ----
async function downloadFromCloud(
  cloudPath: string,
  scope: CloudStorageScope = CloudStorageScope.Documents,
): Promise<string> {
  return CloudStorage.readFile(cloudPath, scope);
}

// ---- List files ----
async function listCloudFiles(
  directoryPath: string,
  scope: CloudStorageScope = CloudStorageScope.Documents,
): Promise<string[]> {
  return CloudStorage.listFiles(directoryPath, scope);
}

// ---- Check if file exists ----
async function cloudFileExists(
  path: string,
  scope: CloudStorageScope = CloudStorageScope.Documents,
): Promise<boolean> {
  return CloudStorage.exists(path, scope);
}

// ---- Delete from cloud ----
async function deleteFromCloud(
  path: string,
  scope: CloudStorageScope = CloudStorageScope.Documents,
): Promise<void> {
  await CloudStorage.unlink(path, scope);
}

// ---- Google Drive setup ----
// Google Drive requires OAuth. Use @react-native-google-signin/google-signin
// to get an access token, then:
//
// import { GoogleSignin } from '@react-native-google-signin/google-signin';
//
// async function setupGoogleDrive() {
//   await GoogleSignin.configure({
//     scopes: ['https://www.googleapis.com/auth/drive.file'],
//   });
//   const { idToken } = await GoogleSignin.signIn();
//   const tokens = await GoogleSignin.getTokens();
//   CloudStorage.setGoogleDriveAccessToken(tokens.accessToken);
// }
```

### Manual Cloud Sync via REST APIs

For more control, use direct REST API calls to cloud storage providers.

```typescript
import {
  readAsStringAsync,
  writeAsStringAsync,
  documentDirectory,
  EncodingType,
} from 'expo-file-system/legacy';

// ---- Supabase Storage (already integrated in this project) ----
import { supabase } from '@/services/supabase';

async function uploadToSupabaseStorage(
  bucket: string,
  filePath: string,
  localUri: string,
): Promise<string> {
  const base64 = await readAsStringAsync(localUri, {
    encoding: EncodingType.Base64,
  });

  // Decode base64 to ArrayBuffer
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { data, error } = await supabase.storage.from(bucket).upload(filePath, bytes.buffer, {
    contentType: 'application/octet-stream',
    upsert: true,
  });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return urlData.publicUrl;
}

async function downloadFromSupabaseStorage(
  bucket: string,
  filePath: string,
  localFileName: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);

  if (error) throw error;

  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const localUri = `${documentDirectory}${localFileName}`;
  await writeAsStringAsync(localUri, base64, {
    encoding: EncodingType.Base64,
  });

  return localUri;
}
```

---

## Library Reference

### Tier 1: Works in Expo Go (Pure JS, Zero Native Modules)

| Library                | Version | Purpose                            | Install                                 |
| ---------------------- | ------- | ---------------------------------- | --------------------------------------- |
| `expo-file-system`     | SDK 54+ | File read/write/download           | Built into Expo                         |
| `expo-print`           | SDK 54+ | HTML to PDF conversion             | Built into Expo                         |
| `expo-sharing`         | SDK 54+ | Native share sheet                 | Built into Expo                         |
| `expo-document-picker` | SDK 54+ | System file picker                 | Built into Expo                         |
| `docx`                 | 9.6.x   | Generate .docx programmatically    | `npx expo install docx`                 |
| `pdf-lib`              | 1.17.x  | Generate/edit PDF programmatically | `npx expo install pdf-lib`              |
| `docxtemplater`        | 3.68.x  | Template-based .docx generation    | `npx expo install docxtemplater pizzip` |

### Tier 2: Requires EAS Build (Native Modules)

| Library                      | Version | Purpose                                        | Install                                       |
| ---------------------------- | ------- | ---------------------------------------------- | --------------------------------------------- |
| `react-native-pdf`           | 6.x     | PDF viewer component                           | `npx expo install react-native-pdf`           |
| `react-native-blob-util`     | 0.22.x  | Large file transfers, background download      | `npx expo install react-native-blob-util`     |
| `react-native-html-to-pdf`   | 0.12.x  | Native HTML to PDF (alternative to expo-print) | `npx expo install react-native-html-to-pdf`   |
| `react-native-cloud-storage` | 2.x     | iCloud + Google Drive                          | `npx expo install react-native-cloud-storage` |
| `react-native-pdf-renderer`  | 2.x     | Lightweight PDF renderer (Fabric support)      | `npx expo install react-native-pdf-renderer`  |
| `react-native-share`         | 11.x    | Multi-file sharing, social targets             | `npx expo install react-native-share`         |
| `react-native-md-to-pdf`     | 1.x     | Markdown to PDF                                | `npx expo install react-native-md-to-pdf`     |
| `expo-share-intent`          | 3.x     | Receive shared files from other apps           | `npx expo install expo-share-intent`          |

### Tier 3: Commercial / Enterprise

| Library             | Purpose                             | License    |
| ------------------- | ----------------------------------- | ---------- |
| Nutrient (PSPDFKit) | Full PDF editor, annotations, forms | Commercial |
| ComPDFKit           | PDF viewer/editor with annotation   | Commercial |
| Apryse (PDFTron)    | Document processing suite           | Commercial |

---

## Platform Considerations

### New Architecture (Fabric) Compatibility — 2026

React Native 0.76+ enables Fabric by default. Check library support before adopting.

| Library                     | Fabric Support | Notes                                              |
| --------------------------- | :------------: | -------------------------------------------------- |
| `expo-file-system`          |      Yes       | SDK 54 rebuilt for New Architecture                |
| `expo-print`                |      Yes       | Uses native print service                          |
| `expo-sharing`              |      Yes       | Uses native share sheet                            |
| `expo-document-picker`      |      Yes       | Uses native picker                                 |
| `react-native-pdf`          |    Partial     | Known blank view issues on iOS with Fabric enabled |
| `react-native-blob-util`    |      Yes       | v0.22+ supports New Architecture                   |
| `react-native-pdf-renderer` |      Yes       | Built for Fabric from the start                    |
| `docx`                      |      N/A       | Pure JS, no native code                            |
| `pdf-lib`                   |      N/A       | Pure JS, no native code                            |

### iOS-Specific

- `expo-print` / `printToFileAsync`: Local image URLs do not work due to WKWebView sandbox. Convert images to base64 and inline them in the HTML.
- For saving files, there is no direct "Save to Downloads" API. Use `Sharing.shareAsync()` which presents the system share sheet where users can select "Save to Files".
- iCloud Drive integration requires the iCloud capability enabled in Xcode and provisioning profile.
- `@page { margin: ... }` CSS in expo-print controls PDF margins.

### Android-Specific

- Android 10+ enforces scoped storage. Use `StorageAccessFramework` from expo-file-system to write to user-accessible directories (Downloads, Documents, etc.).
- Request SAF directory permissions once, cache the URI in AsyncStorage, and reuse.
- The `WRITE_EXTERNAL_STORAGE` permission is only meaningful on Android 9 and below.
- `expo-file-system` automatically adds `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, and `INTERNET` permissions.

### Web

- `expo-sharing` cannot share local files on web. Files must be uploaded to a URL first.
- `expo-document-picker` requires a user gesture (button press) on web. Cannot be called in `useEffect` or on mount.
- `expo-print` is not available on web. Use browser `window.print()` or a library like `jspdf`.

### File Size Limits

- `writeAsStringAsync` with base64 encoding: works well for files up to ~50 MB. For larger files, use `react-native-blob-util` which supports streaming.
- `expo-print` / `printToFileAsync`: HTML content complexity affects generation time. Very long documents (100+ pages) may need to be chunked.
- `docx` / `Packer.toBase64String`: Memory-bound. Documents with many images should use streaming packer if available.

---

## Complete Workflow Example

Putting it all together: generate a document, save it, and share it.

````typescript
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  documentDirectory,
  moveAsync,
  getInfoAsync,
  deleteAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  EncodingType,
  StorageAccessFramework,
} from 'expo-file-system/legacy';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { Platform, Alert } from 'react-native';

// ---- Service: DocumentExporter ----
export class DocumentExporter {
  private docsDir: string;

  constructor() {
    this.docsDir = `${documentDirectory}exports/`;
  }

  async init(): Promise<void> {
    const info = await getInfoAsync(this.docsDir);
    if (!info.exists) {
      await makeDirectoryAsync(this.docsDir, { intermediates: true });
    }
  }

  /** Generate PDF from markdown/text content */
  async toPDF(content: string, title: string): Promise<string> {
    await this.init();
    const html = this.buildHTML(content, title);
    const { uri: tmpUri } = await Print.printToFileAsync({ html });

    const fileName = `${this.sanitize(title)}.pdf`;
    const destUri = `${this.docsDir}${fileName}`;
    await this.safeMove(tmpUri, destUri);
    return destUri;
  }

  /** Generate DOCX from structured content */
  async toDOCX(title: string, sections: { heading: string; body: string }[]): Promise<string> {
    await this.init();

    const doc = new Document({
      creator: 'AGI Workforce',
      title,
      sections: [
        {
          children: [
            new Paragraph({
              text: title,
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 300 },
            }),
            ...sections.flatMap((s) => [
              new Paragraph({
                text: s.heading,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 100 },
              }),
              ...s.body.split('\n').map(
                (line) =>
                  new Paragraph({
                    children: [new TextRun({ text: line, size: 24 })],
                    spacing: { after: 120 },
                  }),
              ),
            ]),
          ],
        },
      ],
    });

    const base64 = await Packer.toBase64String(doc);
    const fileName = `${this.sanitize(title)}.docx`;
    const destUri = `${this.docsDir}${fileName}`;
    await writeAsStringAsync(destUri, base64, { encoding: EncodingType.Base64 });
    return destUri;
  }

  /** Share a generated file via native share sheet */
  async share(uri: string): Promise<void> {
    const available = await Sharing.isAvailableAsync();
    if (!available) throw new Error('Sharing not available');

    const ext = uri.match(/\.\w+$/)?.[0]?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
    };

    await Sharing.shareAsync(uri, {
      mimeType: mimeMap[ext] ?? 'application/octet-stream',
    });
  }

  /** Save to device-accessible storage (Downloads on Android, Files on iOS) */
  async saveToDevice(uri: string, fileName: string, mimeType: string): Promise<void> {
    if (Platform.OS === 'android') {
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        Alert.alert('Permission Denied', 'Cannot save without storage access.');
        return;
      }

      const safUri = await StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        mimeType,
      );

      const content = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
      await StorageAccessFramework.writeAsStringAsync(safUri, content, {
        encoding: EncodingType.Base64,
      });

      Alert.alert('Saved', `${fileName} saved to selected folder.`);
    } else {
      // iOS: share sheet with "Save to Files" option
      await this.share(uri);
    }
  }

  // -- Private helpers --

  private sanitize(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .slice(0, 64)
        .replace(/_+$/, '') || 'export'
    );
  }

  private async safeMove(from: string, to: string): Promise<void> {
    const existing = await getInfoAsync(to);
    if (existing.exists) {
      await deleteAsync(to, { idempotent: true });
    }
    await moveAsync({ from, to });
  }

  private buildHTML(content: string, title: string): string {
    const timestamp = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Basic markdown conversion
    let body = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/```\w*\n?([\s\S]*?)```/g, '<pre>$1</pre>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 32px 24px; max-width: 680px; margin: 0 auto; color: #1a1a1a; line-height: 1.6; }
        h1 { border-bottom: 2px solid #21808d; padding-bottom: 8px; }
        pre { background: #1a1a2e; color: #e0e0e0; padding: 12px; border-radius: 8px; font-size: 13px; overflow-x: auto; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
        .footer { margin-top: 32px; border-top: 1px solid #e0e0e0; padding-top: 12px; font-size: 11px; color: #999; text-align: center; }
      </style></head><body>
      <h1>${title.replace(/[<>&]/g, '')}</h1>
      <div class="meta">Exported on ${timestamp}</div>
      ${body}
      <div class="footer">Exported from AGI Workforce</div>
    </body></html>`;
  }
}

// ---- Usage ----
// const exporter = new DocumentExporter();
// const pdfUri = await exporter.toPDF(chatContent, 'Meeting Notes');
// await exporter.share(pdfUri);
//
// const docxUri = await exporter.toDOCX('Project Report', [
//   { heading: 'Summary', body: 'The project is on track...' },
//   { heading: 'Next Steps', body: '1. Deploy staging\n2. Run QA\n3. Release' },
// ]);
// await exporter.saveToDevice(docxUri, 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
````

---

## Sources

- [Expo FileSystem Documentation](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Expo FileSystem SDK 54 Blog Post](https://expo.dev/blog/expo-file-system)
- [Expo Print Documentation](https://docs.expo.dev/versions/latest/sdk/print/)
- [Expo Sharing Documentation](https://docs.expo.dev/versions/latest/sdk/sharing/)
- [Expo Document Picker Documentation](https://docs.expo.dev/versions/latest/sdk/document-picker/)
- [docx - Generate .docx with JavaScript](https://docx.js.org/)
- [docx on GitHub](https://github.com/dolanmiu/docx)
- [docxtemplater](https://docxtemplater.com/)
- [react-native-pdf on GitHub](https://github.com/wonday/react-native-pdf)
- [react-native-pdf-renderer on GitHub](https://github.com/douglasjunior/react-native-pdf-renderer)
- [react-native-blob-util on GitHub](https://github.com/RonRadtke/react-native-blob-util)
- [react-native-cloud-storage](https://react-native-cloud-storage.oss.kuatsu.de/)
- [react-native-share on GitHub](https://github.com/react-native-share/react-native-share)
- [expo-share-intent on GitHub](https://github.com/achorein/expo-share-intent)
- [pdf-lib on GitHub](https://github.com/Hopding/pdf-lib)
- [How to Generate PDFs in React Native Using HTML and CSS](https://apitemplate.io/blog/how-to-generate-pdfs-in-react-native-using-html-and-css/)
- [How to Use Expo-Print: Complete Guide (Jan 2026)](https://anytechie.medium.com/how-to-use-expo-print-complete-guide-to-printing-in-react-native-apps-173fa435dadf)
- [Creating and Sharing PDF in React Native Using Expo](https://medium.com/@josematheusnoveli/creating-and-sharing-pdf-in-react-native-using-expo-c6d3c3cb047f)
- [How to Save Files to Device Folder Using Expo](https://www.farhansayshi.com/post/how-to-save-files-to-a-device-folder-using-expo-and-react-native/)
- [Saving Files to Device Storage on Android (SAF)](https://medium.com/@fabi.mofar/downloading-and-saving-files-in-react-native-expo-5b3499adda84)
