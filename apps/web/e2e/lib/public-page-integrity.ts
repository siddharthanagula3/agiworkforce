import type { Page } from '@playwright/test';

export interface IntegrityFinding {
  code: string;
  subject: string;
  message: string;
}

export interface PublicRestorationReport {
  scope: 'document-and-open-shadow-roots';
  verified: boolean;
  frames: number;
  elapsedMs: number;
  window: {
    expected: { x: number; y: number };
    actual: { x: number; y: number };
    verified: boolean;
  };
  scrollPorts: {
    subject: string;
    expected: { x: number; y: number };
    actual: { x: number; y: number } | null;
    connected: boolean;
    sameRoot: boolean;
    verified: boolean;
  }[];
  focus: {
    expected: string | null;
    actual: string | null;
    connected: boolean;
    rootAccessible: boolean;
    verified: boolean;
  };
  openShadowRoots: number;
  embeddedDocuments: number;
  findings: IntegrityFinding[];
}

async function capturePublicInteractionState(page: Page) {
  return page.evaluateHandle(() => {
    const subject = (element: Element | null) =>
      element ? `${element.localName}${element.id ? '#' + element.id : ''}` : null;
    const collect = () => {
      const roots: (Document | ShadowRoot)[] = [document];
      const elements: Element[] = [];
      for (let index = 0; index < roots.length; index += 1) {
        for (const element of roots[index]?.querySelectorAll('*') ?? []) {
          elements.push(element);
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      return { roots, elements };
    };
    const currentFocus = () => {
      let element = document.activeElement;
      while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
      return element;
    };
    const scrollPort = (element: Element): element is HTMLElement =>
      element instanceof HTMLElement &&
      (element.scrollWidth > element.clientWidth ||
        element.scrollHeight > element.clientHeight ||
        element.scrollLeft !== 0 ||
        element.scrollTop !== 0);
    const initial = collect();
    const ports = initial.elements.filter(scrollPort).map((element) => ({
      element,
      root: element.getRootNode(),
      subject: subject(element) ?? 'unknown scroll port',
      x: element.scrollLeft,
      y: element.scrollTop,
    }));
    const position = { x: scrollX, y: scrollY };
    const previous = currentFocus();
    const previousRoot = previous?.getRootNode();
    const rootAccessible = Boolean(
      previous &&
      initial.roots.includes(previousRoot as Document | ShadowRoot) &&
      !previous.matches('iframe,frame,object,embed') &&
      !(previous.localName.includes('-') && !previous.shadowRoot),
    );
    const expectedFocus = subject(previous);
    const body = document.body;
    const bodyTabindex = body.getAttribute('tabindex');
    const url = location.href;
    return {
      restore: async (): Promise<PublicRestorationReport> => {
        const findings: IntegrityFinding[] = [];
        const add = (code: string, target: string, message: string) =>
          findings.push({ code, subject: target, message });
        const start = performance.now();
        let frames = 0;
        let timedOut = false;
        const frame = () =>
          new Promise<boolean>((resolve) => {
            const remaining = Math.max(0, 1000 - (performance.now() - start));
            let request = 0;
            const timeout = setTimeout(() => {
              cancelAnimationFrame(request);
              resolve(false);
            }, remaining);
            request = requestAnimationFrame(() => {
              clearTimeout(timeout);
              resolve(true);
            });
          });
        if (previous?.isConnected && rootAccessible && currentFocus() !== previous) {
          if (previous === body) body.tabIndex = -1;
          if ('focus' in previous && typeof previous.focus === 'function')
            previous.focus({ preventScroll: true });
        }
        if (bodyTabindex === null) body.removeAttribute('tabindex');
        else body.setAttribute('tabindex', bodyTabindex);
        for (const port of [...ports].reverse()) {
          if (port.element.isConnected && port.element.getRootNode() === port.root)
            port.element.scrollTo({ left: port.x, top: port.y, behavior: 'instant' });
        }
        window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
        const near = (actual: number, expected: number) => Math.abs(actual - expected) <= 0.1;
        const connected = (port: (typeof ports)[number]) =>
          port.element.isConnected && port.element.ownerDocument === document;
        const portMatches = (port: (typeof ports)[number]) =>
          connected(port) &&
          port.element.getRootNode() === port.root &&
          near(port.element.scrollLeft, port.x) &&
          near(port.element.scrollTop, port.y);
        const focusMatches = () =>
          rootAccessible &&
          Boolean(previous?.isConnected) &&
          previous?.getRootNode() === previousRoot &&
          currentFocus() === previous;
        const windowMatches = () => near(scrollX, position.x) && near(scrollY, position.y);
        const bodyMatches = () =>
          body.isConnected &&
          body === document.body &&
          body.getAttribute('tabindex') === bodyTabindex;
        let stable = 0;
        for (; frames < 12;) {
          if (!(await frame())) {
            timedOut = true;
            break;
          }
          frames += 1;
          stable =
            windowMatches() &&
            ports.every(portMatches) &&
            focusMatches() &&
            bodyMatches() &&
            location.href === url
              ? stable + 1
              : 0;
        }
        if (timedOut)
          add(
            'interaction-restoration-timeout',
            'viewport',
            'Restoration frame window exceeded 1000ms',
          );
        if (location.href !== url)
          add(
            'interaction-restoration-navigation',
            'document',
            'The original document address changed',
          );
        if (!bodyMatches())
          add(
            'interaction-restoration-body',
            'body',
            'The original body or its tabindex was not restored',
          );
        const current = collect();
        if (
          current.roots.length !== initial.roots.length ||
          current.roots.some((root) => !initial.roots.includes(root))
        )
          add(
            'interaction-restoration-root-change',
            'document',
            'Observable root topology changed',
          );
        const newPorts = current.elements
          .filter(scrollPort)
          .filter((element) => !ports.some((port) => port.element === element));
        if (newPorts.length)
          add(
            'interaction-restoration-new-scroll-port',
            'document',
            `New scroll ports have no initial position sample: ${newPorts.map(subject).join(', ')}`,
          );
        const scrollPorts = ports.map((port) => {
          const isConnected = connected(port);
          const sameRoot = isConnected && port.element.getRootNode() === port.root;
          const verified = portMatches(port);
          if (!isConnected)
            add(
              'interaction-restoration-scroll-port-lost',
              port.subject,
              'The original scroll port disconnected',
            );
          else if (!sameRoot)
            add(
              'interaction-restoration-scroll-root-changed',
              port.subject,
              'The original scroll port moved to another root',
            );
          else if (!verified)
            add(
              'interaction-restoration-scroll-mismatch',
              port.subject,
              `Expected ${port.x},${port.y}; observed ${port.element.scrollLeft},${port.element.scrollTop}`,
            );
          return {
            subject: port.subject,
            expected: { x: port.x, y: port.y },
            actual: isConnected ? { x: port.element.scrollLeft, y: port.element.scrollTop } : null,
            connected: isConnected,
            sameRoot,
            verified,
          };
        });
        if (!windowMatches())
          add(
            'interaction-restoration-window-mismatch',
            'viewport',
            `Expected ${position.x},${position.y}; observed ${scrollX},${scrollY}`,
          );
        if (!rootAccessible)
          add(
            'interaction-restoration-focus-unmeasured',
            expectedFocus ?? 'focus',
            'The original focus is inside an inaccessible or unobservable root',
          );
        else if (!previous?.isConnected)
          add(
            'interaction-restoration-focus-lost',
            expectedFocus ?? 'focus',
            'The original focused element disconnected',
          );
        else if (!focusMatches())
          add(
            'interaction-restoration-focus-mismatch',
            expectedFocus ?? 'focus',
            `Observed focus: ${subject(currentFocus()) ?? 'none'}`,
          );
        if (stable < 3)
          add(
            'interaction-restoration-unstable',
            'document',
            'Three final restoration frames did not retain the original state',
          );
        return {
          scope: 'document-and-open-shadow-roots',
          verified: !findings.length,
          frames,
          elapsedMs: performance.now() - start,
          window: {
            expected: position,
            actual: { x: scrollX, y: scrollY },
            verified: windowMatches(),
          },
          scrollPorts,
          focus: {
            expected: expectedFocus,
            actual: subject(currentFocus()),
            connected: Boolean(previous?.isConnected),
            rootAccessible,
            verified: focusMatches(),
          },
          openShadowRoots: initial.roots.length - 1,
          embeddedDocuments: initial.elements.filter((element) =>
            element.matches('iframe,frame,object,embed'),
          ).length,
          findings,
        };
      },
    };
  });
}

async function withPublicInteractionRestoration<T extends { findings: IntegrityFinding[] }>(
  page: Page,
  measure: () => Promise<T>,
): Promise<T & { restoration: PublicRestorationReport }> {
  const state = await capturePublicInteractionState(page);
  let report: T | undefined;
  let measurementError: unknown;
  let measurementFailed = false;
  try {
    report = await measure();
  } catch (error) {
    measurementFailed = true;
    measurementError = error;
  }
  let restoration: PublicRestorationReport;
  try {
    restoration = await state.evaluate((snapshot) => snapshot.restore());
  } catch (restorationError) {
    if (measurementFailed)
      throw new AggregateError(
        [measurementError, restorationError],
        'Measurement and restoration failed',
      );
    throw restorationError;
  } finally {
    await state.dispose();
  }
  if (measurementFailed) {
    if (restoration.findings.length)
      throw new AggregateError(
        [measurementError, new Error(JSON.stringify(restoration.findings))],
        'Measurement failed and restoration was not verified',
      );
    throw measurementError;
  }
  if (!report) throw new Error('Measurement result is missing');
  report.findings.push(...restoration.findings);
  return { ...report, restoration };
}

export interface PublicIntegrityOptions {
  expectedCanonical: string;
  expectedTitle?: string;
  expectedDescription?: string;
  expectedShareImage?: string;
  touch?: boolean;
}

export interface PublicIntegrityReport {
  restoration: PublicRestorationReport;
  url: string;
  targetMinimumPx: number;
  metadata: Record<string, string[]>;
  headings: { level: number; text: string }[];
  landmarks: { role: string; label: string }[];
  targets: {
    subject: string;
    keyboard: boolean;
    rectangles: { width: number; height: number }[];
    focusReveal: {
      reasons: string[];
      initialFindings: IntegrityFinding[];
      focused: boolean;
      painted: boolean;
      restored: boolean;
    } | null;
    hitRegions: {
      state: 'initial' | 'focus-revealed';
      source: string;
      width: number;
      height: number;
      hitWidth: number;
      hitHeight: number;
      samples: number;
      ownedSamples: number;
      blockedSamples: number;
      blockedPoints: { x: number; y: number; topHit: string | null; stack: string[] }[];
      maximumSampleGapPx: number;
      sampledBounds: { left: number; top: number; width: number; height: number };
      clippedToViewport: boolean;
      settled: boolean;
      verified: boolean;
    }[];
  }[];
  findings: IntegrityFinding[];
  limits: string[];
}

export async function measurePublicPageIntegrity(
  page: Page,
  options: PublicIntegrityOptions,
): Promise<PublicIntegrityReport> {
  const expected = new URL(options.expectedCanonical);
  if (
    !['http:', 'https:'].includes(expected.protocol) ||
    expected.username ||
    expected.password ||
    expected.hash
  ) {
    throw new Error(
      'expectedCanonical must be an absolute HTTP(S) URL without credentials or a fragment',
    );
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return withPublicInteractionRestoration(page, () =>
    page.evaluate(async (settings): Promise<Omit<PublicIntegrityReport, 'restoration'>> => {
      const findings: IntegrityFinding[] = [];
      const add = (code: string, subject: string, message: string) => {
        findings.push({ code, subject, message });
      };
      const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
      const accessible = (element: Element): boolean => {
        if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        for (let node: Element | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility))
            return false;
        }
        return true;
      };
      const rendered = (element: Element) =>
        accessible(element) &&
        [...element.getClientRects()].some((r) => r.width > 0 && r.height > 0);
      const label = (element: Element) => {
        const labelledBy = (element.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ');
        return normalized(
          labelledBy || element.getAttribute('aria-label') || element.textContent || '',
        );
      };
      const subject = (element: Element) =>
        `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} ${label(element).slice(0, 120)}`.trim();
      const absoluteHttpUrl = (value: string, field: string): string | null => {
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            add('metadata-url-invalid', field, `Expected an absolute HTTP(S) URL: ${value}`);
            return null;
          }
          return url.href;
        } catch {
          add('metadata-url-invalid', field, `Expected an absolute HTTP(S) URL: ${value}`);
          return null;
        }
      };
      const fields = [
        { key: 'title', selector: 'title', required: true, url: false },
        { key: 'description', selector: 'meta[name="description" i]', required: true, url: false },
        { key: 'canonical', selector: 'link[rel~="canonical" i]', required: true, url: true },
        {
          key: 'og:image',
          selector: 'meta[property="og:image" i], meta[name="og:image" i]',
          required: true,
          url: true,
        },
        {
          key: 'twitter:image',
          selector: 'meta[name="twitter:image" i], meta[property="twitter:image" i]',
          required: false,
          url: true,
        },
        {
          key: 'og:url',
          selector: 'meta[property="og:url" i], meta[name="og:url" i]',
          required: false,
          url: true,
        },
        {
          key: 'og:title',
          selector: 'meta[property="og:title" i], meta[name="og:title" i]',
          required: false,
          url: false,
        },
        {
          key: 'og:description',
          selector: 'meta[property="og:description" i], meta[name="og:description" i]',
          required: false,
          url: false,
        },
        {
          key: 'twitter:title',
          selector: 'meta[name="twitter:title" i], meta[property="twitter:title" i]',
          required: false,
          url: false,
        },
        {
          key: 'twitter:description',
          selector: 'meta[name="twitter:description" i], meta[property="twitter:description" i]',
          required: false,
          url: false,
        },
      ];
      const metadata: Record<string, string[]> = {};
      for (const field of fields) {
        const elements = [...document.querySelectorAll(field.selector)];
        const values = elements.map((element) =>
          normalized(
            field.key === 'title'
              ? (element.textContent ?? '')
              : (element.getAttribute(field.key === 'canonical' ? 'href' : 'content') ?? ''),
          ),
        );
        metadata[field.key] = values;
        if (field.required && values.length === 0)
          add('metadata-missing', field.key, 'No value found');
        if (values.some((value) => !value))
          add('metadata-empty', field.key, 'An empty value was found');
        if (values.length > 1) {
          add('metadata-duplicate', field.key, `${values.length} declarations found`);
          if (new Set(values).size > 1) add('metadata-conflicting', field.key, 'Values disagree');
        }
        if (field.url) {
          for (const value of values.filter(Boolean)) absoluteHttpUrl(value, field.key);
        }
      }
      if (normalized(document.title) !== metadata['title']?.[0]) {
        add(
          'document-title-conflicting',
          'title',
          'document.title disagrees with the title declaration',
        );
      }
      const expectations: [string, string | undefined][] = [
        ['title', settings.expectedTitle],
        ['description', settings.expectedDescription],
        ['canonical', settings.expectedCanonical],
        ['og:image', settings.expectedShareImage],
      ];
      for (const [key, expected] of expectations) {
        if (expected !== undefined && metadata[key]?.[0] !== normalized(expected)) {
          add(
            'metadata-unexpected',
            key,
            `Expected ${expected}; received ${metadata[key]?.[0] ?? 'nothing'}`,
          );
        }
      }
      if (metadata['canonical']?.[0]?.includes('#')) {
        add('canonical-fragment', 'canonical', 'Canonical must not contain a fragment');
      }
      if (metadata['og:url']?.length && metadata['og:url'][0] !== metadata['canonical']?.[0]) {
        add('metadata-conflicting', 'og:url', 'Open Graph URL disagrees with canonical');
      }
      if (
        metadata['twitter:image']?.length &&
        metadata['twitter:image'][0] !== metadata['og:image']?.[0]
      ) {
        add(
          'metadata-conflicting',
          'twitter:image',
          'Twitter image disagrees with Open Graph image',
        );
      }

      const headingElements = [
        ...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'),
      ].filter(accessible);
      const headings = headingElements.map((element) => {
        const role = element.getAttribute('role')?.trim();
        if (role && role !== 'heading') {
          add('heading-role-overridden', subject(element), `Heading role was replaced by ${role}`);
        }
        return {
          level:
            element.hasAttribute('aria-level') || !/^H[1-6]$/.test(element.tagName)
              ? Number(element.getAttribute('aria-level'))
              : Number(element.tagName.slice(1)),
          text: label(element),
        };
      });
      if (headings.filter((heading) => heading.level === 1).length !== 1) {
        add('h1-count', 'headings', 'Expected exactly one accessible level-one heading');
      }
      let previous = 0;
      for (const heading of headings) {
        if (!Number.isInteger(heading.level) || heading.level < 1 || heading.level > 6) {
          add('heading-level-invalid', heading.text, `Invalid level ${heading.level}`);
        } else {
          if (heading.level > previous + 1)
            add('heading-level-skipped', heading.text, `${previous} to ${heading.level}`);
          previous = heading.level;
        }
        if (!heading.text) add('heading-empty', 'heading', 'Heading has no accessible text');
      }
      const landmarkElements = [
        ...document.querySelectorAll(
          'main,header,footer,nav,[role="main"],[role="banner"],[role="contentinfo"],[role="navigation"]',
        ),
      ]
        .filter(accessible)
        .filter(
          (element) =>
            element.hasAttribute('role') ||
            !['HEADER', 'FOOTER'].includes(element.tagName) ||
            !element.parentElement?.closest('main,article,section,aside,nav'),
        );
      const landmarkRole = (element: Element) =>
        element.getAttribute('role') ??
        (
          {
            MAIN: 'main',
            HEADER: 'banner',
            FOOTER: 'contentinfo',
            NAV: 'navigation',
          } as Record<string, string>
        )[element.tagName] ??
        '';
      const landmarkLabel = (element: Element) => {
        if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby'))
          return '';
        return label(element);
      };
      const landmarks = landmarkElements.map((element) => ({
        role: landmarkRole(element),
        label: landmarkLabel(element),
      }));
      for (const role of ['main', 'banner', 'contentinfo']) {
        const count = landmarks.filter((landmark) => landmark.role === role).length;
        if (count !== 1) add('landmark-count', role, `Expected one; found ${count}`);
      }
      const main = landmarkElements.find((element) => landmarkRole(element) === 'main');
      const h1 = headingElements[headings.findIndex((heading) => heading.level === 1)];
      if (main && h1 && !main.contains(h1))
        add('h1-outside-main', 'h1', 'Page heading is outside the main landmark');
      const navigation = landmarks.filter((landmark) => landmark.role === 'navigation');
      if (navigation.length > 1 && navigation.some((landmark) => !landmark.label)) {
        add('navigation-unlabelled', 'navigation', 'Multiple navigation landmarks need labels');
      }
      for (const element of landmarkElements) {
        for (const id of (element.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/)
          .filter(Boolean)) {
          if (!document.getElementById(id))
            add('landmark-label-missing', subject(element), `Missing label ${id}`);
        }
      }

      const touch =
        settings.touch ?? (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches);
      const targetMinimumPx = touch ? 44 : 24;
      const actionable =
        'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"],[role="menuitem"],[role="combobox"],[role="switch"]';
      const targets: PublicIntegrityReport['targets'] = [];
      const currentFocus = () => {
        let element = document.activeElement;
        while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
        return element;
      };
      const paintState = (element: HTMLElement) => {
        const reasons: string[] = [];
        const unmeasured: string[] = [];
        const length = (value: string, extent: number) => {
          if (/^-?\d*\.?\d+px$/.test(value)) return parseFloat(value);
          if (/^-?\d*\.?\d+%$/.test(value)) return (parseFloat(value) * extent) / 100;
          return null;
        };
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          const css = getComputedStyle(node);
          const opacity = css.opacity.trim();
          if (!opacity || !Number.isFinite(Number(opacity)))
            unmeasured.push(`${subject(node)}: unresolved opacity`);
          else if (Number(opacity) === 0) reasons.push(`${subject(node)}: opacity 0`);
          if (css.maskImage !== 'none') unmeasured.push(`${subject(node)}: mask geometry`);
          if (css.filter !== 'none') unmeasured.push(`${subject(node)}: filter effects`);
          let clip: { left: number; top: number; right: number; bottom: number } | null = null;
          if (css.clip !== 'auto' && ['absolute', 'fixed'].includes(css.position)) {
            const values = /^rect\(([^)]+)\)$/
              .exec(css.clip)?.[1]
              ?.trim()
              .split(/\s*,\s*|\s+/);
            if (values?.length === 4) {
              const resolved = values.map((value, index) =>
                value === 'auto'
                  ? [0, node?.offsetWidth ?? 0, node?.offsetHeight ?? 0, 0][index]
                  : length(value, 0),
              );
              if (resolved.every((value) => value !== null && value !== undefined))
                clip = {
                  top: resolved[0]!,
                  right: resolved[1]!,
                  bottom: resolved[2]!,
                  left: resolved[3]!,
                };
            }
            if (!clip) unmeasured.push(`${subject(node)}: unresolved clip ${css.clip}`);
          }
          if (css.clipPath !== 'none') {
            const values = /^inset\(([^)]+)\)$/
              .exec(css.clipPath)?.[1]
              ?.split(/\s+round\s+/)[0]
              ?.trim()
              .split(/\s+/);
            if (
              values?.length &&
              values.length <= 4 &&
              node.offsetWidth > 0 &&
              node.offsetHeight > 0
            ) {
              const insets = [
                values[0]!,
                values[1] ?? values[0]!,
                values[2] ?? values[0]!,
                values[3] ?? values[1] ?? values[0]!,
              ].map((value, index) =>
                length(value, index % 2 ? node!.offsetWidth : node!.offsetHeight),
              );
              if (insets.every((value) => value !== null)) {
                const insetClip = {
                  top: insets[0]!,
                  right: node.offsetWidth - insets[1]!,
                  bottom: node.offsetHeight - insets[2]!,
                  left: insets[3]!,
                };
                clip = clip
                  ? {
                      top: Math.max(clip.top, insetClip.top),
                      right: Math.min(clip.right, insetClip.right),
                      bottom: Math.min(clip.bottom, insetClip.bottom),
                      left: Math.max(clip.left, insetClip.left),
                    }
                  : insetClip;
              } else unmeasured.push(`${subject(node)}: unresolved inset ${css.clipPath}`);
            } else unmeasured.push(`${subject(node)}: unresolved clip path ${css.clipPath}`);
          }
          if (!clip) continue;
          if (clip.right <= clip.left || clip.bottom <= clip.top) {
            reasons.push(`${subject(node)}: empty clip geometry`);
          }
        }
        return { reasons, unmeasured };
      };
      type Region = { source: string; left: number; top: number; width: number; height: number };
      const labelsFor = (element: HTMLElement) =>
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
          ? [...(element.labels ?? [])].filter(rendered)
          : [];
      const settle = async (element: HTMLElement, includePaint = false) => {
        element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const start = performance.now();
        let previous: (number | string)[] | undefined;
        let stable = 0;
        for (let frame = 0; frame < 12; frame += 1) {
          const arrived = await new Promise<boolean>((resolve) => {
            let request = 0;
            const timeout = setTimeout(
              () => {
                cancelAnimationFrame(request);
                resolve(false);
              },
              Math.max(0, 1000 - (performance.now() - start)),
            );
            request = requestAnimationFrame(() => {
              clearTimeout(timeout);
              resolve(true);
            });
          });
          if (!arrived) return false;
          if (!element.isConnected) return false;
          const box = element.getBoundingClientRect();
          const geometry = [box.left, box.top, box.width, box.height, scrollX, scrollY];
          if (geometry.some((value) => !Number.isFinite(value)))
            throw new Error('Target geometry was not finite');
          const current: (number | string)[] = [...geometry];
          if (includePaint)
            for (let node: HTMLElement | null = element; node; node = node.parentElement) {
              const css = getComputedStyle(node);
              current.push(
                css.opacity,
                css.visibility,
                css.display,
                css.clip,
                css.clipPath,
                css.maskImage,
                css.filter,
              );
            }
          stable =
            previous &&
            current.length === previous.length &&
            current.every((value, index) => {
              const before = previous?.[index];
              return typeof value === 'number' && typeof before === 'number'
                ? Math.abs(value - before) <= 0.1
                : value === before;
            })
              ? stable + 1
              : 0;
          if (stable >= 2) return true;
          previous = current;
        }
        return false;
      };
      const pseudoRegion = (element: HTMLElement, pseudo: string, name: string): Region | null => {
        const css = getComputedStyle(element, pseudo);
        if (
          ['none', 'normal'].includes(css.content) ||
          css.display === 'none' ||
          css.visibility !== 'visible'
        )
          return null;
        if (!['absolute', 'fixed'].includes(css.position)) return null;
        const finite = (value: string) =>
          /^-?\d*\.?\d+px$/.test(value) ? Number.parseFloat(value) : null;
        const unsupported = (reason: string) => {
          add('target-pseudo-unmeasurable', name + pseudo, reason);
          return null;
        };
        if (
          css.transform !== 'none' ||
          css.translate !== 'none' ||
          css.rotate !== 'none' ||
          css.scale !== 'none'
        ) {
          return unsupported('Pseudo-element transforms require a separate geometric probe');
        }
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          const transform = getComputedStyle(node).transform;
          if (transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(transform);
            if (
              !matrix.is2D ||
              matrix.b !== 0 ||
              matrix.c !== 0 ||
              matrix.a <= 0 ||
              matrix.d <= 0
            ) {
              return unsupported(
                'Rotated, skewed or perspective containing blocks cannot be resolved',
              );
            }
          }
        }
        let containing: HTMLElement | null = element;
        if (css.position === 'fixed') containing = null;
        else {
          while (
            containing &&
            getComputedStyle(containing).position === 'static' &&
            getComputedStyle(containing).transform === 'none'
          ) {
            containing = containing.parentElement;
          }
        }
        const containerBox = containing?.getBoundingClientRect();
        const containerCss = containing ? getComputedStyle(containing) : null;
        const scaleX = containing && containerBox ? containerBox.width / containing.offsetWidth : 1;
        const scaleY =
          containing && containerBox ? containerBox.height / containing.offsetHeight : 1;
        if (![scaleX, scaleY].every((value) => Number.isFinite(value) && value > 0))
          return unsupported('Containing block has no measurable scale');
        const borderX = containerCss ? finite(containerCss.borderLeftWidth) : 0;
        const borderY = containerCss ? finite(containerCss.borderTopWidth) : 0;
        const width = finite(css.width);
        const height = finite(css.height);
        const paddingX = [
          css.paddingLeft,
          css.paddingRight,
          css.borderLeftWidth,
          css.borderRightWidth,
        ].map(finite);
        const paddingY = [
          css.paddingTop,
          css.paddingBottom,
          css.borderTopWidth,
          css.borderBottomWidth,
        ].map(finite);
        const marginX = finite(css.marginLeft);
        const marginY = finite(css.marginTop);
        if (
          width === null ||
          height === null ||
          borderX === null ||
          borderY === null ||
          marginX === null ||
          marginY === null ||
          paddingX.some((value) => value === null) ||
          paddingY.some((value) => value === null)
        ) {
          return unsupported('Pseudo-element dimensions or offsets are unresolved');
        }
        const boxWidth =
          width +
          (css.boxSizing === 'border-box'
            ? 0
            : paddingX.reduce<number>((sum, value) => sum + (value ?? 0), 0));
        const boxHeight =
          height +
          (css.boxSizing === 'border-box'
            ? 0
            : paddingY.reduce<number>((sum, value) => sum + (value ?? 0), 0));
        if (boxWidth <= 0 || boxHeight <= 0) return null;
        const referenceWidth = containing?.clientWidth ?? innerWidth;
        const referenceHeight = containing?.clientHeight ?? innerHeight;
        const left = finite(css.left);
        const right = finite(css.right);
        const top = finite(css.top);
        const bottom = finite(css.bottom);
        const x = left ?? (right === null ? null : referenceWidth - right - boxWidth);
        const y = top ?? (bottom === null ? null : referenceHeight - bottom - boxHeight);
        if (x === null || y === null)
          return unsupported('Static-position pseudo-element offsets are unresolved');
        const originX = containerBox
          ? containerBox.left + borderX * scaleX
          : css.position === 'fixed'
            ? 0
            : -scrollX;
        const originY = containerBox
          ? containerBox.top + borderY * scaleY
          : css.position === 'fixed'
            ? 0
            : -scrollY;
        return {
          source: pseudo,
          left: originX + (x + marginX) * scaleX,
          top: originY + (y + marginY) * scaleY,
          width: boxWidth * scaleX,
          height: boxHeight * scaleY,
        };
      };
      const hitRegion = (
        region: Region,
        element: HTMLElement,
        proxy: HTMLElement,
        settled: boolean,
        state: 'initial' | 'focus-revealed',
      ): PublicIntegrityReport['targets'][number]['hitRegions'][number] => {
        const left = Math.max(0, region.left);
        const top = Math.max(0, region.top);
        const right = Math.min(innerWidth, region.left + region.width);
        const bottom = Math.min(innerHeight, region.top + region.height);
        const cache = new Map<
          string,
          {
            x: number;
            y: number;
            owned: boolean;
            blocked: boolean;
            topHit: string | null;
            stack: string[];
          }
        >();
        const reference = (hit: Element) =>
          `${hit.tagName.toLowerCase()}${hit.id ? '#' + hit.id : ''}`;
        const owner = (hit: Element | null) => {
          if (!hit) return false;
          if (hit === element || element.contains(hit)) return true;
          if (
            !(proxy instanceof HTMLLabelElement) ||
            proxy.control !== element ||
            !proxy.contains(hit)
          )
            return false;
          const nested = hit.closest(actionable);
          return !nested || nested === element || !proxy.contains(nested);
        };
        const at = (x: number, y: number) => {
          const key = `${x.toFixed(4)},${y.toFixed(4)}`;
          const saved = cache.get(key);
          if (saved) return saved;
          if (cache.size >= 640) throw new Error('Target hit sampling exceeded its bounded budget');
          const hit = document.elementFromPoint(x, y);
          const stack = document.elementsFromPoint(x, y);
          const nested = hit?.closest(actionable);
          const nestedLabelAction =
            proxy instanceof HTMLLabelElement &&
            nested &&
            nested !== element &&
            proxy.contains(nested);
          const result = {
            x,
            y,
            owned: owner(hit),
            blocked: !owner(hit) && !nestedLabelAction && stack.some(owner),
            topHit: hit ? reference(hit) : null,
            stack: stack.map(reference),
          };
          cache.set(key, result);
          return result;
        };
        let maximumSampleGapPx = 0;
        const positions = (start: number, end: number, count: number) => {
          if (end <= start) return [];
          const inset = Math.min(0.01, (end - start) / 4);
          const first = start + inset;
          const last = end - inset;
          const gap = count > 1 ? (last - first) / (count - 1) : 0;
          maximumSampleGapPx = Math.max(maximumSampleGapPx, gap);
          return Array.from({ length: count }, (_, index) => first + index * gap);
        };
        if (right > left && bottom > top) {
          for (const x of positions(left, right, 9)) {
            for (const y of positions(top, bottom, 9)) at(x, y);
          }
        }
        const span = (start: number, end: number, query: (position: number) => boolean) => {
          if (end <= start) return 0;
          const samples = positions(
            start,
            end,
            Math.max(3, Math.min(97, Math.ceil((end - start) / 2) + 1)),
          );
          const values = samples.map(query);
          let longest = 0;
          for (let index = 0; index < samples.length; index += 1) {
            if (!values[index]) continue;
            const first = index;
            while (index + 1 < samples.length && values[index + 1]) index += 1;
            const last = index;
            let low = first === 0 ? start : (samples[first - 1] ?? start);
            let high = samples[first] ?? start;
            while (high - low > 0.02) {
              const middle = (low + high) / 2;
              if (query(middle)) high = middle;
              else low = middle;
            }
            const leading = high;
            low = samples[last] ?? end;
            high = last === samples.length - 1 ? end : (samples[last + 1] ?? end);
            while (high - low > 0.02) {
              const middle = (low + high) / 2;
              if (query(middle)) low = middle;
              else high = middle;
            }
            longest = Math.max(longest, low - leading);
          }
          return longest;
        };
        const hitWidth = span(left, right, (x) => at(x, (top + bottom) / 2).owned);
        const hitHeight = span(top, bottom, (y) => at((left + right) / 2, y).owned);
        const blockedSamples = [...cache.values()].filter((sample) => sample.blocked).length;
        return {
          state,
          source: region.source,
          width: region.width,
          height: region.height,
          hitWidth,
          hitHeight,
          samples: cache.size,
          ownedSamples: [...cache.values()].filter((sample) => sample.owned).length,
          blockedSamples,
          blockedPoints: [...cache.values()]
            .filter((sample) => sample.blocked)
            .slice(0, 24)
            .map(({ x, y, topHit, stack }) => ({ x, y, topHit, stack })),
          maximumSampleGapPx,
          sampledBounds: {
            left,
            top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
          },
          clippedToViewport:
            left > region.left + 0.1 ||
            top > region.top + 0.1 ||
            right < region.left + region.width - 0.1 ||
            bottom < region.top + region.height - 0.1,
          settled,
          verified:
            settled &&
            blockedSamples === 0 &&
            hitWidth + 0.1 >= targetMinimumPx &&
            hitHeight + 0.1 >= targetMinimumPx,
        };
      };
      {
        for (const element of [...document.querySelectorAll<HTMLElement>(actionable)]) {
          if (element.matches(':disabled')) continue;
          const proxies = labelsFor(element);
          if (!rendered(element) && !proxies.length) continue;
          const entry: PublicIntegrityReport['targets'][number] = {
            subject: subject(element),
            keyboard: element.tabIndex >= 0,
            rectangles: [],
            focusReveal: null,
            hitRegions: [],
          };
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const clippedProxyControl =
            proxies.length > 0 &&
            (style.clip !== 'auto' || style.clipPath !== 'none') &&
            box.width <= 1 &&
            box.height <= 1;
          const alternatives = [
            ...(rendered(element) && !clippedProxyControl ? [element] : []),
            ...proxies,
          ];
          if (
            !proxies.length &&
            (style.clip !== 'auto' || style.clipPath !== 'none') &&
            box.width <= 1 &&
            box.height <= 1 &&
            element.tabIndex < 0
          )
            continue;
          targets.push(entry);
          if (alternatives.length > 8) {
            add(
              'target-hit-unmeasurable',
              entry.subject,
              'Too many hit-region proxies to measure within the bounded budget',
            );
            continue;
          }
          const initialFindings: IntegrityFinding[] = [];
          const measure = async (
            alternative: HTMLElement,
            state: 'initial' | 'focus-revealed',
            stateFindings: IntegrityFinding[],
          ) => {
            const addState = (code: string, message: string) =>
              stateFindings.push({ code, subject: entry.subject, message });
            const settled = await settle(alternative, state === 'focus-revealed');
            if (!settled)
              addState(
                'target-layout-unstable',
                'Target did not retain stable geometry for three animation frames',
              );
            const source = alternative === element ? 'element' : 'label';
            const regions: Region[] = [...alternative.getClientRects()]
              .filter((rect) => rect.width > 0 && rect.height > 0)
              .map((rect) => ({
                source,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              }));
            for (const pseudo of ['::before', '::after']) {
              const region = pseudoRegion(alternative, pseudo, entry.subject);
              if (region) regions.push({ ...region, source: source + pseudo });
            }
            if (regions.length > 1) {
              const left = Math.min(...regions.map((region) => region.left));
              const top = Math.min(...regions.map((region) => region.top));
              regions.push({
                source: source + ':union',
                left,
                top,
                width: Math.max(...regions.map((region) => region.left + region.width)) - left,
                height: Math.max(...regions.map((region) => region.top + region.height)) - top,
              });
            }
            if (regions.length > 12) {
              addState(
                'target-hit-unmeasurable',
                'Too many fragmented rectangles to measure within the bounded budget',
              );
              return;
            }
            for (const region of regions) {
              if (![region.left, region.top, region.width, region.height].every(Number.isFinite))
                throw new Error('Target candidate geometry was not finite');
              if (state === 'initial')
                entry.rectangles.push({ width: region.width, height: region.height });
              const hit = hitRegion(region, element, alternative, settled, state);
              entry.hitRegions.push(hit);
              if (!hit.samples)
                addState(
                  'target-sample-missing',
                  `${region.source}: no viewport ownership samples were available`,
                );
              if (hit.blockedSamples > 0)
                addState(
                  'target-occluded',
                  `${region.source}: ${hit.blockedSamples} hit samples were blocked by another element: ${JSON.stringify(hit.blockedPoints.slice(0, 4))}`,
                );
            }
          };
          const fitFindings = (
            state: 'initial' | 'focus-revealed',
            stateFindings: IntegrityFinding[],
          ) => {
            const regions = entry.hitRegions.filter((region) => region.state === state);
            if (!regions.length)
              stateFindings.push({
                code: 'target-sample-missing',
                subject: entry.subject,
                message: 'No hit region measured',
              });
            else if (!regions.some((region) => region.verified))
              stateFindings.push({
                code: 'target-too-small',
                subject: entry.subject,
                message: `No unobstructed hit region reaches ${targetMinimumPx} by ${targetMinimumPx}px on both axes`,
              });
          };
          for (const alternative of alternatives)
            await measure(alternative, 'initial', initialFindings);
          fitFindings('initial', initialFindings);
          const initialPaint = paintState(element);
          if (!entry.keyboard || proxies.length || !initialPaint.reasons.length) {
            findings.push(...initialFindings);
            continue;
          }
          const reveal = {
            reasons: initialPaint.reasons,
            initialFindings,
            focused: false,
            painted: false,
            restored: false,
          };
          entry.focusReveal = reveal;
          const previousFocus = currentFocus();
          const previousRoot = previousFocus?.getRootNode();
          const measuredRoot = element.getRootNode();
          const body = document.body;
          const bodyTabindex = body.getAttribute('tabindex');
          const position = { x: scrollX, y: scrollY };
          const ports = [...document.querySelectorAll<HTMLElement>('*')]
            .filter(
              (port) =>
                port.scrollWidth > port.clientWidth ||
                port.scrollHeight > port.clientHeight ||
                port.scrollLeft !== 0 ||
                port.scrollTop !== 0,
            )
            .map((port) => ({
              element: port,
              root: port.getRootNode(),
              x: port.scrollLeft,
              y: port.scrollTop,
            }));
          const revealFindings: IntegrityFinding[] = [];
          try {
            element.focus({ preventScroll: true });
            reveal.focused = currentFocus() === element;
            await measure(element, 'focus-revealed', revealFindings);
            reveal.focused = currentFocus() === element;
            fitFindings('focus-revealed', revealFindings);
            const focusedPaint = paintState(element);
            const focusedBox = element.getBoundingClientRect();
            reveal.painted =
              reveal.focused &&
              element.isConnected &&
              element.ownerDocument === document &&
              element.getRootNode() === measuredRoot &&
              rendered(element) &&
              !focusedPaint.reasons.length &&
              !focusedPaint.unmeasured.length &&
              focusedBox.right > 0 &&
              focusedBox.bottom > 0 &&
              focusedBox.left < innerWidth &&
              focusedBox.top < innerHeight;
            if (!reveal.painted)
              revealFindings.push({
                code: focusedPaint.unmeasured.length
                  ? 'target-focus-reveal-unmeasured'
                  : 'target-focus-not-revealed',
                subject: entry.subject,
                message: focusedPaint.unmeasured.length
                  ? focusedPaint.unmeasured.join('; ')
                  : 'Keyboard-capable hidden target did not become painted when focused',
              });
          } finally {
            if (
              previousFocus?.isConnected &&
              previousFocus.getRootNode() === previousRoot &&
              'focus' in previousFocus &&
              typeof previousFocus.focus === 'function'
            ) {
              if (previousFocus === body) body.tabIndex = -1;
              previousFocus.focus({ preventScroll: true });
            }
            if (bodyTabindex === null) body.removeAttribute('tabindex');
            else body.setAttribute('tabindex', bodyTabindex);
            for (const port of [...ports].reverse())
              if (port.element.isConnected && port.element.getRootNode() === port.root)
                port.element.scrollTo({ left: port.x, top: port.y, behavior: 'instant' });
            window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
            const restoreStart = performance.now();
            let stable = 0;
            for (let frame = 0; frame < 12; frame += 1) {
              const arrived = await new Promise<boolean>((resolve) => {
                let request = 0;
                const timeout = setTimeout(
                  () => {
                    cancelAnimationFrame(request);
                    resolve(false);
                  },
                  Math.max(0, 1000 - (performance.now() - restoreStart)),
                );
                request = requestAnimationFrame(() => {
                  clearTimeout(timeout);
                  resolve(true);
                });
              });
              if (!arrived) break;
              const restored =
                element.isConnected &&
                element.ownerDocument === document &&
                element.getRootNode() === measuredRoot &&
                currentFocus() === previousFocus &&
                previousFocus?.isConnected &&
                previousFocus.getRootNode() === previousRoot &&
                body === document.body &&
                body.getAttribute('tabindex') === bodyTabindex &&
                Math.abs(scrollX - position.x) <= 0.1 &&
                Math.abs(scrollY - position.y) <= 0.1 &&
                ports.every(
                  (port) =>
                    port.element.isConnected &&
                    port.element.getRootNode() === port.root &&
                    Math.abs(port.element.scrollLeft - port.x) <= 0.1 &&
                    Math.abs(port.element.scrollTop - port.y) <= 0.1,
                ) &&
                JSON.stringify(paintState(element)) === JSON.stringify(initialPaint);
              stable = restored ? stable + 1 : 0;
              if (stable >= 3) break;
            }
            reveal.restored = stable >= 3;
            if (!reveal.restored)
              revealFindings.push({
                code: 'target-focus-reveal-restoration-mismatch',
                subject: entry.subject,
                message:
                  'The target did not restore its prior focus, scrolling and hidden paint state',
              });
          }
          const accepted =
            reveal.focused &&
            reveal.painted &&
            reveal.restored &&
            entry.hitRegions.some((region) => region.state === 'focus-revealed' && region.verified);
          findings.push(
            ...initialFindings.filter(
              (finding) =>
                !accepted ||
                !['target-too-small', 'target-occluded', 'target-sample-missing'].includes(
                  finding.code,
                ),
            ),
          );
          findings.push(...revealFindings);
          if (!accepted && !revealFindings.length)
            add(
              'target-too-small',
              entry.subject,
              `No unobstructed hit region reaches ${targetMinimumPx} by ${targetMinimumPx}px on both axes`,
            );
        }
      }
      if (!targets.length)
        add('target-samples-missing', 'targets', 'No rendered actionable target was measured');
      return {
        url: location.href,
        targetMinimumPx,
        metadata,
        headings,
        landmarks,
        targets,
        findings,
        limits: [
          'Metadata checks do not fetch share-image resources or judge copy unless expected values are supplied.',
          'One primary image declaration is required; multiple Open Graph image candidates need an explicit policy review.',
          'Hit regions use bounded browser ownership samples and measured axis runs, not every pixel or an activated click.',
          'Finite hit samples can miss a smaller obstruction between points; each region reports its maximum grid gap and viewport intersection.',
          'CSS pseudo-element expansion is measured for resolved absolute/fixed boxes; transformed or unresolved pseudo boxes produce findings.',
          'Keyboard-capable targets fully hidden by exact zero opacity or empty inset/rect clipping receive an additional focused hit measurement; the original state remains in the report.',
          'A focused measurement requires painted, unobstructed hit regions at the same size floor and verified local restoration; it does not replace the separate sequential keyboard traversal.',
          'Unresolved opacity, masks and non-none filters leave focused paint unmeasured; a detached or root-moved target cannot verify restoration.',
          'Nonempty or unresolved clipping cannot qualify a target for focus reveal solely from its border box, because descendants or pseudo-elements may paint outside that box.',
          'Restoration is verified over twelve bounded frames within the document and observable open shadow roots; later application side effects cannot be undone.',
          'Closed shadow roots and embedded documents are not traversed.',
          'The caller must settle asynchronous route content before this point-in-time DOM measurement.',
        ],
      };
    }, options),
  );
}

