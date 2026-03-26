'use client';

import { useEffect } from 'react';

/**
 * Initializes IntersectionObserver for scroll-reveal animations.
 * Extracted from an inline <script> to comply with CSP nonce policy.
 */
export function ScrollRevealInit() {
  useEffect(() => {
    const revealed = new WeakSet<Element>();

    const reveal = (el: Element) => {
      if (revealed.has(el)) return;
      revealed.add(el);
      el.classList.add('opacity-100', 'translate-y-0');
      el.classList.remove('opacity-0', 'translate-y-8');
    };

    const elements = document.querySelectorAll('.scroll-reveal');

    // Primary: IntersectionObserver with generous rootMargin so it
    // fires 200px before the element enters the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px 200px 0px' },
    );

    elements.forEach((el) => observer.observe(el));

    // Fallback: on scroll, check any unrevealed elements.
    // Handles edge cases where the observer misses (fast scroll, layout shifts).
    const onScroll = () => {
      elements.forEach((el) => {
        if (revealed.has(el)) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight + 100 && rect.bottom > -100) {
          reveal(el);
        }
      });
    };

    // Run once immediately for elements already in viewport
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return null;
}
