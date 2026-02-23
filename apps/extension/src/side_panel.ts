/**
 * Side panel script for AGI Workforce extension
 * Manages the message queue displayed in the Chrome side panel
 */

interface QueueEntry {
  id: string;
  text: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  result?: string;
  timestamp: number;
}

const queue: QueueEntry[] = [];

function renderQueue(): void {
  const list = document.getElementById('queueList') as HTMLElement;
  const empty = document.getElementById('emptyState') as HTMLElement;

  const items = list.querySelectorAll('.queue-item');
  items.forEach((el) => el.remove());

  if (queue.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  queue.forEach((entry) => {
    const div = document.createElement('div');
    div.className = `queue-item${entry.status === 'processing' ? ' processing' : entry.status === 'done' ? ' done' : entry.status === 'error' ? ' error' : ''}`;

    const dotClass =
      entry.status === 'processing'
        ? 'dot-processing'
        : entry.status === 'done'
          ? 'dot-done'
          : entry.status === 'error'
            ? 'dot-error'
            : '';

    const textEl = document.createElement('div');
    textEl.className = 'text';
    textEl.textContent = entry.text;

    const metaEl = document.createElement('div');
    metaEl.className = 'meta';

    const dotSpan = document.createElement('span');
    dotSpan.className = `status-dot ${dotClass}`;
    metaEl.appendChild(dotSpan);
    metaEl.appendChild(
      document.createTextNode(
        `${entry.status} \u00b7 ${new Date(entry.timestamp).toLocaleTimeString()}`,
      ),
    );

    if (entry.result) {
      metaEl.appendChild(document.createElement('br'));
      metaEl.appendChild(document.createTextNode(entry.result));
    }

    div.appendChild(textEl);
    div.appendChild(metaEl);
    list.appendChild(div);
  });
}

function sendMessage(): void {
  const input = document.getElementById('msgInput') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
  const text = input.value.trim();
  if (!text) return;

  const entry: QueueEntry = {
    id: `q-${Date.now()}`,
    text,
    status: 'pending',
    timestamp: Date.now(),
  };
  queue.push(entry);
  input.value = '';
  sendBtn.disabled = true;
  renderQueue();

  const timeoutMs = 10_000;
  const responsePromise = new Promise<{ success?: boolean; error?: string } | undefined>(
    (resolve) => {
      chrome.runtime.sendMessage(
        { type: 'queue_message', id: entry.id, text, timestamp: entry.timestamp },
        (response: { success?: boolean; error?: string } | undefined) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        },
      );
    },
  );
  const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
    setTimeout(
      () => resolve({ success: false, error: 'Extension communication timeout' }),
      timeoutMs,
    ),
  );

  Promise.race([responsePromise, timeoutPromise]).then((response) => {
    sendBtn.disabled = false;
    if (!response?.success) {
      entry.status = 'error';
      entry.result = response?.error ?? 'Unknown error';
    } else {
      entry.status = 'processing';
    }
    renderQueue();
  });
}

document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
document.getElementById('msgInput')?.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    sendMessage();
  }
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener(
  (msg: { type?: string; id?: string; status?: QueueEntry['status']; result?: string }) => {
    if (msg.type === 'queue_status_update') {
      const entry = queue.find((e) => e.id === msg.id);
      if (entry) {
        if (msg.status) entry.status = msg.status;
        entry.result = msg.result;
        renderQueue();
      }
    }
  },
);

renderQueue();
