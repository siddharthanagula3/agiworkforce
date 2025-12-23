import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ElementHighlightProps {
  selector: string;
  onReady?: () => void;
  showPulse?: boolean;
  spotlightPadding?: number;
  zIndex?: number;
}

export const ElementHighlight = ({
  selector,
  onReady,
  showPulse = true,
  spotlightPadding = 8,
  zIndex = 9999,
}: ElementHighlightProps) => {
  const [position, setPosition] = useState<DOMRect | null>(null);
  const [isReady, setIsReady] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      const element = document.querySelector(selector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setPosition(rect);

        if (!isReady) {
          setIsReady(true);
          onReady?.();
        }
      } else {
        setPosition(null);
        setIsReady(false);
      }
    };

    updatePosition();

    const element = document.querySelector(selector);
    if (element) {
      observerRef.current = new ResizeObserver(updatePosition);
      observerRef.current.observe(element);
    }

    mutationObserverRef.current = new MutationObserver(updatePosition);
    mutationObserverRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      observerRef.current?.disconnect();
      mutationObserverRef.current?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [selector, isReady, onReady]);

  if (!position) return null;

  const content = (
    <div
      className="fixed inset-0 pointer-events-none transition-opacity duration-300"
      style={{ zIndex }}
    >
      {}
      <svg width="100%" height="100%" className="absolute inset-0">
        <defs>
          <mask id={`highlight-mask-${selector.replace(/[^a-zA-Z0-9]/g, '')}`}>
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={position.x - spotlightPadding}
              y={position.y - spotlightPadding}
              width={position.width + spotlightPadding * 2}
              height={position.height + spotlightPadding * 2}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.7)"
          mask={`url(#highlight-mask-${selector.replace(/[^a-zA-Z0-9]/g, '')})`}
        />
      </svg>

      {}
      <div
        className={`absolute transition-all duration-300 ${showPulse ? 'animate-pulse-border' : ''}`}
        style={{
          left: position.x - spotlightPadding,
          top: position.y - spotlightPadding,
          width: position.width + spotlightPadding * 2,
          height: position.height + spotlightPadding * 2,
          border: '3px solid rgb(59, 130, 246)',
          borderRadius: '8px',
          boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.5)',
        }}
      />

      {}
      {showPulse && (
        <>
          <div
            className="absolute w-3 h-3 bg-blue-500 rounded-full animate-ping"
            style={{
              left: position.x - spotlightPadding - 6,
              top: position.y - spotlightPadding - 6,
            }}
          />
          <div
            className="absolute w-3 h-3 bg-blue-500 rounded-full animate-ping"
            style={{
              left: position.right + spotlightPadding - 6,
              top: position.y - spotlightPadding - 6,
              animationDelay: '0.2s',
            }}
          />
          <div
            className="absolute w-3 h-3 bg-blue-500 rounded-full animate-ping"
            style={{
              left: position.x - spotlightPadding - 6,
              top: position.bottom + spotlightPadding - 6,
              animationDelay: '0.4s',
            }}
          />
          <div
            className="absolute w-3 h-3 bg-blue-500 rounded-full animate-ping"
            style={{
              left: position.right + spotlightPadding - 6,
              top: position.bottom + spotlightPadding - 6,
              animationDelay: '0.6s',
            }}
          />
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

interface MultiElementHighlightProps {
  selectors: string[];
  spotlightPadding?: number;
  zIndex?: number;
}

export const MultiElementHighlight = ({
  selectors,
  spotlightPadding = 8,
  zIndex = 9999,
}: MultiElementHighlightProps) => {
  return (
    <>
      {selectors.map((selector, index) => (
        <ElementHighlight
          key={selector}
          selector={selector}
          spotlightPadding={spotlightPadding}
          zIndex={zIndex + index}
          showPulse={index === 0}
        />
      ))}
    </>
  );
};
