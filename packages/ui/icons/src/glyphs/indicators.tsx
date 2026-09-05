import { createIcon } from '../createIcon';

export const Check = createIcon('Check', <path d="m4 12.5 5 5L20 6.5" />);

export const ChevronRight = createIcon('ChevronRight', <path d="m9 5 7 7-7 7" />);

export const Clock = createIcon(
  'Clock',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6.5V12l4 2.5" />
  </>,
);

export const List = createIcon(
  'List',
  <>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h2M3 12h2M3 18h2" />
  </>,
);

export const Sparkles = createIcon(
  'Sparkles',
  <>
    <path d="M11 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    <path d="M18.5 3.5l.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.7z" />
  </>,
);

const RING = { cx: '12', cy: '12', r: '9' } as const;

export const CircleCheck = createIcon(
  'CircleCheck',
  <>
    <circle {...RING} />
    <path d="m7.5 12 3 3 6-6" />
  </>,
);

export const CircleX = createIcon(
  'CircleX',
  <>
    <circle {...RING} />
    <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
  </>,
);

export const CircleAlert = createIcon(
  'CircleAlert',
  <>
    <circle {...RING} />
    <path d="M12 7v6" />
    <circle cx="12" cy="16.5" r="1" />
  </>,
);

export const TriangleAlert = createIcon(
  'TriangleAlert',
  <>
    <path d="M12 3.5 21 19.5H3z" />
    <path d="M12 9v4.5" />
    <circle cx="12" cy="17" r="1" />
  </>,
);

export const Ban = createIcon(
  'Ban',
  <>
    <circle {...RING} />
    <path d="m5.6 5.6 12.8 12.8" />
  </>,
);

export const CircleDot = createIcon(
  'CircleDot',
  <>
    <circle {...RING} />
    <circle cx="12" cy="12" r="1" />
  </>,
);
