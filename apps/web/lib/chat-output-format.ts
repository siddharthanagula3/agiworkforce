import { MANAGED_OFFICE_FILE_TOOL_NAME } from '@agiworkforce/cloud-contracts';

export const CHAT_OUTPUT_FORMATS = ['docx', 'pptx', 'xlsx'] as const;

export type ChatOutputFormat = (typeof CHAT_OUTPUT_FORMATS)[number];

export const CHAT_OUTPUT_FORMAT_LABEL: Readonly<Record<ChatOutputFormat, string>> = {
  docx: 'Document',
  pptx: 'Presentation',
  xlsx: 'Spreadsheet',
};

const CHAT_OUTPUT_FORMAT_NOUN: Readonly<Record<ChatOutputFormat, string>> = {
  docx: 'a Word document',
  pptx: 'a PowerPoint presentation',
  xlsx: 'an Excel spreadsheet',
};

export function isChatOutputFormat(value: unknown): value is ChatOutputFormat {
  return typeof value === 'string' && (CHAT_OUTPUT_FORMATS as readonly string[]).includes(value);
}

export function chatOutputFormatInstruction(format: ChatOutputFormat): string {
  return (
    `The reader chose ${CHAT_OUTPUT_FORMAT_NOUN[format]} as the output of this message. ` +
    `Create it with ${MANAGED_OFFICE_FILE_TOOL_NAME} using format ${format}, put the complete ` +
    'answer in the file, and reply in one or two sentences that name it.'
  );
}
