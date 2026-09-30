import {
  CHAT_OUTPUT_FORMATS,
  MANAGED_OFFICE_FILE_TOOL_NAME,
  type ChatOutputFormat,
} from '@agiworkforce/cloud-contracts';

export {
  CHAT_OUTPUT_FORMAT_LABEL,
  CHAT_OUTPUT_FORMATS,
  type ChatOutputFormat,
} from '@agiworkforce/cloud-contracts';

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
