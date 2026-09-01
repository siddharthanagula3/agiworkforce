import { createIcon } from '../createIcon';

const LENS = { cx: '10.5', cy: '10.5', r: '7.5' } as const;
const LENS_HANDLE = 'm16 16 5 5';

export const Plus = createIcon('Plus', <path d="M12 4v16M4 12h16" />);

export const SquarePen = createIcon(
  'SquarePen',
  <>
    <path d="M12 3H4.5L3 4.5v15L4.5 21h15l1.5-1.5V12" />
    <path d="M17.5 3 20 5.5 11.5 14l-3 .5.5-3z" />
  </>,
);

export const Search = createIcon(
  'Search',
  <>
    <circle {...LENS} />
    <path d={LENS_HANDLE} />
  </>,
);

export const Settings = createIcon(
  'Settings',
  <>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 5V3M19 12h2M12 19v2M5 12H3M16.95 7.05 18.36 5.64M16.95 16.95 18.36 18.36M7.05 16.95 5.64 18.36M7.05 7.05 5.64 5.64" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const PanelLeft = createIcon(
  'PanelLeft',
  <>
    <path d="M4.5 3h15L21 4.5v15L19.5 21h-15L3 19.5V4.5z" />
    <path d="M9 3v18" />
  </>,
);

export const Upload = createIcon(
  'Upload',
  <>
    <path d="M3 15v4.5L4.5 21h15l1.5-1.5V15" />
    <path d="M12 16V3" />
    <path d="m6.5 8.5 5.5-5.5 5.5 5.5" />
  </>,
);

export const MoreHorizontal = createIcon(
  'MoreHorizontal',
  <>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </>,
);

export const ZoomIn = createIcon(
  'ZoomIn',
  <>
    <circle {...LENS} />
    <path d={LENS_HANDLE} />
    <path d="M10.5 7.5v6M7.5 10.5h6" />
  </>,
);

export const ExternalLink = createIcon(
  'ExternalLink',
  <>
    <path d="M13 4H5.5L4 5.5v13L5.5 20H18l1.5-1.5V11" />
    <path d="M14 3h7v7" />
    <path d="m21 3-8 8" />
  </>,
);

export const RefreshCw = createIcon(
  'RefreshCw',
  <>
    <path d="M5 10.5 7.5 6.5 12 5l4.5 1.5" />
    <path d="M13.5 3.5 17 6.5l-3.5 3" />
    <path d="M19 13.5 16.5 17.5 12 19l-4.5-1.5" />
    <path d="M10.5 20.5 7 17.5l3.5-3" />
  </>,
);

export const RotateCcw = createIcon(
  'RotateCcw',
  <>
    <path d="M4.5 12V8.5L8 5h8l3.5 3.5v7L16 19H9" />
    <path d="M12 16 9 19l3 2" />
  </>,
);
