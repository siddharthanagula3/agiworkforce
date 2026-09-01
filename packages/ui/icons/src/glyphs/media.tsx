import { createIcon } from '../createIcon';
import { SCREEN_FRAME, SCREEN_STAND, SQUARE_FRAME } from './shapes';

const PHOTO_SUN = { cx: '8.5', cy: '8.5', r: '1.5' } as const;
const PHOTO_RIDGE = 'm3 17 5-5 4 4 3-3 6 6';

export const Camera = createIcon(
  'Camera',
  <>
    <path d="M9.5 5h5l1.5 2.5h3.5L21 9v9.5L19.5 20h-15L3 18.5V9l1.5-1.5H8z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </>,
);

export const Image = createIcon(
  'Image',
  <>
    <path d={SQUARE_FRAME} />
    <circle {...PHOTO_SUN} />
    <path d={PHOTO_RIDGE} />
  </>,
);

export const ImagePlus = createIcon(
  'ImagePlus',
  <>
    <path d="M14 3H4.5L3 4.5v15L4.5 21h15l1.5-1.5V10" />
    <circle {...PHOTO_SUN} />
    <path d={PHOTO_RIDGE} />
    <path d="M18 3v6M15 6h6" />
  </>,
);

export const Video = createIcon(
  'Video',
  <>
    <path d="M3 7.5 4.5 6h9L15 7.5v9L13.5 18h-9L3 16.5z" />
    <path d="m15 12 6-4.5v9z" />
  </>,
);

export const Monitor = createIcon(
  'Monitor',
  <>
    <path d={SCREEN_FRAME} />
    <path d={SCREEN_STAND} />
  </>,
);

export const MonitorPlay = createIcon(
  'MonitorPlay',
  <>
    <path d={SCREEN_FRAME} />
    <path d={SCREEN_STAND} />
    <path d="m10.5 7 4.5 3-4.5 3z" />
  </>,
);

export const Palette = createIcon(
  'Palette',
  <>
    <path d="M12 3 3 9v6l4.5 6H12l1-2-1.5-2 1.5-2H19l2-2V9z" />
    <circle cx="8" cy="10" r="1" />
    <circle cx="12" cy="8" r="1" />
    <circle cx="16" cy="10" r="1" />
  </>,
);
