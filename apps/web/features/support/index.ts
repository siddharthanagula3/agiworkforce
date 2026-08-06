/**
 * Support widget — public surface.
 *
 * The only import app/providers.tsx needs is `SupportWidgetMount`.
 * Everything else is exported for tests and for the three server-side builders
 * who need to see the shapes the UI expects.
 */

export { SupportWidgetMount, isSupportWidgetEnabled } from './components/SupportWidgetMount';
export { normalizeAnswer, isSafeCitationUrl, makeAbstention } from './lib/normalize-answer';
export {
  isSupportWidgetVisible,
  resolveSupportSurface,
  SUPPORT_WIDGET_BLOCKLIST,
} from './lib/route-visibility';
export type {
  SupportAbstentionReason,
  SupportAbstentionView,
  SupportAnswerView,
  SupportCitation,
  SupportReplyView,
  SupportSurface,
} from './lib/contract';
