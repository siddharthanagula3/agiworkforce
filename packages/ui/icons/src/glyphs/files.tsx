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

export const FilePlus2 = createIcon(
  'FilePlus2',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="M12 12v6M9 15h6" />
  </>,
);

export const FileTerminal = createIcon(
  'FileTerminal',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="m8 13 2.5 2.5L8 18" />
    <path d="M12.5 18h4" />
  </>,
);

export const FileImage = createIcon(
  'FileImage',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="m7 19 4-4 3 3 4-4" />
  </>,
);

export const FileArchive = createIcon(
  'FileArchive',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="M10 5.5h2M10 9.5h2" />
    <path d="M9.5 13.5h3v5h-3z" />
  </>,
);

export const FileJson = createIcon(
  'FileJson',
  <>
    <path d={DOC_BODY} />
    <path d={DOC_FOLD} />
    <path d="M10 13H8v6h2" />
    <path d="M14 13h2v6h-2" />
  </>,
);

export const FilePen = createIcon(
  'FilePen',
  <>
    <path d="M13.5 3H6.5L5 4.5v15L6.5 21h4" />
    <path d={DOC_FOLD} />
    <path d="M18.5 11 21 13.5 15 19.5l-3 .5.5-3z" />
  </>,
);
