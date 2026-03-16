/**
 * Accessibility Utility: Color Contrast Ratio Checker
 * WCAG 2.1 AA Compliance
 *
 * Calculates luminance and contrast ratio between two colors
 * to ensure text is readable for all users.
 */

/**
 * Converts RGB values to relative luminance using WCAG formula
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getLuminance(color: string): number {
  // Parse hex color (handle #RRGGBB format)
  if (!color.startsWith('#') || color.length !== 7) {
    console.warn(`Invalid color format: ${color}. Expected #RRGGBB`);
    return 0;
  }

  const rgb = parseInt(color.slice(1), 16);
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;

  // Convert 8-bit values to 0-1 range and apply gamma correction
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const normalized = c / 255;
    // WCAG formula for linearized RGB
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  // Return relative luminance
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculates contrast ratio between two colors
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * @returns Contrast ratio (1-21)
 */
export function getContrast(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Checks if contrast ratio meets WCAG AA standards
 *
 * @param color1 Foreground color (hex format)
 * @param color2 Background color (hex format)
 * @param isLargeText If true, requires 3:1 ratio; otherwise 4.5:1
 * @returns true if colors meet WCAG AA standards
 */
export function isAACompliant(color1: string, color2: string, isLargeText = false): boolean {
  const ratio = getContrast(color1, color2);
  // WCAG AA: 4.5:1 for normal text, 3:1 for large text (18pt+ or 14pt+ bold)
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Checks if contrast ratio meets WCAG AAA standards
 * AAA is stricter: 7:1 for normal text, 4.5:1 for large text
 *
 * @param color1 Foreground color
 * @param color2 Background color
 * @param isLargeText If true, requires 4.5:1; otherwise 7:1
 * @returns true if colors meet WCAG AAA standards
 */
export function isAAACompliant(color1: string, color2: string, isLargeText = false): boolean {
  const ratio = getContrast(color1, color2);
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Detailed contrast ratio report
 */
export function getContrastReport(color1: string, color2: string) {
  const ratio = getContrast(color1, color2);
  const isAA = isAACompliant(color1, color2);
  const isAAA = isAAACompliant(color1, color2);
  const isAALargeText = isAACompliant(color1, color2, true);
  const isAAALargeText = isAAACompliant(color1, color2, true);

  return {
    ratio: Math.round(ratio * 100) / 100,
    wcag: {
      aa: isAA,
      aaa: isAAA,
      aaLargeText: isAALargeText,
      aaaLargeText: isAAALargeText,
    },
    description: `${ratio.toFixed(2)}:1 contrast ratio${isAAA ? ' (AAA)' : isAA ? ' (AA)' : ' (Fail)'}`,
  };
}