export interface PublicFocusReport {
  restoration: PublicRestorationReport;
  targetCount: number;
  samples: { subject: string; indicator: string[]; visible: boolean; focusVisible: boolean }[];
  findings: IntegrityFinding[];
  limits: string[];
}

export async function measurePublicKeyboardFocus(page: Page): Promise<PublicFocusReport> {
  return withPublicInteractionRestoration(page, async () => {
    const state = await page.evaluateHandle(() => {
      const rendered = (element: HTMLElement) => {
        if (
          element.closest('[hidden],[inert],[aria-hidden="true"]') ||
          element.matches(':disabled')
        )
          return false;
        const style = getComputedStyle(element);
        return (
          style.display !== 'none' &&
          !['hidden', 'collapse'].includes(style.visibility) &&
          element.getClientRects().length > 0
        );
      };
      const bodyTabindex = document.body.getAttribute('tabindex');
      document.body.tabIndex = -1;
      document.body.focus({ preventScroll: true });
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable="true"]',
        ),
      ].filter((element) => element.tabIndex >= 0 && rendered(element));
      const capture = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        return {
          boxShadow: style.boxShadow,
          backgroundColor: style.backgroundColor,
          color: style.color,
          textDecoration: style.textDecorationLine,
          outline: [
            style.outlineWidth,
            style.outlineStyle,
            style.outlineColor,
            style.outlineOffset,
          ],
          borders: ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({
            width: style.getPropertyValue(`border-${side.toLowerCase()}-width`),
            color: style.getPropertyValue(`border-${side.toLowerCase()}-color`),
          })),
        };
      };
      return {
        bodyTabindex,
        targets,
        baseline: targets.map(capture),
        url: location.href,
      };
    });
    const findings: IntegrityFinding[] = [];
    const samples: PublicFocusReport['samples'] = [];
    const seen = new Set<number>();
    try {
      const targetCount = await state.evaluate((snapshot) => snapshot.targets.length);
      if (!targetCount)
        findings.push({
          code: 'keyboard-samples-missing',
          subject: 'keyboard',
          message: 'No sequential keyboard target found',
        });
      for (let step = 0; step < targetCount + 2; step += 1) {
        if (seen.size === targetCount) break;
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);
        const sample = await state.evaluate((snapshot) => {
          if (location.href !== snapshot.url)
            throw new Error('Page navigated during keyboard measurement');
          const element = document.activeElement;
          if (!(element instanceof HTMLElement))
            throw new Error('Keyboard focus has no HTML element');
          const index = snapshot.targets.indexOf(element);
          if (index < 0)
            return {
              index,
              subject: element.tagName.toLowerCase(),
              indicator: [] as string[],
              visible: false,
              focusVisible: false,
            };
          const baseline = snapshot.baseline[index];
          if (!baseline || !element.isConnected) throw new Error('Keyboard target sample was lost');
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const surface = document.createElement('canvas');
          surface.width = surface.height = 1;
          const pen = surface.getContext('2d');
          if (!pen) throw new Error('Focus color measurement has no canvas context');
          const opaque = (color: string) => {
            pen.clearRect(0, 0, 1, 1);
            pen.fillStyle = color;
            pen.fillRect(0, 0, 1, 1);
            return (pen.getImageData(0, 0, 1, 1).data[3] ?? 0) > 0;
          };
          const indicator: string[] = [];
          const outline = [
            style.outlineWidth,
            style.outlineStyle,
            style.outlineColor,
            style.outlineOffset,
          ];
          if (
            parseFloat(style.outlineWidth) > 0 &&
            !['none', 'hidden'].includes(style.outlineStyle) &&
            opaque(style.outlineColor) &&
            outline.some((value, position) => value !== baseline.outline[position])
          )
            indicator.push('outline');
          const shadowColors =
            style.boxShadow.match(/(?:rgba?|color|oklch|oklab|lab|lch|hsla?)\([^)]*\)/g) ?? [];
          if (
            style.boxShadow !== 'none' &&
            style.boxShadow !== baseline.boxShadow &&
            shadowColors.some(opaque)
          )
            indicator.push('box-shadow-change');
          if (style.backgroundColor !== baseline.backgroundColor && opaque(style.backgroundColor))
            indicator.push('background-change');
          if (style.color !== baseline.color && opaque(style.color))
            indicator.push('text-color-change');
          if (
            style.textDecorationLine !== baseline.textDecoration &&
            style.textDecorationLine !== 'none'
          )
            indicator.push('text-decoration-change');
          ['top', 'right', 'bottom', 'left'].forEach((side, position) => {
            const width = style.getPropertyValue(`border-${side}-width`);
            const color = style.getPropertyValue(`border-${side}-color`);
            const before = baseline.borders[position];
            if (
              before &&
              parseFloat(width) > 0 &&
              opaque(color) &&
              (width !== before.width || color !== before.color)
            )
              indicator.push(`border-${side}-change`);
          });
          const x =
            Math.max(0, box.left) + Math.min(box.width, innerWidth - Math.max(0, box.left)) / 2;
          const y =
            Math.max(0, box.top) + Math.min(box.height, innerHeight - Math.max(0, box.top)) / 2;
          const hit = document.elementFromPoint(x, y);
          let painted = true;
          for (let node: Element | null = element; node; node = node.parentElement) {
            const css = getComputedStyle(node);
            if (Number(css.opacity) === 0 || css.visibility !== 'visible' || css.display === 'none')
              painted = false;
          }
          const visible =
            painted &&
            box.width > 0 &&
            box.height > 0 &&
            box.bottom > 0 &&
            box.right > 0 &&
            box.top < innerHeight &&
            box.left < innerWidth &&
            hit !== null &&
            (element.contains(hit) || hit === element);
          return {
            index,
            subject: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} ${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 120)}`,
            indicator,
            visible,
            focusVisible: element.matches(':focus-visible'),
          };
        });
        if (sample.index < 0) {
          findings.push({
            code: 'keyboard-target-unexpected',
            subject: sample.subject,
            message: 'Focused element was absent from the initial target sample',
          });
          continue;
        }
        if (seen.has(sample.index)) break;
        seen.add(sample.index);
        samples.push({
          subject: sample.subject,
          indicator: sample.indicator,
          visible: sample.visible,
          focusVisible: sample.focusVisible,
        });
        if (!sample.visible)
          findings.push({
            code: 'keyboard-focus-not-visible',
            subject: sample.subject,
            message: 'Focused target is clipped, outside the viewport or covered',
          });
        if (!sample.focusVisible || !sample.indicator.length)
          findings.push({
            code: 'keyboard-indicator-missing',
            subject: sample.subject,
            message: 'No measurable visible keyboard-focus indicator',
          });
      }
      if (seen.size !== targetCount)
        findings.push({
          code: 'keyboard-sampling-incomplete',
          subject: 'keyboard',
          message: `Measured ${seen.size} of ${targetCount} sequential targets`,
        });
      return {
        targetCount,
        samples,
        findings,
        limits: [
          'Computed focus-style changes are a heuristic, not proof of indicator contrast or visual clarity.',
          'Only sequential Tab targets are measured; roving arrow-key controls require their own interaction tests.',
          'Tab handlers can change page state; restoration is verified over twelve bounded frames in the document and observable open shadow roots, not later application effects.',
          'Closed shadow roots and embedded documents are excluded from restoration scope; opaque focused custom elements produce an unmeasured finding.',
        ],
      };
    } finally {
      await state.evaluate((snapshot) => {
        if (snapshot.bodyTabindex === null) document.body.removeAttribute('tabindex');
        else document.body.setAttribute('tabindex', snapshot.bodyTabindex);
      });
      await state.dispose();
    }
  });
}

export interface PublicMotionOptions {
  durationMs?: number;
  sampleCount?: number;
}

export interface PublicMotionReport {
  reducedMotion: boolean;
  samples: number;
  sampleTimesMs: number[];
  observedDurationMs: number;
  elementCount: number;
  animationCount: number;
  findings: IntegrityFinding[];
  limits: string[];
}

export async function measurePublicReducedMotion(
  page: Page,
  options: PublicMotionOptions = {},
): Promise<PublicMotionReport> {
  const settings = { durationMs: options.durationMs ?? 500, sampleCount: options.sampleCount ?? 5 };
  if (
    !Number.isFinite(settings.durationMs) ||
    settings.durationMs < 100 ||
    !Number.isInteger(settings.sampleCount) ||
    settings.sampleCount < 3
  ) {
    throw new Error('Motion measurement needs at least 100ms and three samples');
  }
  return page.evaluate(async (config): Promise<PublicMotionReport> => {
    const findings: IntegrityFinding[] = [];
    const recorded = new Set<string>();
    const add = (code: string, subject: string, message: string) => {
      const key = `${code}|${subject}|${message}`;
      if (!recorded.has(key)) {
        recorded.add(key);
        findings.push({ code, subject, message });
      }
    };
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return (
        style.display !== 'none' &&
        !['hidden', 'collapse'].includes(style.visibility) &&
        [...element.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0)
      );
    };
    const subject = (element: Element, index: number) =>
      `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}[sample=${index}]`;
    const milliseconds = (value: string, allowNegative = false) =>
      value.split(',').map((part) => {
        const trimmed = part.trim();
        const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(ms|s)$/.exec(trimmed);
        if (!match) throw new Error(`Unmeasurable CSS duration ${trimmed}`);
        const number = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
        if (!Number.isFinite(number) || (!allowNegative && number < 0))
          throw new Error(`Unmeasurable CSS duration ${trimmed}`);
        return number;
      });
    const baseline = new Map<Element, { subject: string; values: number[]; styles: string[] }>();
    const animationIds = new Map<Animation, number>();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion)
      add(
        'reduced-motion-not-enabled',
        'media',
        'Caller must enable reduced motion before measuring',
      );
    await document.fonts.ready;
    const initial = {
      url: location.href,
      width: innerWidth,
      height: innerHeight,
      x: scrollX,
      y: scrollY,
    };
    const started = performance.now();
    let samples = 0;
    const sampleTimesMs: number[] = [];
    let elementCount = 0;
    const sample = () => {
      if (location.href !== initial.url)
        add('motion-document-changed', 'document', 'Location changed during measurement');
      if (innerWidth !== initial.width || innerHeight !== initial.height)
        add('motion-viewport-changed', 'viewport', 'Viewport changed during measurement');
      if (scrollX !== initial.x || scrollY !== initial.y)
        add('motion-scroll-changed', 'viewport', 'Window scroll changed during measurement');
      if (matchMedia('(prefers-reduced-motion: reduce)').matches !== reducedMotion)
        add(
          'motion-media-changed',
          'media',
          'Reduced-motion preference changed during measurement',
        );
      const elements = [...document.querySelectorAll('body,body *')].filter(visible);
      if (!elements.length)
        add('motion-samples-missing', 'document', 'No rendered element sampled');
      elementCount = Math.max(elementCount, elements.length);
      const current = new Set(elements);
      for (const [element, previous] of baseline) {
        if (!current.has(element))
          add(
            'motion-sample-lost',
            previous.subject,
            'Previously measured element disappeared or became unrendered',
          );
      }
      elements.forEach((element, index) => {
        const name = baseline.get(element)?.subject ?? subject(element, index);
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const values = [box.x, box.y, box.width, box.height];
        if (values.some((value) => !Number.isFinite(value)))
          throw new Error(`Non-finite geometry for ${name}`);
        const styles = [style.transform, style.translate, style.rotate, style.scale, style.opacity];
        for (const pseudo of ['', '::before', '::after']) {
          const css = pseudo ? getComputedStyle(element, pseudo) : style;
          if (pseudo && ['none', 'normal'].includes(css.content)) continue;
          if (
            css.animationName.split(',').some((value) => value.trim() !== 'none') &&
            (milliseconds(css.animationDuration).some((value) => value > 0) ||
              milliseconds(css.animationDelay, true).some((value) => value > 0))
          ) {
            add(
              'reduced-motion-css-animation',
              name + pseudo,
              `${css.animationName}: duration ${css.animationDuration}, delay ${css.animationDelay}`,
            );
          }
          if (
            css.transitionProperty.split(',').some((value) => value.trim() !== 'none') &&
            milliseconds(css.transitionDuration).some((value) => value > 0)
          ) {
            add(
              'reduced-motion-css-transition',
              name + pseudo,
              `${css.transitionProperty}: duration ${css.transitionDuration}`,
            );
          }
          if (pseudo) styles.push(css.transform, css.translate, css.rotate, css.scale, css.opacity);
        }
        const previous = baseline.get(element);
        if (previous) {
          if (
            values.some(
              (value, position) =>
                Math.abs(value - (previous.values[position] ?? Number.NaN)) > 0.25,
            )
          )
            add(
              'reduced-motion-geometry-change',
              name,
              'Position or dimensions changed by more than 0.25px',
            );
          if (styles.some((value, position) => value !== previous.styles[position]))
            add(
              'reduced-motion-style-change',
              name,
              'Transform, individual transform or opacity changed',
            );
        } else {
          if (samples > 0)
            add('motion-sample-added', name, 'Rendered element appeared after the first sample');
          baseline.set(element, { subject: name, values, styles });
        }
      });
      for (const animation of document.getAnimations()) {
        if (!animationIds.has(animation)) animationIds.set(animation, animationIds.size);
        const effect = animation.effect;
        if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof Element)) {
          add(
            'motion-animation-unmeasurable',
            `animation ${animationIds.get(animation)}`,
            'Animation has no measurable DOM target',
          );
          continue;
        }
        if (visible(effect.target) && (animation.playState === 'running' || animation.pending)) {
          add(
            'reduced-motion-waapi-active',
            subject(effect.target, elements.indexOf(effect.target)),
            `Animation ${animationIds.get(animation)} is ${animation.pending ? 'pending' : animation.playState}`,
          );
        }
      }
      samples += 1;
      sampleTimesMs.push(performance.now() - started);
    };
    for (let index = 0; index < config.sampleCount; index += 1) {
      if (index > 0)
        await new Promise<void>((resolve) =>
          setTimeout(resolve, config.durationMs / (config.sampleCount - 1)),
        );
      sample();
    }
    const observedDurationMs = performance.now() - started;
    if (samples !== config.sampleCount || observedDurationMs < config.durationMs - 1)
      add(
        'motion-sampling-incomplete',
        'sampling',
        `Measured ${samples} samples over ${observedDurationMs}ms`,
      );
    return {
      reducedMotion,
      samples,
      sampleTimesMs,
      observedDurationMs,
      elementCount,
      animationCount: animationIds.size,
      findings,
      limits: [
        'The bounded observation cannot prove absence of later JavaScript motion or untriggered interactions.',
        'Transitions with positive duration are reported even when dormant; interaction callers should trigger controls and measure again.',
        'Geometry and style sampling does not measure canvas, video frames, animated image pixels or closed shadow roots.',
      ],
    };
  }, settings);
}
