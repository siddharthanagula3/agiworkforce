import { createIcon } from '../createIcon';
import { DOC_BODY, DOC_FOLD, TRAY } from './shapes';

export const File = createIcon(
  'File',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
  </>,
);

export const FileText = createIcon(
  'FileText',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="M8.5 12h7M8.5 16h7" />
  </>,
);

export const FileCode = createIcon(
  'FileCode',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="m11 12-2.5 2.5L11 17" />
    <path d="m13 12 2.5 2.5L13 17" />
  </>,
);

export const FileSpreadsheet = createIcon(
  'FileSpreadsheet',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="M8.5 12h7v5h-7z" />
    <path d="M12 12v5M8.5 14.5h7" />
  </>,
);

export const Lock = createIcon(
  'Lock',
  <>
    <path d="M8 10V7l2-2h4l2 2v3" />
    <path d="M5.5 10h13L20 11.5v8L18.5 21h-13L4 19.5v-8z" />
  </>,
);

export const Download = createIcon(
  'Download',
  <>
    <path d={TRAY} />
    <path d="M12 3v13" />
    <path d="m6.5 10.5 5.5 5.5 5.5-5.5" />
  </>,
);
