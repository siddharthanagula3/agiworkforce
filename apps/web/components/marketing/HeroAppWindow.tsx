/**
 * HeroAppWindow · the landing hero centerpiece.
 *
 * A code-rendered recreation of the real AGI Web chat (per the product
 * screenshot of agiworkforce.com/chat): browser chrome, icon rail, focus
 * chips, and the composer with the Auto model selector and token meter.
 * Built in CSS instead of a bitmap so it stays razor-sharp on every
 * display, follows dark/light tokens, and can move · the placeholder
 * types itself and the caret blinks. Reduced motion disables both.
 *
 * Strings mirror the live product UI. Update them only to match the app.
 */
export function HeroAppWindow() {
  return (
    <figure className="agi-hw" aria-label="The AGI Web chat interface">
      <div className="agi-hw-chrome" aria-hidden="true">
        <span className="agi-hw-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="agi-hw-url">agiworkforce.com/chat</span>
        <span className="agi-hw-surface">WEB</span>
      </div>

      <div className="agi-hw-body" aria-hidden="true">
        <div className="agi-hw-rail">
          <span>›</span>
          <span>+</span>
          <span>⌕</span>
        </div>

        <div className="agi-hw-canvas">
          <div className="agi-hw-chips">
            <span>Web</span>
            <span>Academic</span>
            <span>Code</span>
            <span>Writing</span>
            <span>Deep Research</span>
            <span className="agi-hw-chip--active">All</span>
          </div>

          <div className="agi-hw-composer">
            <div className="agi-hw-composer-main">
              <span className="agi-hw-icon">⊕</span>
              <span className="agi-hw-icon">🎙</span>
              <span className="agi-hw-prompt">
                <span className="agi-hw-type">Ask me anything…</span>
                <span className="agi-hw-caret" />
              </span>
              <span className="agi-hw-count">0 / 10000</span>
              <span className="agi-hw-model">
                Auto (Best Value) <span className="agi-hw-model-chevron">▾</span>
              </span>
              <span className="agi-hw-send">➤</span>
            </div>
            <div className="agi-hw-composer-foot">
              <span>Enter to send · Shift+Enter for newline</span>
              <span className="agi-hw-meter">
                <span className="agi-hw-meter-bar" />0 / 128,000
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
