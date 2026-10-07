import type { Locator } from '@playwright/test';
import type { measurePublicFontProof } from './public-page-readiness';
import type { PublicTypographyReport, PublicTypographyRect } from './public-typography';

type BarOwnerKind = 'title' | 'badge';
type BarScope = NonNullable<PublicTypographyReport['scope']>;

export type PublicWindowBarSourceContract = {
  scope: BarScope;
  owners: {
    kind: BarOwnerKind;
    elementIndex: number;
    text: string;
    nodeTexts: string[];
  }[];
};

export type PublicWindowBarKind = 'artifact' | 'project';

function windowFigure(kind: PublicWindowBarKind) {
  if (kind === 'artifact')
    return {
      kind,
      name: 'Artifact',
      selector: 'figure.agi-artifact-responsive',
      otherSelector: 'figure.agi-project-responsive',
    };
  if (kind === 'project')
    return {
      kind,
      name: 'Project',
      selector: 'figure.agi-project-responsive',
      otherSelector: 'figure.agi-artifact-responsive',
    };
  throw new Error('Window bar requires a known Artifact or Project figure kind');
}

function assertBarScope(scope: BarScope) {
  if (
    !scope ||
    typeof scope !== 'object' ||
    typeof scope.selector !== 'string' ||
    !scope.selector.trim() ||
    !Number.isInteger(scope.elementIndex) ||
    scope.elementIndex < 0 ||
    scope.tag !== 'figure' ||
    typeof scope.label !== 'string' ||
    !scope.label.trim()
  )
    throw new Error('Window bar requires an explicit current labelled figure scope');
}

function assertBarContract(contract: PublicWindowBarSourceContract) {
  if (!contract || typeof contract !== 'object')
    throw new Error('Window bar requires an explicit bound source contract');
  assertBarScope(contract.scope);
  if (
    !Array.isArray(contract.owners) ||
    contract.owners.length !== 2 ||
    contract.owners.some(
      (owner, index) =>
        !owner ||
        typeof owner !== 'object' ||
        owner.kind !== (index === 0 ? 'title' : 'badge') ||
        !Number.isInteger(owner.elementIndex) ||
        owner.elementIndex < 0 ||
        typeof owner.text !== 'string' ||
        !owner.text.trim() ||
        !Array.isArray(owner.nodeTexts) ||
        !owner.nodeTexts.length ||
        owner.nodeTexts.some((text) => typeof text !== 'string') ||
        owner.nodeTexts.join('') !== owner.text,
    ) ||
    new Set(contract.owners.map((owner) => owner.elementIndex)).size !== 2
  )
    throw new Error('Window bar requires distinct bound title and badge sources');
}

export async function bindPublicWindowBarSources(
  frame: Locator,
  scope: BarScope,
  kind: PublicWindowBarKind,
) {
  const figure = windowFigure(kind);
  assertBarScope(scope);
  const contract = await frame.evaluate(
    (root, inputs): PublicWindowBarSourceContract => {
      const expected = inputs.scope;
      const allElements = [...document.querySelectorAll('*')];
      if (
        !root.isConnected ||
        document.querySelectorAll(expected.selector).length !== 1 ||
        document.querySelector(expected.selector) !== root ||
        allElements.indexOf(root) !== expected.elementIndex ||
        root.localName !== expected.tag ||
        root.getAttribute('aria-label') !== expected.label ||
        !root.matches(inputs.figure.selector) ||
        root.matches(inputs.figure.otherSelector)
      )
        throw new Error(
          `${inputs.figure.name} bar source needs the exact current ${inputs.figure.name} figure`,
        );
      const bars = root.querySelectorAll(':scope > .agi-dev-shell > .agi-dev-bar');
      if (bars.length !== 1)
        throw new Error(`${inputs.figure.name} requires one direct window bar`);
      const bar = bars[0]!;
      const owners = (['title', 'badge'] as const).map((kind) => {
        const matches = bar.querySelectorAll(`:scope > .agi-dev-${kind}`);
        if (matches.length !== 1 || matches[0]!.localName !== 'span')
          throw new Error(`${inputs.figure.name} requires its direct ${kind} source span`);
        const owner = matches[0]!;
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
        const nodeTexts: string[] = [];
        while (walker.nextNode()) nodeTexts.push((walker.currentNode as Text).data);
        const text = nodeTexts.join('');
        if (!text.trim()) throw new Error(`${inputs.figure.name} ${kind} source is empty`);
        return { kind, elementIndex: allElements.indexOf(owner), text, nodeTexts };
      });
      const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (
          node.data.trim() &&
          !owners.some((owner) => allElements[owner.elementIndex]?.contains(node))
        )
          throw new Error(`${inputs.figure.name} bar has an unbound text source`);
      }
      return { scope: expected, owners };
    },
    { scope, figure },
  );
  assertBarContract(contract);
  return contract;
}

