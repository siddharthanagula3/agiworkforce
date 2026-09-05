import { createIcon } from '../createIcon';
import { MIC_CAPSULE, MIC_CRADLE, MIC_STAND, SLASH } from './shapes';

export const ArrowUp = createIcon(
  'ArrowUp',
  <>
    <path d="M12 21V3" />
    <path d="m5 10 7-7 7 7" />
  </>,
);

export const ChevronDown = createIcon('ChevronDown', <path d="m5 9 7 7 7-7" />);

export const ChevronUp = createIcon('ChevronUp', <path d="m5 15 7-7 7 7" />);

export const X = createIcon('X', <path d="M5 5 19 19M19 5 5 19" />);

export const Minus = createIcon('Minus', <path d="M4 12h16" />);

export const Square = createIcon('Square', <path d="M8 7h8l1 1v8l-1 1H8l-1-1V8z" />);

export const Paperclip = createIcon(
  'Paperclip',
  <path d="M18 7v10l-3 3H9l-3-3V6.5L8.5 4h1.5L12 6.5V16" />,
);

export const Mic = createIcon(
  'Mic',
  <>
    <path d={MIC_CAPSULE} />
    <path d={MIC_CRADLE} />
    <path d={MIC_STAND} />
  </>,
);

export const MicOff = createIcon(
  'MicOff',
  <>
    <path d={MIC_CAPSULE} />
    <path d={MIC_CRADLE} />
    <path d={MIC_STAND} />
    <path d={SLASH} />
  </>,
);

export const AudioLines = createIcon(
  'AudioLines',
  <>
    <path d="M4 10v4" />
    <path d="M8 6v12" />
    <path d="M12 4v16" />
    <path d="M16 6v12" />
    <path d="M20 10v4" />
  </>,
);

export const EyeOff = createIcon(
  'EyeOff',
  <>
    <path d="M3 12 8 7.5h8L21 12l-5 4.5H8z" />
    <path d={SLASH} />
  </>,
);

export const Telescope = createIcon(
  'Telescope',
  <>
    <path d="M4 14 7 9l10 6-3 5z" />
    <path d="M9.5 10.5 6.5 15.5" />
    <path d="M6.5 21 9 17l3.5 4" />
  </>,
);
