/**
 * A window is created hidden and shown once its page has drawn. On a slow or
 * hung first load that left only a dock icon, so the guard shows the window
 * with a loading state after a moment, and gives up with the unreachable
 * screen when the page still has not drawn after a longer one.
 */

export const FIRST_LOAD_SHOW_AFTER_MS = 1_000;
export const FIRST_LOAD_GIVE_UP_AFTER_MS = 20_000;

export interface FirstLoadGuardActions {
  /** Shows the window, as the page having drawn does. */
  showWindow(): void;
  /** Shows the window over a page that has not drawn, with the loading state. */
  showLoading(): void;
  hideLoading(): void;
  /** The page never drew: replace it with the screen that says so. */
  giveUp(): void;
}

export interface FirstLoadGuard {
  /** The page drew, or the screen that replaced it did. */
  settled(): void;
  cancel(): void;
}

export function guardFirstLoad(actions: FirstLoadGuardActions): FirstLoadGuard {
  let done = false;
  let loadingShown = false;

  const showTimer = setTimeout(() => {
    if (done) return;
    loadingShown = true;
    actions.showLoading();
  }, FIRST_LOAD_SHOW_AFTER_MS);

  const giveUpTimer = setTimeout(() => {
    if (done) return;
    done = true;
    if (loadingShown) actions.hideLoading();
    actions.giveUp();
  }, FIRST_LOAD_GIVE_UP_AFTER_MS);

  const stop = (): void => {
    done = true;
    clearTimeout(showTimer);
    clearTimeout(giveUpTimer);
  };

  return {
    settled() {
      if (done) return;
      stop();
      if (loadingShown) actions.hideLoading();
      actions.showWindow();
    },
    cancel() {
      if (done) return;
      stop();
      if (loadingShown) actions.hideLoading();
    },
  };
}
