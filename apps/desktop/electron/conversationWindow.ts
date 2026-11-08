import { conversationIdFromRoute } from './windowRegistry';

export function publicConversationUrl(origin: string, route: string | null): string | null {
  if (!route || conversationIdFromRoute(route) === null) return null;
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}${route}`;
}

export interface ConversationWindowPlan {
  keepOnCurrentWindow: string | null;
  openInNewWindow: string | null;
}

export function planOpenConversationInNewWindow(route: string | null): ConversationWindowPlan {
  if (route === null) return { keepOnCurrentWindow: null, openInNewWindow: null };
  return { keepOnCurrentWindow: route, openInNewWindow: route };
}
