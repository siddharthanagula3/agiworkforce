// AGI Workforce Extension - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  await updateStatus();
  await updateTabInfo();
});

// Update connection status
async function updateStatus() {
  try {
    const { connectedToDesktop } = await chrome.storage.local.get('connectedToDesktop');

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (connectedToDesktop) {
      statusDot.classList.add('connected');
      statusDot.classList.remove('disconnected');
      statusText.textContent = 'Connected to AGI Workforce Desktop';
    } else {
      statusDot.classList.add('disconnected');
      statusDot.classList.remove('connected');
      statusText.textContent = 'Not connected to desktop';
    }
  } catch (error) {
    console.error('Failed to update status:', error);
  }
}

// Update current tab information
async function updateTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      document.getElementById('tabId').textContent = tab.id;

      const url = new URL(tab.url);
      const displayUrl = url.hostname + url.pathname;
      document.getElementById('currentUrl').textContent =
        displayUrl.length > 30 ? displayUrl.substring(0, 30) + '...' : displayUrl;
    }
  } catch (error) {
    console.error('Failed to update tab info:', error);
  }
}
