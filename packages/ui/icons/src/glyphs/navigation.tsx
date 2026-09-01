import { createIcon } from '../createIcon';

export const MessageSquare = createIcon(
  'MessageSquare',
  <path d="M4.5 3h15L21 4.5v10l-1.5 1.5H8l-5 5V4.5z" />,
);

export const TerminalSquare = createIcon(
  'TerminalSquare',
  <>
    <path d="M4.5 3h15L21 4.5v15L19.5 21h-15L3 19.5V4.5z" />
    <path d="m7 9 3 3-3 3" />
    <path d="M13 15h4" />
  </>,
);

export const Folder = createIcon(
  'Folder',
  <path d="M3 19.5V5.5L4.5 4h5l2 2.5h8L21 8v11.5L19.5 21h-15L3 19.5z" />,
);

export const FolderOpen = createIcon(
  'FolderOpen',
  <>
    <path d="M3 19V5.5L4.5 4h5l2 2.5h7l1.5 1.5v2.5" />
    <path d="M3 19l2.5-8.5h15l-2.5 8.5H3z" />
  </>,
);

export const LibraryBig = createIcon(
  'LibraryBig',
  <>
    <path d="M4 3h5l1 1v16l-1 1H4l-1-1V4z" />
    <path d="M7 3v18" />
    <path d="M13 4h4l4 16h-4z" />
  </>,
);

export const ListChecks = createIcon(
  'ListChecks',
  <>
    <path d="M3 7l2 2 4-4M3 16l2 2 4-4" />
    <path d="M12 7h9M12 16h9" />
  </>,
);

export const Calendar = createIcon(
  'Calendar',
  <>
    <path d="M4.5 5h15L21 6.5v13L19.5 21h-15L3 19.5V6.5z" />
    <path d="M3 10h18" />
    <path d="M8 3v4M16 3v4" />
  </>,
);

export const CalendarClock = createIcon(
  'CalendarClock',
  <>
    <path d="M21 10V6.5L19.5 5h-15L3 6.5v13L4.5 21H11" />
    <path d="M3 10h18" />
    <path d="M8 3v4M16 3v4" />
    <circle cx="16.5" cy="16.5" r="4.5" />
    <path d="M16.5 14.5v2l1.5 1" />
  </>,
);

export const ShieldCheck = createIcon(
  'ShieldCheck',
  <>
    <path d="M12 3 4 6v6l8 9 8-9V6z" />
    <path d="m8.5 11.5 2.5 2.5 4.5-4.5" />
  </>,
);
