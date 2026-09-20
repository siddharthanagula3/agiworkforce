import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { codeActionDomain, codeActionSpanName, type CodeAction } from './code-actions';
import { withSpan } from './span';

type AnyCodeAction = (...args: never[]) => Promise<unknown>;

// The same arguments, return value and thrown error, with a span around them.
export function tracedCodeAction<F extends AnyCodeAction>(action: CodeAction, fn: F): F {
  return (async (...args: Parameters<F>) =>
    withSpan(
      codeActionSpanName(action),
      {
        domain: codeActionDomain(action),
        kind: 'client',
        attributes: { [OBSERVABILITY_ATTRIBUTE.codeAction]: action },
      },
      () => fn(...args),
    )) as F;
}
