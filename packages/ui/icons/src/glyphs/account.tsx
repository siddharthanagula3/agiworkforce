import { createIcon } from '../createIcon';
import { SQUARE_FRAME } from './shapes';

const HELP_GLYPH = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5 11 8h2l1.5 1.5v1L12 13v1.5" />
    <circle cx="12" cy="17" r="1" />
  </>
);

export const LogOut = createIcon(
  'LogOut',
  <>
    <path d="M9 3H4.5L3 4.5v15L4.5 21H9" />
    <path d="m15 8 4 4-4 4" />
    <path d="M19 12H9" />
  </>,
);

export const CreditCard = createIcon(
  'CreditCard',
  <>
    <path d="M4.5 5h15L21 6.5v11L19.5 19h-15L3 17.5v-11z" />
    <path d="M3 9.5h18" />
    <path d="M6.5 14.5h4" />
  </>,
);

export const Bell = createIcon(
  'Bell',
  <>
    <path d="M12 7V5" />
    <path d="M5.5 18.5 7 16.5V10l2-3h6l2 3v6.5l1.5 2z" />
    <path d="M10 18.5v.5l1 1h2l1-1v-.5" />
  </>,
);

export const Share2 = createIcon(
  'Share2',
  <>
    <circle cx="17.5" cy="6" r="2.5" />
    <circle cx="6.5" cy="12" r="2.5" />
    <circle cx="17.5" cy="18" r="2.5" />
    <path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6" />
  </>,
);

export const HelpCircle = createIcon('HelpCircle', HELP_GLYPH);

export const CircleHelp = createIcon('CircleHelp', HELP_GLYPH);

export const Keyboard = createIcon(
  'Keyboard',
  <>
    <path d="M4.5 6h15L21 7.5v9L19.5 18h-15L3 16.5v-9z" />
    <path d="M6.5 10h1M10 10h1M13.5 10h1M17 10h1" />
    <path d="M8.5 14h7" />
  </>,
);

export const Menu = createIcon('Menu', <path d="M3 6h18M3 12h18M3 18h18" />);

export const PanelsTopLeft = createIcon(
  'PanelsTopLeft',
  <>
    <path d={SQUARE_FRAME} />
    <path d="M3 9h18" />
    <path d="M9 9v12" />
  </>,
);

export const Scale = createIcon(
  'Scale',
  <>
    <path d="M12 5v16M8 21h8" />
    <path d="M6 7h12M6 7v4M18 7v4" />
    <path d="M3 11h6l-2 3H5z" />
    <path d="M15 11h6l-2 3h-2z" />
  </>,
);
