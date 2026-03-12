/**
 * Pure utility functions for tool name normalization and inline tool data transformation.
 *
 * Extracted from UnifiedAgenticChat/index.tsx to keep the main component focused on
 * orchestration logic.
 */
import type { Artifact } from '../types/chat';
import { getToolDisplayInfo } from './toolDisplayNames';
import { decodeCompositeToolName } from './toolNameEncoding';

export const normalizeToolNameForUi = (toolName: string): string => {
  let name = toolName;
  if (name.startsWith('__server__')) {
    name = name.slice('__server__'.length) || name;
  }

  return decodeCompositeToolName(name);
};

export const toolNameToArtifactType = (toolName: string): Artifact['type'] => {
  const normalized = normalizeToolNameForUi(toolName).toLowerCase();
  if (normalized.includes('image') || normalized.includes('video')) return 'image';
  if (normalized.includes('document') || normalized.includes('pdf') || normalized.includes('word'))
    return 'document';
  if (normalized.includes('excel') || normalized.includes('sheet') || normalized.includes('table'))
    return 'spreadsheet';
  return 'code';
};

export const toolNameToTitle = (toolName: string): string => {
  const normalizedToolName = normalizeToolNameForUi(toolName);
  const displayInfo = getToolDisplayInfo(normalizedToolName);
  if (displayInfo.displayName !== 'Working') {
    return displayInfo.displayName;
  }
  return normalizedToolName.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

export const extractMcpTextBlocks = (data: Record<string, unknown>): string[] => {
  const content = data['content'];
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((block) => {
    if (!block || typeof block !== 'object') {
      return [];
    }
    const typedBlock = block as Record<string, unknown>;
    const blockType = String(typedBlock['type'] ?? '').toLowerCase();
    const text = typedBlock['text'];
    if (blockType !== 'text' || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }
    return [text];
  });
};

export const normalizeMcpFilesystemInlineData = (
  normalizedTool: string,
  data: Record<string, unknown>,
): void => {
  if (!normalizedTool.startsWith('mcp__filesystem__')) {
    return;
  }

  const textBlocks = extractMcpTextBlocks(data);
  if (textBlocks.length === 0) {
    return;
  }

  if (normalizedTool.endsWith('read_text_file') && typeof data['content'] !== 'string') {
    data['content'] = textBlocks.join('\n');
    data['source'] = (data['source'] as string | undefined) ?? 'mcp_filesystem_read_text_file';
    return;
  }

  if (normalizedTool.endsWith('list_allowed_directories')) {
    const directories = new Set<string>();
    textBlocks.forEach((text) => {
      text.split('\n').forEach((rawLine) => {
        let line = rawLine.trim();
        if (!line) {
          return;
        }
        if (line.startsWith('- ')) {
          line = line.slice(2).trim();
        } else if (line.startsWith('* ')) {
          line = line.slice(2).trim();
        } else if (line.startsWith('[DIR]')) {
          line = line.slice('[DIR]'.length).trim();
        }
        if (
          line.startsWith('/') ||
          line.startsWith('~/') ||
          line.startsWith('./') ||
          line.startsWith('../') ||
          line.includes(':\\')
        ) {
          directories.add(line);
        }
      });
    });
    if (directories.size > 0) {
      const values = Array.from(directories).sort();
      data['directories'] = values;
      data['count'] = values.length;
      data['source'] =
        (data['source'] as string | undefined) ?? 'mcp_filesystem_list_allowed_directories';
    }
    return;
  }

  if (
    (normalizedTool.endsWith('list_directory') ||
      normalizedTool.endsWith('list_directory_with_sizes')) &&
    !Array.isArray(data['entries'])
  ) {
    const pathHint = typeof data['path'] === 'string' ? data['path'] : '';
    const parsedEntries: Array<Record<string, unknown>> = [];

    textBlocks.forEach((text) => {
      text.split('\n').forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
          return;
        }

        let type: 'file' | 'directory' | 'symlink' | null = null;
        let name = '';
        if (line.startsWith('[DIR]')) {
          type = 'directory';
          name = line.slice('[DIR]'.length).trim();
        } else if (line.startsWith('[FILE]')) {
          type = 'file';
          name = line.slice('[FILE]'.length).trim();
        } else if (line.startsWith('[SYMLINK]')) {
          type = 'symlink';
          name = line.slice('[SYMLINK]'.length).trim();
        }
        if (!type || !name) {
          return;
        }

        if (type === 'file') {
          const sizeMatch = name.match(/\s+\([^)]*\)$/);
          if (sizeMatch) {
            name = name.slice(0, -sizeMatch[0].length).trim();
          }
        }
        if (!name) {
          return;
        }

        const fullPath = pathHint ? `${pathHint.replace(/[\\/]$/, '')}/${name}` : name;
        parsedEntries.push({
          name,
          type,
          path: fullPath,
          size: 0,
        });
      });
    });

    if (parsedEntries.length > 0) {
      parsedEntries.sort((a, b) =>
        String(a['name']).toLowerCase().localeCompare(String(b['name']).toLowerCase()),
      );
      data['entries'] = parsedEntries;
      data['returned'] = parsedEntries.length;
      data['count'] = parsedEntries.length;
      data['offset'] = 0;
      data['limit'] = parsedEntries.length;
      data['has_more'] = false;
      data['next_offset'] = null;
      data['source'] = (data['source'] as string | undefined) ?? 'mcp_filesystem_list_directory';
    }
  }
};

