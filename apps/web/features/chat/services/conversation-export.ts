import { presignedUrlExpiresAt } from '@agiworkforce/object-storage/presign';
import type { ChatSession, ChatMessage } from '../types';

export interface ExportContentOptions {
  includeTimestamps?: boolean;
}

export const EXPIRING_LINK_PLACEHOLDER = '[expiring link removed from export]';

/**
 * A downloaded export is a file handed to whoever ends up with it. A signed
 * storage link inside it grants the bytes to the holder until it expires,
 * without asking who they are, so it is stripped rather than shipped.
 */
function withoutExpiringLinks(value: unknown): unknown {
  if (typeof value === 'string') {
    return presignedUrlExpiresAt(value) === null ? value : EXPIRING_LINK_PLACEHOLDER;
  }
  if (Array.isArray(value)) return value.map(withoutExpiringLinks);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        withoutExpiringLinks(entry),
      ]),
    );
  }
  return value;
}

export class ChatExportService {
  exportAsMarkdown(
    session: ChatSession,
    messages: ChatMessage[],
    options: ExportContentOptions = {},
  ): string {
    const includeTimestamps = options.includeTimestamps !== false;
    let markdown = `# ${session.title}\n\n`;
    markdown += `**Created:** ${session.createdAt.toLocaleString()}\n`;
    markdown += `**Last Updated:** ${session.updatedAt.toLocaleString()}\n`;
    markdown += `**Messages:** ${messages.length}\n\n`;
    markdown += `---\n\n`;

    for (const message of messages) {
      const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}\n`;
      if (includeTimestamps) {
        markdown += `*${message.createdAt.toLocaleString()}*\n\n`;
      }
      markdown += `${message.content}\n\n`;

      const attachments = message.metadata?.attachments as
        Array<{ name: string; size: number }> | undefined;
      if (attachments && attachments.length > 0) {
        markdown += `**Attachments:**\n`;
        for (const attachment of attachments) {
          markdown += `- ${attachment.name} (${this.formatFileSize(attachment.size)})\n`;
        }
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    }

    return markdown;
  }

  exportAsJSON(session: ChatSession, messages: ChatMessage[]): string {
    const data = {
      session: {
        id: session.id,
        title: session.title,
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        messageCount: session.messageCount,
        tags: session.tags,
      },
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: new Date(msg.createdAt).toISOString(),
        attachments: withoutExpiringLinks(msg.metadata?.attachments),
        metadata: withoutExpiringLinks(msg.metadata),
      })),
      exportedAt: new Date().toISOString(),
    };

    return JSON.stringify(data, null, 2);
  }

  exportAsHTML(
    session: ChatSession,
    messages: ChatMessage[],
    options: ExportContentOptions = {},
  ): string {
    const includeTimestamps = options.includeTimestamps !== false;
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(session.title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .message {
      background: white;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 15px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .message.user {
      background: #e3f2fd;
    }
    .role {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .timestamp {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 10px;
    }
    .content {
      white-space: pre-wrap;
      line-height: 1.6;
    }
    .attachments {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${this.escapeHtml(session.title)}</h1>
    <p><strong>Created:</strong> ${session.createdAt.toLocaleString()}</p>
    <p><strong>Messages:</strong> ${messages.length}</p>
  </div>
`;

    for (const message of messages) {
      const roleClass = message.role === 'user' ? 'user' : 'assistant';
      const roleLabel = message.role === 'user' ? '👤 User' : '🤖 Assistant';

      html += `  <div class="message ${roleClass}">
    <div class="role">${roleLabel}</div>
`;
      if (includeTimestamps) {
        html += `    <div class="timestamp">${message.createdAt.toLocaleString()}</div>\n`;
      }
      html += `    <div class="content">${this.escapeHtml(message.content)}</div>
`;

      const htmlAttachments = message.metadata?.attachments as
        Array<{ name: string; size: number }> | undefined;
      if (htmlAttachments && htmlAttachments.length > 0) {
        html += `    <div class="attachments">
      <strong>Attachments:</strong>
      <ul>
`;
        for (const attachment of htmlAttachments) {
          html += `        <li>${this.escapeHtml(attachment.name)} (${this.formatFileSize(attachment.size)})</li>\n`;
        }
        html += `      </ul>
    </div>
`;
      }

      html += `  </div>\n`;
    }

    html += `  <div class="header">
    <p><small>Exported on ${new Date().toLocaleString()}</small></p>
  </div>
</body>
</html>`;

    return html;
  }

  downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
