import { createIcon } from '../createIcon';

const PIN_CAP = 'M8 3h8';
const PIN_BODY = 'M10 3v8l-3.5 4h11L14 11V3';
const PIN_NEEDLE = 'M12 15v6';
const ARCHIVE_LID = 'M4 3h16l1 1v3H3V4z';

export const Pencil = createIcon(
  'Pencil',
  <>
    <path d="M17.5 3 21 6.5 7.5 20 3 21l1-4.5z" />
    <path d="m14.5 6 3.5 3.5" />
  </>,
);

export const Trash2 = createIcon(
  'Trash2',
  <>
    <path d="M3 6h18" />
    <path d="M9 6V3h6v3" />
    <path d="M5.5 6v13.5L7 21h10l1.5-1.5V6" />
    <path d="M10 10v7M14 10v7" />
  </>,
);

export const Pin = createIcon(
  'Pin',
  <>
    <path d={PIN_CAP} />
    <path d={PIN_BODY} />
    <path d={PIN_NEEDLE} />
  </>,
);

export const PinOff = createIcon(
  'PinOff',
  <>
    <path d={PIN_CAP} />
    <path d={PIN_BODY} />
    <path d={PIN_NEEDLE} />
    <path d="m3 3 18 18" />
  </>,
);

export const Star = createIcon(
  'Star',
  <path d="M12 3.5 14.53 9.02 20.56 9.72 16.09 13.83 17.29 19.78 12 16.8 6.71 19.78 7.91 13.83 3.44 9.72 9.47 9.02z" />,
);

export const Archive = createIcon(
  'Archive',
  <>
    <path d={ARCHIVE_LID} />
    <path d="M4.5 7v12.5L6 21h12l1.5-1.5V7" />
    <path d="M10 11h4" />
  </>,
);

export const ArchiveRestore = createIcon(
  'ArchiveRestore',
  <>
    <path d={ARCHIVE_LID} />
    <path d="M4.5 7v12.5L6 21h4M14 21h4l1.5-1.5V7" />
    <path d="M12 21v-9" />
    <path d="m8.5 15.5 3.5-3.5 3.5 3.5" />
  </>,
);

export const Link2 = createIcon(
  'Link2',
  <>
    <path d="M10 17H6.5L4 14.5v-5L6.5 7H10" />
    <path d="M14 7h3.5L20 9.5v5L17.5 17H14" />
    <path d="M8 12h8" />
  </>,
);
