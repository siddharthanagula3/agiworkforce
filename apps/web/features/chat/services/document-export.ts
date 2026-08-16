
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export interface ExportOptions {
  title: string;
  content: string;
  author?: string;
  date?: Date;
  metadata?: Record<string, string>;
}

export async function exportToPDF(options: ExportOptions): Promise<Blob> {
  const { title, content, author, date = new Date() } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  doc.setProperties({
    title,
    author: author || 'AGI',
    subject: title,
    creator: 'AGI',
  } as Parameters<typeof doc.setProperties>[0]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, yPosition);
  yPosition += 12;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(date.toLocaleDateString(), margin, yPosition);
  yPosition += 10;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);

  const lines = content.split('\n');

  for (const line of lines) {
    if (yPosition > pageHeight - margin - 10) {
      doc.addPage();
      yPosition = margin;
    }

    if (line.startsWith('# ')) {
      yPosition += 5;
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const text = line.substring(2).trim();
      const splitText = doc.splitTextToSize(text, maxWidth);
      doc.text(splitText, margin, yPosition);
      yPosition += splitText.length * 8;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
    } else if (line.startsWith('## ')) {
      yPosition += 4;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      const text = line.substring(3).trim();
      const splitText = doc.splitTextToSize(text, maxWidth);
      doc.text(splitText, margin, yPosition);
      yPosition += splitText.length * 7;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
    } else if (line.startsWith('### ')) {
      yPosition += 3;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const text = line.substring(4).trim();
      const splitText = doc.splitTextToSize(text, maxWidth);
      doc.text(splitText, margin, yPosition);
      yPosition += splitText.length * 6;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const text = '• ' + line.substring(2).trim();
      const splitText = doc.splitTextToSize(text, maxWidth - 5);
      doc.text(splitText, margin + 5, yPosition);
      yPosition += splitText.length * 5;
    } else if (line.trim() === '') {
      yPosition += 5;
    } else {
      doc.setFont('helvetica', 'normal');
      const splitText = doc.splitTextToSize(line, maxWidth);
      doc.text(splitText, margin, yPosition);
      yPosition += splitText.length * 5;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, {
      align: 'center',
    });
  }

  return doc.output('blob');
}

export async function exportToDOCX(options: ExportOptions): Promise<Blob> {
  const { title, content, author, date = new Date() } = options;

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400,
      },
    }),
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: date.toLocaleDateString(),
          size: 20,
          color: '666666',
        }),
      ],
      spacing: {
        after: 400,
      },
    }),
  );

  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('# ')) {
      children.push(
        new Paragraph({
          text: line.substring(2).trim(),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );
    } else if (line.startsWith('## ')) {
      children.push(
        new Paragraph({
          text: line.substring(3).trim(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }),
      );
    } else if (line.startsWith('### ')) {
      children.push(
        new Paragraph({
          text: line.substring(4).trim(),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        }),
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      children.push(
        new Paragraph({
          text: line.substring(2).trim(),
          bullet: {
            level: 0,
          },
          spacing: { after: 80 },
        }),
      );
    } else if (line.trim() === '') {
      children.push(
        new Paragraph({
          text: '',
          spacing: { after: 120 },
        }),
      );
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: 24, // 12pt
            }),
          ],
          spacing: { after: 120 },
        }),
      );
    }
  }

  const doc = new Document({
    creator: author || 'AGI',
    title,
    description: `Generated by AGI on ${date.toLocaleDateString()}`,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
