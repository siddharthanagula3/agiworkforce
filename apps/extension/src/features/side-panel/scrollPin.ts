const PINNED_TOLERANCE_PX = 48;

export interface ScrollPin {
  toEnd(): void;
}

/**
 * Keeps a transcript on its latest message while content above it is still
 * settling. Highlighting, maths, diagrams and images grow answers after the
 * first paint, so one jump to the end lands partway up a reopened chat. The
 * pin holds until the reader scrolls away from the end.
 */
export function createScrollPin(container: HTMLElement): ScrollPin {
  let pinned = true;

  const jump = (): void => {
    const behavior = container.style.scrollBehavior;
    container.style.scrollBehavior = 'auto';
    container.scrollTop = container.scrollHeight;
    container.style.scrollBehavior = behavior;
  };

  container.addEventListener(
    'scroll',
    () => {
      pinned =
        container.scrollHeight - container.scrollTop - container.clientHeight <=
        PINNED_TOLERANCE_PX;
    },
    { passive: true },
  );

  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (pinned) jump();
        })
      : null;

  return {
    toEnd(): void {
      pinned = true;
      jump();
      if (!observer) return;
      observer.disconnect();
      for (const child of container.children) observer.observe(child);
    },
  };
}
