import 'server-only';

import { modelDisplayNameById } from '@agiworkforce/types';
import type { ManagedCloudScheduleRunApprovalToolCall } from '@agiworkforce/cloud-contracts';

import { SLACK_LINK_TTL_SECONDS } from './slack-config';

const SECTION_TEXT_LIMIT = 2_900;
const SECTIONS_PER_MESSAGE = 4;
const FALLBACK_PREVIEW_CHARS = 280;
const APPROVAL_SUMMARY_LIMIT = 5;
const FENCE = '```';
const LINK_URL_RE = /^(?:https?:\/\/|mailto:)[^\s<>|]+$/i;

export interface SlackOutgoingMessage {
  text: string;
  blocks: unknown[];
}

export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdown(text: string): string {
  const held: string[] = [];
  const hold = (value: string) => `\ue000${held.push(value) - 1}\ue000`;

  const withCode = text.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    hold(`\`${escapeMrkdwn(code)}\``),
  );
  const withLinks = withCode.replace(
    /!?\[([^\]\n]*)\]\(([^)\s]+)\)/g,
    (match, label: string, url: string) =>
      LINK_URL_RE.test(url)
        ? hold(`<${escapeMrkdwn(url)}|${escapeMrkdwn(label.trim() || url)}>`)
        : match,
  );
  return escapeMrkdwn(withLinks)
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '\ue001$2\ue001')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, '$1_$2_')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '~$1~')
    .replace(/\ue001/g, '*')
    .replace(/\ue000(\d+)\ue000/g, (_match, index: string) => held[Number(index)] ?? '');
}

function markdownToMrkdwn(markdown: string): string {
  const out: string[] = [];
  let inCode = false;
  let inTable = false;
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      if (inTable) {
        out.push(FENCE);
        inTable = false;
      }
      out.push(FENCE);
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(escapeMrkdwn(line));
      continue;
    }
    const tableRow = /^\s*\|.*\|\s*$/.test(line);
    if (tableRow !== inTable) {
      out.push(FENCE);
      inTable = tableRow;
    }
    if (tableRow) {
      out.push(escapeMrkdwn(line.trim()));
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1]) {
      out.push(`*${inlineMarkdown(heading[1]).replace(/\*/g, '')}*`);
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('');
      continue;
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push(`${' '.repeat(bullet[1]?.length ?? 0)}• ${inlineMarkdown(bullet[2] ?? '')}`);
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      out.push(`> ${inlineMarkdown(quote[1] ?? '')}`);
      continue;
    }
    out.push(inlineMarkdown(line));
  }
  if (inCode || inTable) out.push(FENCE);
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkMrkdwn(text: string, limit: number): string[] {
  const budget = limit - FENCE.length - 1;
  const chunks: string[] = [];
  let lines: string[] = [];
  let length = 0;
  let open = false;
  const flush = () => {
    chunks.push((open ? [...lines, FENCE] : lines).join('\n'));
    lines = open ? [FENCE] : [];
    length = open ? FENCE.length : 0;
  };
  const piecePattern = new RegExp(`[\\s\\S]{1,${budget - FENCE.length - 1}}`, 'g');
  for (const raw of text.split('\n')) {
    for (const line of raw.length > 0 ? (raw.match(piecePattern) ?? []) : ['']) {
      if (lines.length > 0 && length + 1 + line.length > budget) flush();
      length += (lines.length > 0 ? 1 : 0) + line.length;
      lines.push(line);
      if (line.trim() === FENCE) open = !open;
    }
  }
  if (lines.some((line) => line.trim() !== '' && line !== FENCE)) chunks.push(lines.join('\n'));
  return chunks;
}

function plainPreview(mrkdwn: string): string {
  const flat = mrkdwn
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/[*_~`>•]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > FALLBACK_PREVIEW_CHARS
    ? `${flat.slice(0, FALLBACK_PREVIEW_CHARS - 1)}…`
    : flat;
}

function section(text: string): Record<string, unknown> {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

export function answerMessages(
  answer: string,
  footer: { requesterId: string | null; model: string; taskUrl?: string | null },
): SlackOutgoingMessage[] {
  const sections = chunkMrkdwn(markdownToMrkdwn(answer), SECTION_TEXT_LIMIT);
  const model = modelDisplayNameById(footer.model) ?? footer.model;
  const context = footer.requesterId
    ? `For <@${footer.requesterId}> · ${escapeMrkdwn(model)}`
    : escapeMrkdwn(model);
  const messages: SlackOutgoingMessage[] = [];
  for (let index = 0; index < sections.length; index += SECTIONS_PER_MESSAGE) {
    const group = sections.slice(index, index + SECTIONS_PER_MESSAGE);
    const last = index + SECTIONS_PER_MESSAGE >= sections.length;
    messages.push({
      text: plainPreview(group.join('\n')),
      blocks: [
        ...group.map(section),
        ...(last ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: context }] }] : []),
        ...(last && footer.taskUrl
          ? [linkButton('View task', footer.taskUrl, 'slack_view_task')]
          : []),
      ],
    });
  }
  return messages;
}

function linkButton(text: string, url: string, actionId: string): Record<string, unknown> {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        style: 'primary',
        action_id: actionId,
        text: { type: 'plain_text', text },
        url,
      },
    ],
  };
}

export function linkPromptMessage(url: string): SlackOutgoingMessage {
  const text =
    'Connect your AGI Workforce account to use AGI Workforce in Slack. Answers use your own ' +
    `plan, settings and approvals. The link works once and expires in ${Math.round(
      SLACK_LINK_TTL_SECONDS / 60,
    )} minutes.`;
  return {
    text,
    blocks: [section(text), linkButton('Connect account', url, 'slack_link_account')],
  };
}

export function linkedMessage(settingsUrl: string): SlackOutgoingMessage {
  const text =
    'Your Slack account is now connected to AGI Workforce. Send me a message here, or mention ' +
    'me in a channel I have been added to, and I will answer in the thread.';
  return {
    text,
    blocks: [
      section(text),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Manage or disconnect it in <${escapeMrkdwn(settingsUrl)}|Settings → Slack>.`,
          },
        ],
      },
    ],
  };
}

export function approvalMessage(
  toolCalls: readonly ManagedCloudScheduleRunApprovalToolCall[],
  settingsUrl: string,
  subject: 'answer' | 'task',
): SlackOutgoingMessage {
  const shown = toolCalls.slice(0, APPROVAL_SUMMARY_LIMIT);
  const lines = shown.map((call) => `• ${escapeMrkdwn(call.summary || call.name)}`);
  if (toolCalls.length > shown.length) lines.push(`• and ${toolCalls.length - shown.length} more`);
  const text =
    `This ${subject} needs your approval before it can continue. Review it in AGI Workforce on ` +
    'the web or desktop app; nothing runs until you decide.';
  return {
    text,
    blocks: [
      section(text),
      section(lines.join('\n')),
      linkButton('Review in AGI Workforce', settingsUrl, 'slack_review_approval'),
    ],
  };
}

export function noticeMessage(
  text: string,
  link?: { label: string; url: string },
): SlackOutgoingMessage {
  const escaped = escapeMrkdwn(text);
  return {
    text: escaped,
    blocks: [
      section(escaped),
      ...(link ? [linkButton(link.label, link.url, 'slack_open_link')] : []),
    ],
  };
}
