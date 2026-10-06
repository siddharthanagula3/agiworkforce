import type { Locator } from '@playwright/test';
import type { PublicTypographyReport } from './public-typography';
import type { measurePublicFontProof } from './public-page-readiness';

export type PublicFeatureBodyWordContract = { selector: string };

export async function measurePublicFeatureBodyWords(
  frame: Locator,
  typography: Pick<PublicTypographyReport, 'scope' | 'samples'>,
  options: PublicFeatureBodyWordContract & {
    fontProofFamilies: Awaited<ReturnType<typeof measurePublicFontProof>>['expectedFontProof'];
  },
) {
  return frame.evaluate(
    (root, { canonical, contract }) => {
      type Rect = {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      };
      type Issue = { kind: string; ownerIndex: number; word?: string; detail?: string };
      type Part = {
        sourceKey: string;
        start: number;
        end: number;
        nodeStart: number;
        nodeEnd: number;
        text: string;
        fontFamily: string;
        family: string | null;
        fontSize: number;
        lineHeight: number;
        textTransform: string;
        direction: string;
        unicodeBidi: string;
        semanticCode: boolean;
        unsupportedStyle: string[];
        rects: Rect[];
      };
      const fontBindings = {
        bodyVariableValue: '',
        monoVariableValue: '',
        bodyFamily: null as string | null,
        monoFamily: null as string | null,
      };
      const findings: Issue[] = [];
      const unmeasured: Issue[] = [];
      const owners: {
        ownerIndex: number;
        tag: string;
        sourceText: string;
        sourceKeys: string[];
      }[] = [];
      const words: {
        ownerIndex: number;
        text: string;
        start: number;
        end: number;
        classification: 'ordinary' | 'code' | 'mono' | 'url' | 'nonword' | 'unmeasured';
        url?: { text: string; start: number; end: number };
        parts: Part[];
        bands: { top: number; bottom: number; rects: Rect[] }[];
      }[] = [];
      const finish = () => ({
        scope: canonical.scope,
        contract,
        fontBindings,
        owners,
        words,
        findings,
        unmeasured,
        coverage: {
          owners: owners.length,
          words: words.length,
          ordinaryWords: words.filter((word) => word.classification === 'ordinary').length,
          exemptWords: words.filter((word) =>
            ['code', 'mono', 'url', 'nonword'].includes(word.classification),
          ).length,
          unmeasuredWords: words.filter((word) => word.classification === 'unmeasured').length,
        },
      });
      const issue = (kind: string, ownerIndex: number, word?: string, detail?: string) => {
        unmeasured.push({
          kind,
          ownerIndex,
          ...(word === undefined ? {} : { word }),
          ...(detail === undefined ? {} : { detail }),
        });
      };
      const normalize = (value: string) => value.trim().toLowerCase();
      if (!/^en(?:-|$)/i.test(document.documentElement.lang || '')) {
        issue('unsupported-body-word-language', -1, undefined, document.documentElement.lang);
        return finish();
      }
      if (document.fonts.status !== 'loaded') issue('body-word-fonts-not-settled', -1);
      const scope = canonical.scope;
      if (
        !scope ||
        !root.isConnected ||
        !document.body.contains(root) ||
        document.querySelectorAll(scope.selector).length !== 1 ||
        document.querySelector(scope.selector) !== root ||
        scope.elementIndex !== [...document.querySelectorAll('*')].indexOf(root) ||
        scope.tag !== root.localName ||
        scope.label !== root.getAttribute('aria-label')
      ) {
        issue('body-word-canonical-scope-mismatch', -1);
        return finish();
      }
      const samples = canonical.samples.filter((sample) => sample.kind === 'text');
      const sampleByKey = new Map(samples.map((sample) => [sample.sourceKey, sample]));
      if (sampleByKey.size !== samples.length) {
        issue('body-word-canonical-source-duplicate', -1);
        return finish();
      }
      const sourceKeys = new WeakMap<Text, string>();
      const sourceWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let sourceIndex = 0;
      while (sourceWalker.nextNode()) {
        const node = sourceWalker.currentNode as Text;
        if (
          !node.parentElement ||
          node.parentElement.closest('script,style,noscript,textarea,option')
        )
          continue;
        if (!node.data.replace(/\s+/g, ' ').trim()) continue;
        sourceIndex += 1;
        sourceKeys.set(node, `text:${sourceIndex}`);
      }
      const firstFamily = (value: string) => {
        const match = /^(?:"([^"\\]+)"|'([^'\\]+)'|([^,"'\\]+?))(?:\s*,|\s*$)/.exec(value.trim());
        return match ? normalize(match[1] ?? match[2] ?? match[3] ?? '') : null;
      };
      const frameStyle = getComputedStyle(root);
      fontBindings.bodyVariableValue = frameStyle.getPropertyValue('--font-geist-sans');
      fontBindings.monoVariableValue = frameStyle.getPropertyValue('--font-geist-mono');
      const bodyFamily = firstFamily(fontBindings.bodyVariableValue);
      const monoFamily = firstFamily(fontBindings.monoVariableValue);
      fontBindings.bodyFamily = bodyFamily;
      fontBindings.monoFamily = monoFamily;
      if (!bodyFamily || !monoFamily || bodyFamily === monoFamily) {
        issue('missing-distinct-proven-font-families', -1);
        return finish();
      }
      for (const family of [bodyFamily, monoFamily]) {
        const matches = contract.fontProofFamilies.filter(
          (font) => normalize(font.family) === family,
        );
        if (
          matches.length !== 1 ||
          !matches.every(
            (font) =>
              Number.isInteger(font.usedTextNodes) &&
              font.usedTextNodes > 0 &&
              Number.isInteger(font.requests) &&
              font.requests > 0 &&
              Number.isInteger(font.matchedRequests) &&
              font.matchedRequests > 0 &&
              font.matchedRequests === font.requests,
          )
        ) {
          issue('body-word-variable-family-not-proven', -1, undefined, family);
          return finish();
        }
      }
      const loadedFamilies = new Set(
        [...document.fonts]
          .filter((face) => face.status === 'loaded')
          .map((face) => firstFamily(face.family)),
      );
      if (!loadedFamilies.has(bodyFamily) || !loadedFamilies.has(monoFamily)) {
        issue('body-word-proven-font-no-longer-registered', -1);
        return finish();
      }
      const ownerElements = [...root.querySelectorAll(contract.selector)];
      if (!ownerElements.length) issue('missing-body-word-owners', -1);
      const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
      let sourceUnits = 0;
      for (const owner of ownerElements) {
        const ownerIndex = [...document.querySelectorAll('*')].indexOf(owner);
        if (!owner.matches('p,li,dd,dt,blockquote')) {
          issue('unsupported-body-word-owner', ownerIndex, undefined, owner.localName);
          continue;
        }
        const pieces: { node: Text; start: number; end: number }[] = [];
        let sourceText = '';
        let previousFlow: Element | null = null;
        const walker = document.createTreeWalker(
          owner,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        );
        while (walker.nextNode()) {
          const current = walker.currentNode;
          if (current.nodeType === Node.ELEMENT_NODE) {
            const element = current as Element;
            if (
              element.localName === 'br' &&
              element.parentElement?.closest(contract.selector) === owner
            )
              sourceText += '\n';
            continue;
          }
          const node = current as Text;
          const parent = node.parentElement;
          if (
            !parent ||
            parent.closest('script,style,noscript,textarea,option') ||
            parent.closest(contract.selector) !== owner
          )
            continue;
          const ancestors = [];
          for (
            let element: Element | null = parent;
            element && element !== owner;
            element = element.parentElement
          )
            ancestors.push(element);
          const outOfFlow = ancestors.some((element) =>
            ['absolute', 'fixed'].includes(getComputedStyle(element).position),
          );
          const flow = outOfFlow
            ? owner
            : (ancestors.find((element) =>
                /^(block|flex|grid|table|list-item)/.test(getComputedStyle(element).display),
              ) ?? owner);
          if (previousFlow && previousFlow !== flow) sourceText += '\n';
          previousFlow = flow;
          const start = sourceText.length;
          sourceText += node.data;
          pieces.push({ node, start, end: sourceText.length });
        }
        sourceUnits += sourceText.length;
        if (sourceUnits > 40_000) {
          issue('body-word-source-budget-exceeded', ownerIndex);
          return finish();
        }
        owners.push({
          ownerIndex,
          tag: owner.localName,
          sourceText,
          sourceKeys: pieces.flatMap((piece) => sourceKeys.get(piece.node) ?? []),
        });
        const urls = [...sourceText.matchAll(/\S+/gu)].flatMap((match) => {
          if (!/^(https?:\/\/|www\.)/i.test(match[0])) return [];
          try {
            const parsed = new URL(/^www\./i.test(match[0]) ? `https://${match[0]}` : match[0]);
            return /^https?:$/.test(parsed.protocol) && parsed.hostname
              ? [{ text: match[0], start: match.index, end: match.index + match[0].length }]
              : [];
          } catch {
            return [];
          }
        });
        for (const segment of segmenter.segment(sourceText)) {
          if (!segment.isWordLike) continue;
          const start = segment.index;
          const end = start + segment.segment.length;
          const word: (typeof words)[number] = {
            ownerIndex,
            text: segment.segment,
            start,
            end,
            classification: 'unmeasured',
            parts: [],
            bands: [],
          };
          words.push(word);
          if (words.length > 4_000) {
            issue('body-word-token-budget-exceeded', ownerIndex);
            return finish();
          }
          let mappedUnits = 0;
          let mappingFailed = false;
          for (const piece of pieces.filter((piece) => piece.start < end && piece.end > start)) {
            const nodeStart = Math.max(start, piece.start) - piece.start;
            const nodeEnd = Math.min(end, piece.end) - piece.start;
            mappedUnits += nodeEnd - nodeStart;
            const sourceKey = sourceKeys.get(piece.node);
            const sample = sourceKey && sampleByKey.get(sourceKey);
            const parent = piece.node.parentElement!;
            const css = getComputedStyle(parent);
            if (
              /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(
                piece.node.data,
              )
            ) {
              issue('unsupported-body-word-unicode-boundary', ownerIndex, word.text);
              mappingFailed = true;
              continue;
            }
            if (
              !sourceKey ||
              !sample ||
              sample.text !== piece.node.data.replace(/\s+/g, ' ').trim() ||
              sample.fontFamily !== css.fontFamily
            ) {
              issue('body-word-source-not-covered', ownerIndex, word.text);
              mappingFailed = true;
              continue;
            }
            const range = document.createRange();
            range.setStart(piece.node, nodeStart);
            range.setEnd(piece.node, nodeEnd);
            const rects = [...range.getClientRects()].map((rect) => ({
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            }));
            const unsupportedStyle: string[] = [];
            for (let element: Element | null = parent; element; element = element.parentElement) {
              const style = getComputedStyle(element);
              if (style.columnCount !== 'auto' || style.columnWidth !== 'auto')
                unsupportedStyle.push('multicolumn');
              if (!root.contains(element)) continue;
              if (
                style.writingMode !== 'horizontal-tb' ||
                style.transform !== 'none' ||
                style.translate !== 'none' ||
                style.rotate !== 'none' ||
                style.scale !== 'none' ||
                !['', 'normal', '1'].includes(style.getPropertyValue('zoom'))
              )
                unsupportedStyle.push('transformed-or-nonhorizontal');
              if (element !== owner && !['baseline', ''].includes(style.verticalAlign))
                unsupportedStyle.push('nonbaseline-inline');
              if (['absolute', 'fixed'].includes(style.position))
                unsupportedStyle.push('out-of-flow-fragment');
              if (
                style.position === 'relative' &&
                [style.top, style.right, style.bottom, style.left].some(
                  (value) => !['auto', '0px'].includes(value),
                )
              )
                unsupportedStyle.push('relative-offset');
            }
            if (!['none', 'uppercase', 'lowercase', 'capitalize'].includes(css.textTransform))
              unsupportedStyle.push('unsupported-text-transform');
            if (sample.scaleX !== 1 || sample.scaleY !== 1)
              unsupportedStyle.push('canonical-transform-unresolved');
            word.parts.push({
              sourceKey,
              start: piece.start + nodeStart,
              end: piece.start + nodeEnd,
              nodeStart,
              nodeEnd,
              text: piece.node.data.slice(nodeStart, nodeEnd),
              fontFamily: css.fontFamily,
              family: firstFamily(css.fontFamily),
              fontSize: parseFloat(css.fontSize),
              lineHeight: parseFloat(css.lineHeight),
              textTransform: css.textTransform,
              direction: css.direction,
              unicodeBidi: css.unicodeBidi,
              semanticCode: Boolean(parent.closest('code,pre,kbd,samp')),
              unsupportedStyle: [...new Set(unsupportedStyle)],
              rects,
            });
          }
          if (mappedUnits !== end - start || mappingFailed || !word.parts.length) {
            issue('body-word-range-incomplete', ownerIndex, word.text);
            continue;
          }
          if (word.parts.some((part) => part.family !== bodyFamily && part.family !== monoFamily)) {
            issue('body-word-font-family-unknown', ownerIndex, word.text);
            continue;
          }
          const codeCount = word.parts.filter((part) => part.semanticCode).length;
          const monoCount = word.parts.filter((part) => part.family === monoFamily).length;
          if (
            (codeCount && codeCount !== word.parts.length) ||
            (monoCount && monoCount !== word.parts.length)
          ) {
            issue('body-word-mixed-exemption', ownerIndex, word.text);
            continue;
          }
          if (codeCount === word.parts.length) word.classification = 'code';
          else if (monoCount === word.parts.length) word.classification = 'mono';
          else {
            word.url = urls.find((url) => url.start <= start && url.end >= end);
            if (word.url) word.classification = 'url';
            else if (/^\d+(?:[.,]\d+)*$/u.test(word.text)) word.classification = 'nonword';
            else if (
              !/^[\p{Script_Extensions=Latin}\p{M}]+(?:['’][\p{Script_Extensions=Latin}\p{M}]+)*$/u.test(
                word.text,
              )
            ) {
              issue('unsupported-body-word-script-or-token', ownerIndex, word.text);
              continue;
            } else word.classification = 'ordinary';
          }
          if (word.classification !== 'ordinary') continue;
          const first = word.parts[0]!;
          if (
            word.parts.some(
              (part) =>
                part.unsupportedStyle.length ||
                !Number.isFinite(part.fontSize) ||
                !Number.isFinite(part.lineHeight) ||
                part.fontSize !== first.fontSize ||
                part.lineHeight !== first.lineHeight ||
                part.textTransform !== first.textTransform,
            )
          ) {
            word.classification = 'unmeasured';
            issue('unsupported-body-word-style', ownerIndex, word.text);
            continue;
          }
          const rects = word.parts.flatMap((part) => part.rects);
          if (
            !rects.length ||
            !rects.some((rect) => rect.width > 0) ||
            rects.some(
              (rect) =>
                Object.values(rect).some((value) => !Number.isFinite(value)) ||
                rect.width < 0 ||
                rect.height <= 0 ||
                rect.height >= first.lineHeight - 1,
            )
          ) {
            word.classification = 'unmeasured';
            issue('unsupported-body-word-geometry', ownerIndex, word.text);
            continue;
          }
          for (const rect of rects.sort((a, b) => a.top - b.top || a.bottom - b.bottom)) {
            const band = word.bands.find(
              (band) => Math.min(band.bottom, rect.bottom) - Math.max(band.top, rect.top) > 1,
            );
            if (band) {
              band.top = Math.max(band.top, rect.top);
              band.bottom = Math.min(band.bottom, rect.bottom);
              band.rects.push(rect);
            } else word.bands.push({ top: rect.top, bottom: rect.bottom, rects: [rect] });
          }
          if (word.bands.length > 1)
            findings.push({
              kind: 'body-word-split',
              ownerIndex,
              word: word.text,
              detail: `${word.bands.length} disjoint vertical bands`,
            });
        }
      }
      return finish();
    },
    { canonical: typography, contract: options },
  );
}
