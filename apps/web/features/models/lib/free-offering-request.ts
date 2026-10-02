import { hasExplicitWebFetchIntent, hasExplicitWebSearchIntent } from '@agiworkforce/search';
import { freeOfferingContentText, type FreeOfferingRequest } from '@agiworkforce/cloud-contracts';
import { hasExplicitCodeExecutionIntent } from '@/lib/code-execution/explicit-execution-intent';

export function freeOfferingRequiresWebAccess(request: FreeOfferingRequest): boolean {
  const latestUserMessage = request.messages.findLast((message) => message.role === 'user');
  const text = latestUserMessage ? freeOfferingContentText(latestUserMessage.content) : '';
  return (
    request.web_search === true ||
    request.web_fetch === true ||
    hasExplicitWebSearchIntent(text) ||
    hasExplicitWebFetchIntent(text)
  );
}

export function freeOfferingRequiresCodeExecution(request: FreeOfferingRequest): boolean {
  const latestUserMessage = request.messages.findLast((message) => message.role === 'user');
  return hasExplicitCodeExecutionIntent(
    latestUserMessage ? freeOfferingContentText(latestUserMessage.content) : '',
  );
}
