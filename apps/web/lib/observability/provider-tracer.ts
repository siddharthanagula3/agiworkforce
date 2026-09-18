import {
  installProviderTracer,
  type ProviderCallDescriptor,
  type ProviderTracer,
} from '@agiworkforce/provider-runtime';

import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { withSpan } from './span';
import { outboundTraceparent } from './trace-propagation';

const SPAN_NAME_PREFIX = 'gen_ai';

function spanName(call: ProviderCallDescriptor): string {
  return `${SPAN_NAME_PREFIX}.${call.operation}`;
}

export const webProviderTracer: ProviderTracer = {
  runInSpan(call, fn) {
    return withSpan(
      spanName(call),
      {
        domain: 'model',
        kind: 'client',
        attributes: {
          [OBSERVABILITY_ATTRIBUTE.providerName]: call.providerId,
          ...(call.model ? { [OBSERVABILITY_ATTRIBUTE.requestModel]: call.model } : {}),
          'gen_ai.operation.name': call.operation,
          ...call.attributes,
        },
      },
      () => fn(),
    );
  },
  currentTraceparent() {
    return outboundTraceparent();
  },
};

export function installWebProviderTracer(): void {
  installProviderTracer(webProviderTracer);
}
