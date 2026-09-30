const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const SPINNER_SIZES = { sm: 16, default: 24, lg: 32 } as const;

export interface DomSpinnerOptions {
  label?: string;
  size?: keyof typeof SPINNER_SIZES;
  className?: string;
}

export interface DomSpinner {
  readonly element: HTMLElement;
  destroy(): void;
}

function prefersReducedMotion(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
}

export function createSpinner(options: DomSpinnerOptions = {}): DomSpinner {
  const size = SPINNER_SIZES[options.size ?? 'default'];
  const element = document.createElement('span');
  element.setAttribute('role', 'status');
  if (options.className) element.className = options.className;
  element.style.display = 'inline-flex';

  const ring = document.createElement('span');
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    display: 'inline-block',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    border: '2px solid currentColor',
    borderTopColor: 'transparent',
    boxSizing: 'border-box',
  });

  const text = document.createElement('span');
  text.textContent = options.label ?? 'Loading';
  Object.assign(text.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  });

  element.append(ring, text);

  const media = prefersReducedMotion();
  let animation: Animation | null = null;
  const sync = (): void => {
    const reduced = media?.matches === true;
    element.dataset['reducedMotion'] = String(reduced);
    if (reduced) {
      animation?.cancel();
      animation = null;
    } else if (!animation && typeof ring.animate === 'function') {
      animation = ring.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: 800,
        iterations: Infinity,
      });
    }
  };
  sync();
  media?.addEventListener?.('change', sync);

  return {
    element,
    destroy() {
      media?.removeEventListener?.('change', sync);
      animation?.cancel();
      element.remove();
    },
  };
}
