/**
 * ScrollToTop Component
 * Automatically scrolls to top when route changes
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const ScrollToTop: React.FC = () => {
  const pathname = usePathname();

  useEffect(() => {
    // Scroll to top when pathname changes
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
