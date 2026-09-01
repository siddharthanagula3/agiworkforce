export type ContrastFinding = {
  text: string;
  ratio: number;
  need: number;
  sel: string;
};

export function scanContrast(): ContrastFinding[] {
  const surface = document.createElement('canvas');
  surface.width = 1;
  surface.height = 1;
  const pen = surface.getContext('2d', {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  pen.globalCompositeOperation = 'copy';
  const parse = (v: string) => {
    pen.fillStyle = 'rgba(0, 0, 0, 0)';
    pen.fillStyle = v;
    pen.fillRect(0, 0, 1, 1);
    const d = pen.getImageData(0, 0, 1, 1).data;
    return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: (d[3] ?? 0) / 255 };
  };
  type Rgb = { r: number; g: number; b: number; a: number };
  const over = (t: Rgb, b: Rgb): Rgb => ({
    r: t.r * t.a + b.r * (1 - t.a),
    g: t.g * t.a + b.g * (1 - t.a),
    b: t.b * t.a + b.b * (1 - t.a),
    a: 1,
  });
  const ground = (el: Element): Rgb | null => {
    const layers: Rgb[] = [];
    let n: Element | null = el;
    while (n) {
      // A gradient is a background-image, so backgroundColor reads transparent
      // and the walk would carry on to whatever is painted behind it. Measured
      // on the profile avatar: white initials on a brown-to-teal gradient were
      // reported as 1.06:1 against the near-white page. There is no single
      // colour to measure against, so the element is left alone.
      if (getComputedStyle(n).backgroundImage !== 'none') return null;
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 1) break;
      n = n.parentElement;
    }
    return layers.reduceRight<Rgb>((b, l) => over(l, b), {
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
  };
  const lum = ({ r, g, b }: Rgb) =>
    [r, g, b]
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const ratio = (f: Rgb, g: Rgb) => {
    const flat = f.a < 1 ? over(f, g) : f;
    const [hi, lo] = [lum(flat), lum(g)].sort((a, b) => b - a);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  const out: { text: string; ratio: number; need: number; sel: string }[] = [];
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? '')
      .join('')
      .trim();
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (Number(cs.opacity) < 0.15) continue;
    if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
    // Clerk renders the auth forms and prefixes every class with cl-.
    // Its own contrast is not ours to change, and one of the offenders is
    // the "Development mode" badge, which production never shows. Skipped
    // by that prefix so the sweep reports what this repository controls.
    if (/(^|\s)cl-/.test(String(el.className))) continue;
    if (el.closest('[class*="cl-rootBox"],[data-clerk-component]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5;
    const behind = ground(el);
    if (!behind) continue;
    const got = ratio(parse(cs.color), behind);
    if (got + 0.005 < need) {
      out.push({
        text: own.slice(0, 34),
        ratio: Math.round(got * 100) / 100,
        need,
        sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0],
      });
    }
  }
  return out.slice(0, 3);
}