export const buildProjectSlashCommandInstructions = (
  command: string,
  args: string,
  commandContent: string,
  commandPath?: string,
): string => {
  const MAX_COMMAND_CONTENT_CHARS = 40_000;
  const trimmedCommandContent = commandContent.trim();
  const boundedCommandContent =
    trimmedCommandContent.length > MAX_COMMAND_CONTENT_CHARS
      ? `${trimmedCommandContent.slice(0, MAX_COMMAND_CONTENT_CHARS)}\n\n[...truncated]`
      : trimmedCommandContent;
  const normalizedArgs = args.trim();

  return [
    '## Project Slash Command',
    `Command: /${command}`,
    `Source: ${commandPath ?? '(unknown file path)'}`,
    '',
    '### Command File Instructions',
    boundedCommandContent || '(command file is empty)',
    '',
    '### Invocation Arguments',
    normalizedArgs !== '' ? normalizedArgs : '(none)',
    '',
    'Follow the command file instructions for this invocation. If instructions are empty or invalid, explain why and stop.',
  ].join('\n');
};

export const normalizeInlineToolData = (
  toolName: string,
  rawData: Record<string, unknown>,
): Record<string, unknown> => {
  const normalizedTool = normalizeToolNameForUi(toolName).toLowerCase();
  const data = { ...rawData };

  if (normalizedTool.includes('image')) {
    const images = Array.isArray(data['images']) ? data['images'] : [];
    const normalizedImages = images.map((image) => {
      if (image && typeof image === 'object') {
        const img = image as Record<string, unknown>;
        return {
          ...img,
          url:
            (img['url'] as string | undefined) ??
            (img['image_url'] as string | undefined) ??
            (img['src'] as string | undefined),
          base64:
            (img['base64'] as string | undefined) ??
            (img['b64_json'] as string | undefined) ??
            (img['image_base64'] as string | undefined),
        };
      }
      return image;
    });

    // Accept single-image payload variants and normalize into images[]
    if (normalizedImages.length === 0) {
      const singleUrl =
        (data['url'] as string | undefined) ??
        (data['image_url'] as string | undefined) ??
        (data['src'] as string | undefined);
      const singleBase64 =
        (data['base64'] as string | undefined) ??
        (data['b64_json'] as string | undefined) ??
        (data['image_base64'] as string | undefined);
      if (singleUrl || singleBase64) {
        normalizedImages.push({
          url: singleUrl,
          base64: singleBase64,
        });
      }
    }

    data['images'] = normalizedImages;
    data['prompt'] =
      (data['prompt'] as string | undefined) ??
      (data['revised_prompt'] as string | undefined) ??
      (data['input_prompt'] as string | undefined);
  }

  if (normalizedTool.includes('video')) {
    const durationMs = data['duration_ms'] as number | undefined;
    data['videoUrl'] =
      (data['videoUrl'] as string | undefined) ??
      (data['video_url'] as string | undefined) ??
      (data['url'] as string | undefined) ??
      (data['output_url'] as string | undefined) ??
      (data['src'] as string | undefined);
    data['duration'] =
      (data['duration'] as number | undefined) ??
      (data['duration_secs'] as number | undefined) ??
      (data['durationSeconds'] as number | undefined) ??
      (durationMs !== undefined ? durationMs / 1000 : undefined);
    data['prompt'] =
      (data['prompt'] as string | undefined) ??
      (data['revised_prompt'] as string | undefined) ??
      (data['input_prompt'] as string | undefined);
  }

  if (normalizedTool.includes('document')) {
    data['filePath'] =
      (data['filePath'] as string | undefined) ??
      (data['file_path'] as string | undefined) ??
      (data['output_path'] as string | undefined);
    data['downloadUrl'] =
      (data['downloadUrl'] as string | undefined) ?? (data['download_url'] as string | undefined);
  }

  if (normalizedTool === 'document_read') {
    const content = data['content'];
    if (content && typeof content === 'object') {
      const typedContent = content as Record<string, unknown>;
      const extractedText = typedContent['text'];
      if (typeof extractedText === 'string') {
        data['text'] = extractedText;
      }
      const metadata = typedContent['metadata'];
      if (metadata && typeof metadata === 'object') {
        data['metadata'] = metadata;
      }
    }
  }

  if (normalizedTool === 'document_extract_text') {
    const text = (data['text'] as string | undefined) ?? (data['content'] as string | undefined);
    if (typeof text === 'string') {
      data['text'] = text;
    }
  }

  if (normalizedTool.includes('screenshot') || normalizedTool.includes('capture_screen')) {
    const rawResult = data['raw_result'];
    const screenshotBase64 =
      (data['imageBase64'] as string | undefined) ??
      (data['image_base64'] as string | undefined) ??
      (data['base64'] as string | undefined) ??
      (typeof rawResult === 'string' && !rawResult.startsWith('{') && !rawResult.startsWith('[')
        ? rawResult
        : undefined);
    const screenshotUrl =
      (data['imageUrl'] as string | undefined) ??
      (data['image_url'] as string | undefined) ??
      (typeof rawResult === 'string' && rawResult.startsWith('http') ? rawResult : undefined);

    if (screenshotBase64) {
      data['imageBase64'] = screenshotBase64;
    }
    if (screenshotUrl) {
      data['imageUrl'] = screenshotUrl;
    }
  }

  if (normalizedTool.startsWith('browser_') || normalizedTool.startsWith('ui_')) {
    // Preserve key browser/UI outputs in a consistent shape for inline renderers.
    data['toolName'] = normalizeToolNameForUi(toolName);
    const title = data['title'];
    if (typeof title === 'string' && title.trim().length > 0) {
      data['content'] = data['content'] ?? title;
    }
    const html = data['html'];
    if (typeof html === 'string' && html.trim().length > 0 && !data['content']) {
      data['content'] = html;
    }
  }

  // AUDIT-UI-023: Normalize file_read tool data to match InlineCodeDiff expectations
  // file_read returns { path, content } but InlineCodeDiff expects { filePath, before, after, operation }
  if (
    normalizedTool === 'file_read' ||
    normalizedTool.endsWith('read_text_file') ||
    normalizedTool.includes('file_read')
  ) {
    const path = (data['path'] as string | undefined) ?? (data['filePath'] as string | undefined);
    const content = (data['content'] as string | undefined) ?? (data['text'] as string | undefined);

    if (path && content !== undefined) {
      // Transform into diff/read shape that InlineCodeDiff expects
      data['filePath'] = path;
      data['operation'] = 'read';
      data['before'] = '';
      data['after'] = content;
      data['success'] = data['success'] !== false;
    }
  }

  normalizeMcpFilesystemInlineData(normalizedTool, data);

  return data;
};

/**
 * Validates slash command arguments for safety before execution.
 * Returns false if arguments are too long or contain dangerous patterns.
 */
export const validateSlashCommandArgs = (command: string, args: string): boolean => {
  const MAX_ARGS_LENGTH = 2000;
  if (args.length > MAX_ARGS_LENGTH) {
    return false;
  }

  switch (command) {
    case 'terminal':
      // Terminal commands shouldn't contain shell metacharacters in certain positions
      if (/[;|&`$(){}[\]\\]/.test(args) && /\b(rm|del|format|shutdown|poweroff)\b/i.test(args)) {
        return false; // Reject dangerous combinations
      }
      break;

    case 'browser':
      // Browser URLs should be relatively safe but check for injection
      if (args.includes('\n') || args.includes('\r')) {
        return false; // No newlines in URLs
      }
      break;

    case 'code':
      // Code arguments should not be excessively large (prevent memory issues)
      if (args.length > 5000) {
        return false;
      }
      break;

    case 'database':
      // Database queries should not be excessively long
      if (args.length > 3000) {
        return false;
      }
      break;
  }

  return true;
};
