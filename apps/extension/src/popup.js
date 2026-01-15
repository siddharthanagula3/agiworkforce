// State management
let sessionStartTime = Date.now();
let actionCount = 0;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
  setupEventListeners();
  startSessionTimer();
});

async function initializePopup() {
  await Promise.all([updateStatus(), updateTabInfo(), updateStats()]);
}

function setupEventListeners() {
  // Capture page button
  document.getElementById('captureBtn').addEventListener('click', handleCapturePage);

  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.connectedToDesktop) {
      updateStatus();
    }
    if (changes.actionCount) {
      actionCount = changes.actionCount.newValue || 0;
      updateStats();
    }
  });
}

async function updateStatus() {
  try {
    const { connectedToDesktop } = await chrome.storage.local.get('connectedToDesktop');

    const statusCard = document.getElementById('statusCard');
    const statusTitle = document.getElementById('statusTitle');
    const statusSubtitle = document.getElementById('statusSubtitle');

    if (connectedToDesktop) {
      statusCard.classList.add('connected');
      statusTitle.textContent = 'Connected';
      statusSubtitle.textContent = 'Desktop app is active';
    } else {
      statusCard.classList.remove('connected');
      statusTitle.textContent = 'Disconnected';
      statusSubtitle.textContent = 'Desktop app not detected';
    }
  } catch (error) {
    console.error('Failed to update status:', error);
    document.getElementById('statusTitle').textContent = 'Error';
    document.getElementById('statusSubtitle').textContent = 'Failed to check status';
  }
}

async function updateTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      document.getElementById('tabId').textContent = tab.id || '-';

      if (tab.url) {
        try {
          const url = new URL(tab.url);
          const displayUrl = `${url.hostname}${url.pathname}`;
          const currentUrlElement = document.getElementById('currentUrl');
          currentUrlElement.textContent =
            displayUrl.length > 25 ? displayUrl.substring(0, 25) + '...' : displayUrl;
          currentUrlElement.title = tab.url;
        } catch {
          document.getElementById('currentUrl').textContent = 'Invalid URL';
          document.getElementById('currentUrl').title = '';
        }
      } else {
        document.getElementById('currentUrl').textContent = 'No URL';
      }
    }
  } catch (error) {
    console.error('Failed to update tab info:', error);
    document.getElementById('tabId').textContent = 'Error';
    document.getElementById('currentUrl').textContent = 'Error';
  }
}

async function updateStats() {
  try {
    // Update tab count
    const tabs = await chrome.tabs.query({});
    document.getElementById('tabCount').textContent = tabs.length;

    // Update action count
    const { actionCount: storedCount } = await chrome.storage.local.get('actionCount');
    actionCount = storedCount || 0;
    document.getElementById('actionCount').textContent = actionCount;
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

function startSessionTimer() {
  // Update session time every second
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('sessionTime').textContent =
      `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// UI feedback duration constant (2 seconds)
const UI_FEEDBACK_DURATION_MS = 2000;
// Refresh button feedback duration (1 second)
const REFRESH_FEEDBACK_DURATION_MS = 1000;

async function handleCapturePage() {
  const button = document.getElementById('captureBtn');
  const originalText = button.textContent;

  try {
    button.textContent = 'Capturing...';
    button.disabled = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error('No active tab found');
    }

    // Send message to background to capture screenshot
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      format: 'png',
      quality: 90,
    });

    if (response.success) {
      button.textContent = 'Captured!';
      incrementActionCount();

      // Reset button after feedback duration
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, UI_FEEDBACK_DURATION_MS);
    } else {
      throw new Error(response.error || 'Screenshot failed');
    }
  } catch (error) {
    console.error('Capture failed:', error);
    button.textContent = 'Failed';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, UI_FEEDBACK_DURATION_MS);
  }
}

async function handleRefresh() {
  const button = document.getElementById('refreshBtn');
  const originalText = button.textContent;

  button.textContent = 'Refreshing...';
  button.disabled = true;

  await Promise.all([updateStatus(), updateTabInfo(), updateStats()]);

  button.textContent = 'Refreshed';
  setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, REFRESH_FEEDBACK_DURATION_MS);
}

async function incrementActionCount() {
  actionCount++;
  await chrome.storage.local.set({ actionCount });
  document.getElementById('actionCount').textContent = actionCount;
}

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + R to refresh
  if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
    e.preventDefault();
    handleRefresh();
  }

  // Cmd/Ctrl + C to capture
  if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
    e.preventDefault();
    handleCapturePage();
  }
});
