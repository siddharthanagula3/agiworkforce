import { logger } from './utils';

export interface LlmsTxtSection {
  title: string;
  links: Array<{ text: string; url: string }>;
}

export interface LlmsTxtResult {
  found: boolean;
  content: string | null;
  url: string;
  sections: LlmsTxtSection[];
}

const FETCH_TIMEOUT_MS = 5000;

export async function fetchLlmsTxt(origin: string): Promise<LlmsTxtResult> {
  const url = `${origin}/llms.txt`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      logger.debug(`llms.txt not found at ${url} (status ${response.status})`);
      return { found: false, content: null, url, sections: [] };
    }

    const content = await response.text();

    if (!content.trim()) {
      logger.debug(`llms.txt at ${url} is empty`);
      return { found: false, content: null, url, sections: [] };
    }

    const sections = parseLlmsTxt(content);

    logger.info(`llms.txt found at ${url} (${sections.length} section(s))`);
    return { found: true, content, url, sections };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.warn(`llms.txt fetch timed out for ${url}`);
    } else {
      logger.error(`Failed to fetch llms.txt from ${url}`, error);
    }

    return { found: false, content: null, url, sections: [] };
  }
}

export function parseLlmsTxt(content: string): LlmsTxtSection[] {
  const sections: LlmsTxtSection[] = [];
  const lines = content.split('\n');

  const sectionHeaderRe = /^##\s+(.+)$/;
  const linkRe = /^-\s+\[([^\]]+)\]\(([^)]+)\)/;

  let currentSection: LlmsTxtSection | null = null;

  for (const line of lines) {
    const headerMatch = sectionHeaderRe.exec(line);
    if (headerMatch && headerMatch[1]) {
      currentSection = { title: headerMatch[1].trim(), links: [] };
      sections.push(currentSection);
      continue;
    }

    const linkMatch = linkRe.exec(line);
    if (linkMatch && currentSection && linkMatch[1] && linkMatch[2]) {
      currentSection.links.push({
        text: linkMatch[1].trim(),
        url: linkMatch[2].trim(),
      });
    }
  }

  return sections;
}
