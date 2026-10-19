import { openAssistantPanel } from './features/surface/assistantPanel';
import { buildWelcomePage } from './features/onboarding/welcome-page';
import { welcomeStyles } from './features/onboarding/welcome-styles';
import { getAuthToken } from './features/cloud-bridge/freeTrialClient';
import { openClerkSignIn } from './features/cloud-bridge/clerkAuth';
import { isPinnedToToolbar, markOnboardingComplete } from './features/side-panel/onboarding';

const sheet = new CSSStyleSheet();
sheet.replaceSync(welcomeStyles());
document.adoptedStyleSheets = [sheet];

const page = buildWelcomePage({
  isSignedIn: async () => Boolean(await getAuthToken()),
  signIn: () => openClerkSignIn(),
  isPinned: isPinnedToToolbar,
  openSidePanel: async () => {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id === undefined) throw new Error('No current tab');
    await openAssistantPanel({ tabId: tab.id, windowId: tab.windowId });
  },
  openSettings: () => {
    void chrome.runtime.openOptionsPage();
  },
  acknowledge: markOnboardingComplete,
});

document.body.appendChild(page.element);
