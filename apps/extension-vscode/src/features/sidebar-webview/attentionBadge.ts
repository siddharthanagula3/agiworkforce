/**
 * What the Activity Bar icon should say while the chat panel is hidden.
 *
 * A turn keeps running when its panel is not on screen, so an approval prompt
 * or a finished reply can sit there indefinitely with nothing saying so. The
 * badge is the only surface VS Code gives a hidden view.
 *
 * Kept as a value rather than a branch inside the provider so the rules are
 * testable without a webview: the interesting cases are all about ordering and
 * about what a second event does to the first.
 */
export interface AttentionBadge {
  value: number;
  tooltip: string;
}

export type AttentionEvent = 'approval-requested' | 'approval-resolved' | 'turn-finished' | 'seen';

export class AttentionState {
  private approvals = 0;
  private finished = false;

  record(event: AttentionEvent): void {
    if (event === 'approval-requested') this.approvals += 1;
    else if (event === 'approval-resolved') this.approvals = Math.max(0, this.approvals - 1);
    else if (event === 'turn-finished') this.finished = true;
    else {
      this.approvals = 0;
      this.finished = false;
    }
  }

  /**
   * An approval outranks a finished reply: one is blocking the turn, the other
   * is only waiting to be read.
   */
  badge(): AttentionBadge | undefined {
    if (this.approvals > 0) {
      return {
        value: this.approvals,
        tooltip:
          this.approvals === 1
            ? 'AGI Workforce is waiting for your approval'
            : `AGI Workforce is waiting on ${this.approvals} approvals`,
      };
    }
    if (this.finished) return { value: 1, tooltip: 'AGI Workforce finished a reply' };
    return undefined;
  }
}
