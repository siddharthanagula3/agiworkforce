'use client';

import { useEffect } from 'react';

/**
 * Initializes IntersectionObserver for scroll-reveal animations.
 * Extracted from an inline <script> to comply with CSP nonce policy.
 */
export function ScrollRevealInit() {
  useEffect(() => {
    const reveal = (el: Element) => {
      el.classList.add('opacity-100', 'translate-y-0');
      el.classList.remove('opacity-0', 'translate-y-8');
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) reveal(entry.target);
        });
      },
      { threshold: 0.05 },
    );

    document.querySelectorAll('.scroll-reveal').forEach((el) => {
      // Reveal elements already in viewport on mount
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        reveal(el);
      } else {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