export async function measurePublicWindowBarWords(
  frame: Locator,
  contract: PublicWindowBarSourceContract,
  canonicalInput: unknown,
  fontProofInput: unknown,
  kind: PublicWindowBarKind,
) {
  const figure = windowFigure(kind);
  assertBarContract(contract);
  return frame.evaluate(
    (root, inputs) => {
      const issue = (suffix: string) => `${inputs.figure.kind}-bar-${suffix}`;
      type Issue = {
        kind: string;
        owner?: BarOwnerKind;
        sourceKey?: string;
        text?: string;
        detail?: string;
      };
      type Glyph = {
        start: number;
        end: number;
        text: string;
        rects: PublicTypographyRect[];
      };
      const findings: Issue[] = [];
      const unmeasured: Issue[] = [];
      const owners: {
        kind: BarOwnerKind;
        elementIndex: number;
        text: string;
        nodeTexts: string[];
        sourceKeys: string[];
        glyphs: Glyph[];
        words: {
          start: number;
          end: number;
          text: string;
          rects: PublicTypographyRect[];
          bands: number;
        }[];
      }[] = [];
      const coverage = {
        expectedOwners: inputs.contract.owners.length,
        measuredOwners: 0,
        expectedTextNodes: inputs.contract.owners.reduce(
          (total, owner) => total + owner.nodeTexts.filter((text) => text.trim()).length,
          0,
        ),
        measuredTextNodes: 0,
        expectedSourceUnits: inputs.contract.owners.reduce(
          (total, owner) => total + owner.text.length,
          0,
        ),
        mappedSourceUnits: 0,
        expectedPaintedGraphemes: 0,
        measuredPaintedGraphemes: 0,
        expectedWords: 0,
        discoveredWords: 0,
        measuredWords: 0,
      };
      const finish = () => ({ contract: inputs.contract, owners, coverage, findings, unmeasured });
      const box = (rect: DOMRect): PublicTypographyRect => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      const valid = (rect: PublicTypographyRect) =>
        Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0;
      const within = (rect: PublicTypographyRect, bounds: PublicTypographyRect) =>
        rect.left >= bounds.left &&
        rect.right <= bounds.right &&
        rect.top >= bounds.top &&
        rect.bottom <= bounds.bottom;
      const firstFamily = (value: string) =>
        (value.split(',')[0] ?? '')
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .toLowerCase();
      const canonical = inputs.canonicalInput as Partial<PublicTypographyReport> | null;
      const fonts = inputs.fontProofInput as Partial<
        Awaited<ReturnType<typeof measurePublicFontProof>>
      > | null;
      const scope = inputs.contract.scope;
      const allElements = [...document.querySelectorAll('*')];
      if (
        !root.isConnected ||
        !document.body.contains(root) ||
        document.querySelectorAll(scope.selector).length !== 1 ||
        document.querySelector(scope.selector) !== root ||
        allElements.indexOf(root) !== scope.elementIndex ||
        root.localName !== scope.tag ||
        root.getAttribute('aria-label') !== scope.label ||
        !root.matches(inputs.figure.selector) ||
        root.matches(inputs.figure.otherSelector) ||
        canonical?.scope?.selector !== scope.selector ||
        canonical.scope.elementIndex !== scope.elementIndex ||
        canonical.scope.tag !== scope.tag ||
        canonical.scope.label !== scope.label
      ) {
        unmeasured.push({ kind: issue('current-scope-mismatch') });
        return finish();
      }
      if (
        !Array.isArray(canonical?.samples) ||
        !Array.isArray(canonical.findings) ||
        !Array.isArray(canonical.unmeasured) ||
        !Array.isArray(canonical.excluded) ||
        !Array.isArray(fonts?.expectedFontProof) ||
        !Array.isArray(fonts.usedFontFamilies)
      ) {
        unmeasured.push({ kind: issue('canonical-or-font-proof-missing') });
        return finish();
      }
      if (!/^en(?:-|$)/i.test(document.documentElement.lang)) {
        unmeasured.push({ kind: issue('language-unmeasured') });
        return finish();
      }
      if (document.fonts.status !== 'loaded') {
        unmeasured.push({ kind: issue('fonts-not-settled') });
        return finish();
      }
      const family = firstFamily(getComputedStyle(root).getPropertyValue('--font-geist-mono'));
      const proofs = fonts.expectedFontProof.filter((font) => firstFamily(font.family) === family);
      const usedFonts = fonts.usedFontFamilies.filter(
        (font) => firstFamily(font.family) === family,
      );
      if (
        !family ||
        proofs.length !== 1 ||
        usedFonts.length !== 1 ||
        !proofs.every(
          (proof) =>
            Number.isInteger(proof.usedTextNodes) &&
            proof.usedTextNodes > 0 &&
            Number.isInteger(proof.requests) &&
            proof.requests > 0 &&
            proof.matchedRequests === proof.requests,
        ) ||
        ![...document.fonts].some(
          (face) => firstFamily(face.family) === family && face.status === 'loaded',
        )
      ) {
        unmeasured.push({ kind: issue('loaded-mono-proof-missing') });
        return finish();
      }
      const bars = root.querySelectorAll(':scope > .agi-dev-shell > .agi-dev-bar');
      if (bars.length !== 1) {
        findings.push({ kind: issue('direct-owner-missing') });
        return finish();
      }
      const bar = bars[0] as HTMLElement;
      const barRect = box(bar.getBoundingClientRect());
      const barStyle = getComputedStyle(bar);
      const contentRect = {
        left:
          barRect.left + parseFloat(barStyle.borderLeftWidth) + parseFloat(barStyle.paddingLeft),
        top: barRect.top + parseFloat(barStyle.borderTopWidth) + parseFloat(barStyle.paddingTop),
        right:
          barRect.right - parseFloat(barStyle.borderRightWidth) - parseFloat(barStyle.paddingRight),
        bottom:
          barRect.bottom -
          parseFloat(barStyle.borderBottomWidth) -
          parseFloat(barStyle.paddingBottom),
        width: 0,
        height: 0,
      };
      contentRect.width = contentRect.right - contentRect.left;
      contentRect.height = contentRect.bottom - contentRect.top;
      const frameRect = box(root.getBoundingClientRect());
      const viewport = {
        left: 0,
        top: 0,
        right: innerWidth,
        bottom: innerHeight,
        width: innerWidth,
        height: innerHeight,
      };
      if (!valid(barRect) || !valid(contentRect) || !valid(frameRect))
        unmeasured.push({ kind: issue('container-geometry-unmeasured') });
      const sampleByKey = new Map(
        canonical.samples
          .filter((sample) => sample.kind === 'text')
          .map((sample) => [sample.sourceKey, sample]),
      );
      if (sampleByKey.size !== canonical.samples.filter((sample) => sample.kind === 'text').length)
        unmeasured.push({ kind: issue('canonical-source-key-duplicate') });
      const keys = new WeakMap<Text, string>();
      const sourceWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let sourceIndex = 0;
      while (sourceWalker.nextNode()) {
        const node = sourceWalker.currentNode as Text;
        if (
          !node.parentElement ||
          node.parentElement.closest('script,style,noscript,textarea,option') ||
          !node.data.trim()
        )
          continue;
        keys.set(node, `text:${++sourceIndex}`);
      }
      const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
      const glyphSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const wordRuns = (value: string) =>
        [...wordSegmenter.segment(value)].flatMap((word) =>
          word.isWordLike
            ? [...word.segment.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu)].map(
                (match) => ({ index: word.index + match.index!, segment: match[0] }),
              )
            : [],
        );
      for (const child of bar.querySelectorAll('*')) {
        const rect = box(child.getBoundingClientRect());
        if (!valid(rect) || !within(rect, barRect))
          findings.push({ kind: issue('child-outside-bar'), detail: child.localName });
      }
      for (const expected of inputs.contract.owners) {
        coverage.expectedPaintedGraphemes += [...glyphSegmenter.segment(expected.text)].filter(
          (glyph) => glyph.segment.trim(),
        ).length;
        coverage.expectedWords += wordRuns(expected.text).length;
        const matches = bar.querySelectorAll(`:scope > .agi-dev-${expected.kind}`);
        if (matches.length !== 1 || matches[0]!.localName !== 'span') {
          findings.push({ kind: issue('source-owner-missing'), owner: expected.kind });
          continue;
        }
        const owner = matches[0]!;
        const pieces: { node: Text; start: number; end: number }[] = [];
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
        let text = '';
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const start = text.length;
          text += node.data;
          pieces.push({ node, start, end: text.length });
        }
        const nodeTexts = pieces.map((piece) => piece.node.data);
        if (
          allElements.indexOf(owner) !== expected.elementIndex ||
          text !== expected.text ||
          JSON.stringify(nodeTexts) !== JSON.stringify(expected.nodeTexts)
        ) {
          findings.push({ kind: issue('bound-source-changed'), owner: expected.kind });
          continue;
        }
        coverage.measuredOwners += 1;
        const reading: (typeof owners)[number] = {
          kind: expected.kind,
          elementIndex: expected.elementIndex,
          text,
          nodeTexts,
          sourceKeys: [],
          glyphs: [],
          words: [],
        };
        owners.push(reading);
        const ancestry = [];
        for (let element: Element | null = owner; element; element = element.parentElement) {
          const css = getComputedStyle(element);
          ancestry.push({ element, css });
          if (css.columnCount !== 'auto' || css.columnWidth !== 'auto')
            unmeasured.push({
              kind: issue('multicolumn-source-unmeasured'),
              owner: expected.kind,
            });
          if (
            element.hasAttribute('hidden') ||
            css.display === 'none' ||
            ['hidden', 'collapse'].includes(css.visibility) ||
            css.contentVisibility === 'hidden' ||
            Number(css.opacity) === 0
          )
            findings.push({ kind: issue('hidden-source'), owner: expected.kind });
          if (
            root.contains(element) &&
            (css.writingMode !== 'horizontal-tb' ||
              css.transform !== 'none' ||
              css.translate !== 'none' ||
              css.rotate !== 'none' ||
              css.scale !== 'none' ||
              !['', 'normal', '1'].includes(css.getPropertyValue('zoom')))
          )
            unmeasured.push({ kind: issue('transformed-source'), owner: expected.kind });
        }
        if (!within(box(owner.getBoundingClientRect()), barRect))
          findings.push({ kind: issue('owner-outside-bar'), owner: expected.kind });
        for (const piece of pieces) {
          coverage.mappedSourceUnits += piece.node.data.length;
          if (!piece.node.data.trim()) continue;
          const sourceKey = keys.get(piece.node);
          const sample = sourceKey ? sampleByKey.get(sourceKey) : null;
          const css = getComputedStyle(piece.node.parentElement!);
          const fullRange = document.createRange();
          fullRange.selectNodeContents(piece.node);
          const rects = [...fullRange.getClientRects()]
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map(box);
          const request = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${JSON.stringify(family)}`;
          const points = [...piece.node.data]
            .filter((glyph) => glyph.trim())
            .map((glyph) => glyph.codePointAt(0)!);
          const glyphProof = usedFonts[0]!.requests.find((entry) => entry.font === request);
          if (
            !sourceKey ||
            !sample ||
            sample.text !== piece.node.data.replace(/\s+/g, ' ').trim() ||
            sample.fontFamily !== css.fontFamily ||
            firstFamily(css.fontFamily) !== family ||
            !sample.mono ||
            sample.scaleX !== 1 ||
            sample.scaleY !== 1 ||
            sample.renderedSize !== sample.declaredSize ||
            sample.paintUnmeasured.length ||
            sample.cumulativeOpacity !== 1 ||
            !sample.foreground ||
            sample.foreground.a === 0 ||
            !rects.length ||
            JSON.stringify(sample.rects) !== JSON.stringify(rects) ||
            !glyphProof ||
            points.some(
              (point) =>
                !glyphProof.codepoints.includes(point) ||
                glyphProof.uncoveredCodepoints.includes(point),
            ) ||
            !document.fonts.check(request, piece.node.data)
          ) {
            unmeasured.push({
              kind: issue('source-not-proven'),
              owner: expected.kind,
              ...(sourceKey ? { sourceKey } : {}),
            });
          } else {
            coverage.measuredTextNodes += 1;
            reading.sourceKeys.push(sourceKey);
          }
        }
        for (const glyph of glyphSegmenter.segment(text)) {
          const start = glyph.index;
          const end = start + glyph.segment.length;
          if (!glyph.segment.trim()) continue;
          const mapped = pieces.filter((piece) => piece.start < end && piece.end > start);
          if (
            !mapped.length ||
            mapped.reduce(
              (sum, piece) => sum + Math.min(end, piece.end) - Math.max(start, piece.start),
              0,
            ) !==
              end - start
          ) {
            unmeasured.push({
              kind: issue('grapheme-range-incomplete'),
              owner: expected.kind,
              text: glyph.segment,
            });
            continue;
          }
          const range = document.createRange();
          const first = mapped[0]!;
          const last = mapped.at(-1)!;
          range.setStart(first.node, start - first.start);
          range.setEnd(last.node, end - last.start);
          const rects = [...range.getClientRects()]
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map(box);
          reading.glyphs.push({ start, end, text: glyph.segment, rects });
          if (!rects.length || rects.some((rect) => !valid(rect))) {
            unmeasured.push({
              kind: issue('grapheme-unmeasured'),
              owner: expected.kind,
              text: glyph.segment,
            });
            continue;
          }
          const issuesBefore = findings.length + unmeasured.length;
          for (const rect of rects) {
            if (!within(rect, contentRect) || !within(rect, frameRect))
              findings.push({
                kind: issue('grapheme-outside-owner'),
                owner: expected.kind,
                text: glyph.segment,
              });
            if (!within(rect, viewport))
              unmeasured.push({
                kind: issue('grapheme-outside-viewport'),
                owner: expected.kind,
                text: glyph.segment,
              });
            for (const { element, css } of ancestry) {
              const bounds = element.getBoundingClientRect();
              const clip = {
                left: bounds.left + element.clientLeft,
                top: bounds.top + element.clientTop,
                right: bounds.left + element.clientLeft + element.clientWidth,
                bottom: bounds.top + element.clientTop + element.clientHeight,
              };
              if (
                (css.overflowX !== 'visible' &&
                  (rect.left < clip.left || rect.right > clip.right)) ||
                (css.overflowY !== 'visible' && (rect.top < clip.top || rect.bottom > clip.bottom))
              )
                findings.push({
                  kind: issue('grapheme-clipped'),
                  owner: expected.kind,
                  text: glyph.segment,
                });
              if (css.clipPath !== 'none' || css.clip !== 'auto' || css.maskImage !== 'none')
                unmeasured.push({
                  kind: issue('nonrectangular-paint'),
                  owner: expected.kind,
                  text: glyph.segment,
                });
            }
            const hit = document.elementFromPoint(
              (rect.left + rect.right) / 2,
              (rect.top + rect.bottom) / 2,
            );
            if (!hit || !bar.contains(hit) || !(owner.contains(hit) || hit.contains(owner)))
              unmeasured.push({
                kind: issue('grapheme-paint-unresolved'),
                owner: expected.kind,
                text: glyph.segment,
              });
          }
          if (
            findings.length + unmeasured.length === issuesBefore &&
            reading.sourceKeys.length === pieces.filter((piece) => piece.node.data.trim()).length &&
            ancestry.every(
              ({ element, css }) =>
                !element.hasAttribute('hidden') &&
                css.display !== 'none' &&
                !['hidden', 'collapse'].includes(css.visibility) &&
                css.contentVisibility !== 'hidden' &&
                Number(css.opacity) > 0,
            )
          )
            coverage.measuredPaintedGraphemes += 1;
        }
        for (const word of wordRuns(text)) {
          coverage.discoveredWords += 1;
          const start = word.index;
          const end = start + word.segment.length;
          const glyphs = reading.glyphs.filter((glyph) => glyph.start >= start && glyph.end <= end);
          const rects = glyphs.flatMap((glyph) => glyph.rects);
          const mapped = pieces.filter((piece) => piece.start < end && piece.end > start);
          if (
            glyphs.map((glyph) => glyph.text).join('') !== word.segment ||
            !mapped.length ||
            mapped.reduce(
              (sum, piece) => sum + Math.min(end, piece.end) - Math.max(start, piece.start),
              0,
            ) !==
              end - start ||
            !rects.length ||
            rects.some((rect) => !valid(rect))
          ) {
            unmeasured.push({
              kind: issue('word-range-incomplete'),
              owner: expected.kind,
              text: word.segment,
            });
            continue;
          }
          const wordRange = document.createRange();
          const first = mapped[0]!;
          const last = mapped.at(-1)!;
          wordRange.setStart(first.node, start - first.start);
          wordRange.setEnd(last.node, end - last.start);
          const wordRects = [...wordRange.getClientRects()]
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map(box);
          if (!wordRects.length || wordRects.some((rect) => !valid(rect))) {
            unmeasured.push({
              kind: issue('word-range-unmeasured'),
              owner: expected.kind,
              text: word.segment,
            });
            continue;
          }
          const styles = mapped.map((piece) => getComputedStyle(piece.node.parentElement!));
          const firstStyle = styles[0]!;
          const fontSize = parseFloat(firstStyle.fontSize);
          const lineHeight = parseFloat(firstStyle.lineHeight);
          const baselineSafe =
            ancestry.every(({ css }) => css.columnCount === 'auto' && css.columnWidth === 'auto') &&
            mapped.every((piece) => {
              for (
                let element: Element | null = piece.node.parentElement;
                element;
                element = element.parentElement
              ) {
                const css = getComputedStyle(element);
                if (
                  css.verticalAlign !== 'baseline' ||
                  css.position !== 'static' ||
                  css.cssFloat !== 'none' ||
                  css.writingMode !== 'horizontal-tb' ||
                  css.transform !== 'none' ||
                  css.translate !== 'none' ||
                  css.rotate !== 'none' ||
                  css.scale !== 'none' ||
                  (element !== owner && css.display !== 'inline')
                )
                  return false;
                if (element === owner) return true;
              }
              return false;
            });
          if (
            !Number.isFinite(fontSize) ||
            fontSize <= 0 ||
            !Number.isFinite(lineHeight) ||
            styles.some(
              (css) =>
                css.fontSize !== firstStyle.fontSize ||
                css.lineHeight !== firstStyle.lineHeight ||
                css.fontFamily !== firstStyle.fontFamily ||
                css.fontStyle !== firstStyle.fontStyle ||
                css.fontWeight !== firstStyle.fontWeight ||
                css.textTransform !== firstStyle.textTransform,
            ) ||
            !baselineSafe ||
            rects.some((rect) => rect.height >= lineHeight)
          ) {
            unmeasured.push({
              kind: issue('word-baseline-geometry-unmeasured'),
              owner: expected.kind,
              text: word.segment,
            });
            continue;
          }
          const bands: { top: number; bottom: number }[] = [];
          for (const rect of rects.toSorted(
            (left, right) => left.top - right.top || left.bottom - right.bottom,
          )) {
            const band = bands.find(
              (entry) => Math.min(entry.bottom, rect.bottom) > Math.max(entry.top, rect.top),
            );
            if (band) {
              band.top = Math.max(band.top, rect.top);
              band.bottom = Math.min(band.bottom, rect.bottom);
            } else bands.push({ top: rect.top, bottom: rect.bottom });
          }
          reading.words.push({
            start,
            end,
            text: word.segment,
            rects: wordRects,
            bands: bands.length,
          });
          coverage.measuredWords += 1;
          if (bands.length !== 1)
            findings.push({
              kind: issue('word-split'),
              owner: expected.kind,
              text: word.segment,
            });
        }
      }
      const barWalker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
      while (barWalker.nextNode()) {
        const node = barWalker.currentNode as Text;
        if (
          node.data.trim() &&
          !inputs.contract.owners.some((owner) => allElements[owner.elementIndex]?.contains(node))
        )
          findings.push({ kind: issue('unbound-text-source'), text: node.data });
      }
      if (
        coverage.measuredOwners !== coverage.expectedOwners ||
        coverage.measuredTextNodes !== coverage.expectedTextNodes ||
        coverage.mappedSourceUnits !== coverage.expectedSourceUnits ||
        coverage.measuredPaintedGraphemes !== coverage.expectedPaintedGraphemes ||
        coverage.measuredWords !== coverage.discoveredWords ||
        coverage.measuredWords !== coverage.expectedWords
      )
        unmeasured.push({ kind: issue('source-coverage-incomplete') });
      return finish();
    },
    { contract, canonicalInput, fontProofInput, figure },
  );
}
