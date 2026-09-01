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
