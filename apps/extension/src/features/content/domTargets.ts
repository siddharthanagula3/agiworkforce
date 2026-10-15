export function createDomTargetHelpers(
  rootDocument: Document,
  signatureOf: (element: Element) => string,
  limits: { maxElements: number; maxLocatorCharacters: number; maxDepth: number },
) {
  const prefix = '@agi-dom:';
  const rootWindow = rootDocument.defaultView!;
  const rootOrigin = rootWindow.location.origin;
  type Step = {
    selector: string;
    kind: 'element' | 'shadow' | 'frame';
    signature?: string;
    url?: string;
  };
  function frameDocument(frame: Element): Document | null {
    try {
      const child = (frame as HTMLIFrameElement).contentDocument;
      const view = child?.defaultView;
      if (
        !child ||
        !view ||
        view.frameElement !== frame ||
        view.parent !== frame.ownerDocument.defaultView
      )
        return null;
      const origin = view.location.origin;
      if (
        origin !== rootOrigin &&
        !(
          origin === 'null' &&
          ['about:blank', 'about:srcdoc'].includes(child.URL) &&
          view.origin === rootOrigin
        )
      )
        return null;
      return child;
    } catch {
      return null;
    }
  }
  function pathWithin(element: Element, scope: Document | ShadowRoot): string | null {
    const parts: string[] = [];
    let node: Element | null = element;
    let inspected = 0;
    for (let depth = 0; node && depth < limits.maxElements; depth++) {
      let nth = 1;
      for (
        let sibling = node.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      ) {
        if (++inspected > limits.maxElements) return null;
        if (sibling.localName === node.localName) nth++;
      }
      parts.unshift(node.localName + ':nth-of-type(' + nth + ')');
      if (node.parentNode === scope || node === (scope as Document).documentElement)
        return parts.join(' > ');
      node = node.parentElement;
    }
    return null;
  }
  function locator(element: Element): string | null {
    const steps: Step[] = [];
    let node = element;
    let kind: Step['kind'] = 'element';
    let childUrl: string | undefined;
    for (let depth = 0; depth < limits.maxDepth; depth++) {
      const scope = node.getRootNode() as Document | ShadowRoot;
      const selector = pathWithin(node, scope);
      if (!selector) return null;
      steps.unshift({
        selector,
        kind,
        ...(kind !== 'element' ? { signature: signatureOf(node) } : {}),
        ...(childUrl ? { url: childUrl } : {}),
      });
      if (scope === rootDocument) {
        const value =
          steps.length === 1 ? selector : prefix + JSON.stringify({ url: rootDocument.URL, steps });
        return value.length <= limits.maxLocatorCharacters ? value : null;
      }
      if (scope.nodeType === 11) {
        const host = (scope as ShadowRoot).host;
        if (!host || host.shadowRoot !== scope) return null;
        node = host;
        kind = 'shadow';
        childUrl = undefined;
      } else if (scope.nodeType === 9) {
        const frame = (scope as Document).defaultView?.frameElement;
        if (!frame || frameDocument(frame) !== scope) return null;
        node = frame;
        kind = 'frame';
        childUrl = (scope as Document).URL;
      } else return null;
    }
    return null;
  }
  function unique(scope: Document | ShadowRoot, selector: string): Element {
    const matches = scope.querySelectorAll(selector);
    if (matches.length !== 1)
      throw new Error(
        matches.length
          ? 'The target is ambiguous; read_dom again.'
          : 'No element matches the target; the page changed since read_dom.',
      );
    return matches[0]!;
  }
  function resolve(value: string, expectedSignature?: string | null): Element {
    if (typeof value !== 'string' || value.length > limits.maxLocatorCharacters)
      throw new Error('The target locator is invalid or too long.');
    let scope: Document | ShadowRoot = rootDocument;
    let element: Element;
    if (!value.startsWith(prefix)) element = unique(scope, value);
    else {
      const path = JSON.parse(value.slice(prefix.length)) as { url: string; steps: Step[] };
      if (
        path.url !== rootDocument.URL ||
        !Array.isArray(path.steps) ||
        !path.steps.length ||
        path.steps.length > limits.maxDepth
      )
        throw new Error('The target page or scope changed; read_dom again.');
      let last: Element | undefined;
      for (let index = 0; index < path.steps.length; index++) {
        const step = path.steps[index]!;
        if (
          !step ||
          typeof step.selector !== 'string' ||
          !['element', 'shadow', 'frame'].includes(step.kind)
        )
          throw new Error('Invalid target scope.');
        last = unique(scope, step.selector);
        if (step.kind === 'element') {
          if (index !== path.steps.length - 1) throw new Error('Invalid target scope ordering.');
        } else {
          if (index === path.steps.length - 1 || signatureOf(last) !== step.signature)
            throw new Error('The target scope owner changed; read_dom again.');
          if (step.kind === 'shadow') {
            if (!last.shadowRoot)
              throw new Error('Closed or unavailable shadow controls require manual handling.');
            scope = last.shadowRoot;
          } else {
            const child = frameDocument(last);
            if (!child || child.URL !== step.url)
              throw new Error('An unapproved or changed frame cannot be inspected.');
            scope = child;
          }
        }
      }
      element = last!;
    }
    if (!element.isConnected) throw new Error('The target is no longer connected.');
    if (expectedSignature != null && signatureOf(element) !== expectedSignature)
      throw new Error('The element changed since read_dom; read the page again.');
    return element;
  }
  function elements() {
    const result: Element[] = [];
    const scopes: Array<{ scope: Document | ShadowRoot; depth: number }> = [
      { scope: rootDocument, depth: 0 },
    ];
    let blockedFrames = 0;
    let limited = false;
    for (let index = 0; index < scopes.length; index++) {
      const { scope, depth } = scopes[index]!;
      const walker = rootDocument.createTreeWalker(scope, 1);
      let next: Node | null;
      while ((next = walker.nextNode())) {
        if (result.length >= limits.maxElements) {
          limited = true;
          break;
        }
        const element = next as Element;
        result.push(element);
        if (element.shadowRoot) {
          if (depth + 1 < limits.maxDepth)
            scopes.push({ scope: element.shadowRoot, depth: depth + 1 });
          else limited = true;
        }
        if (element.localName === 'iframe' || element.localName === 'frame') {
          const child = frameDocument(element);
          if (child && depth + 1 < limits.maxDepth) scopes.push({ scope: child, depth: depth + 1 });
          else blockedFrames++;
        }
      }
      if (limited && result.length >= limits.maxElements) break;
    }
    return { elements: result, blockedFrames, limited };
  }
  function focusedElement(doc: Document = rootDocument): Element | null {
    let element = doc.activeElement;
    for (let depth = 0; element && depth < limits.maxDepth; depth++) {
      if (element.shadowRoot?.activeElement) {
        element = element.shadowRoot.activeElement;
        continue;
      }
      if (element.localName === 'iframe' || element.localName === 'frame') {
        const child = frameDocument(element);
        if (!child?.activeElement) return null;
        element = child.activeElement;
        continue;
      }
      if (['body', 'html', 'object', 'embed'].includes(element.localName)) return null;
      return element;
    }
    return null;
  }
  function pointElement(x: number, y: number): Element | null {
    let scope: Document | ShadowRoot = rootDocument;
    let previous: Element | null = null;
    for (let depth = 0; depth < limits.maxDepth; depth++) {
      const element: Element | null = scope.elementFromPoint(x, y);
      if (!element || element === previous) return element;
      if (element.shadowRoot) {
        previous = element;
        scope = element.shadowRoot;
        continue;
      }
      if (element.localName === 'iframe' || element.localName === 'frame') {
        const child = frameDocument(element);
        if (!child) return null;
        const frame = element as HTMLElement;
        const { rect, scaleX, scaleY } = frameGeometry(frame);
        x = (x - rect.left) / scaleX - frame.clientLeft;
        y = (y - rect.top) / scaleY - frame.clientTop;
        previous = element;
        scope = child;
        continue;
      }
      return element;
    }
    return null;
  }
  function frameGeometry(frame: HTMLElement) {
    const transform = frame.ownerDocument.defaultView!.getComputedStyle(frame).transform;
    if (transform && transform !== 'none') {
      const values = /^matrix\(([^)]+)\)$/u.exec(transform)?.[1]?.split(',').map(Number);
      if (
        !values ||
        values.length !== 6 ||
        values.some((value) => !Number.isFinite(value)) ||
        values[0]! <= 0 ||
        values[3]! <= 0 ||
        values[1] !== 0 ||
        values[2] !== 0
      )
        throw new Error(
          'A rotated, reflected or three-dimensional frame requires manual pointer handling.',
        );
    }
    const rect = frame.getBoundingClientRect();
    const scaleX = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
    const scaleY = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
    if (![scaleX, scaleY].every((value) => Number.isFinite(value) && value > 0))
      throw new Error('The pointer frame has no visible bounds.');
    return { rect, scaleX, scaleY };
  }
  function pointForElement(element: Element, preferred: { x: number; y: number }) {
    let rect = element.getBoundingClientRect();
    let bounds = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    let doc = element.ownerDocument;
    for (let depth = 0; doc !== rootDocument && depth < limits.maxDepth; depth++) {
      const frame = doc.defaultView?.frameElement as HTMLElement | null;
      if (!frame || frameDocument(frame) !== doc)
        throw new Error('The pointer frame is unapproved or changed.');
      const geometry = frameGeometry(frame);
      rect = geometry.rect;
      const { scaleX, scaleY } = geometry;
      bounds = {
        left: rect.left + (bounds.left + frame.clientLeft) * scaleX,
        right: rect.left + (bounds.right + frame.clientLeft) * scaleX,
        top: rect.top + (bounds.top + frame.clientTop) * scaleY,
        bottom: rect.top + (bounds.bottom + frame.clientTop) * scaleY,
      };
      doc = frame.ownerDocument;
    }
    if (doc !== rootDocument) throw new Error('The pointer frame exceeds the inspection bound.');
    const left = Math.max(0, bounds.left),
      right = Math.min(rootWindow.innerWidth, bounds.right);
    const top = Math.max(0, bounds.top),
      bottom = Math.min(rootWindow.innerHeight, bounds.bottom);
    if (right <= left || bottom <= top)
      throw new Error('The pointer target is outside the viewport or not visible.');
    const x = preferred.x >= left && preferred.x < right ? preferred.x : (left + right) / 2;
    const y = preferred.y >= top && preferred.y < bottom ? preferred.y : (top + bottom) / 2;
    let hit = pointElement(x, y);
    for (let depth = 0; hit && depth < limits.maxDepth; depth++) {
      if (hit === element) return { x, y };
      hit = hit.parentElement ?? (hit.getRootNode() as ShadowRoot).host ?? null;
    }
    throw new Error('The pointer target is covered by another element.');
  }
  return {
    frameDocument,
    locator,
    resolve,
    elements,
    focusedElement,
    pointElement,
    pointForElement,
  };
}
