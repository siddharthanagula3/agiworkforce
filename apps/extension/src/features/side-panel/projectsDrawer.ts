import type { ManagedCloudProject } from '@agiworkforce/cloud-contracts';
import { openClerkSignIn } from '../cloud-bridge/clerkAuth';
import {
  createChromeProject,
  deleteChromeProject,
  listChromeProjectConversations,
  listChromeProjects,
  CHROME_PROJECT_INSTRUCTIONS_MAX_CHARS,
  CHROME_PROJECT_NAME_MAX_CHARS,
  type ChromeProjectConversation,
} from '../cloud-bridge/projectsClient';
import { t } from '../../i18n';
import { el } from './dom';

export const PROJECTS_DRAWER_CSS = `
  .sp-drawer-projects-help {
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.5;
    margin-bottom: 8px;
  }
  .sp-drawer-projects-new-btn {
    background: var(--agi-ext-surface);
    border: 1px solid var(--agi-ext-border);
    border-radius: 6px;
    color: var(--agi-ext-text-muted);
    font-size: 12px;
    padding: 6px 12px;
    cursor: pointer;
    margin-bottom: 8px;
    transition: color 0.12s, border-color 0.12s;
  }
  .sp-drawer-projects-new-btn:hover {
    color: var(--agi-ext-accent);
    border-color: var(--agi-ext-accent);
  }
  .sp-drawer-projects-form { display: none; flex-direction: column; gap: 6px; margin-bottom: 8px; }
  .sp-drawer-projects-form.open { display: flex; }
  .sp-drawer-projects-input,
  .sp-drawer-projects-textarea {
    background: var(--agi-ext-surface);
    border: 1px solid var(--agi-ext-border);
    border-radius: 6px;
    color: var(--agi-ext-text);
    font-family: inherit;
    font-size: 12px;
    padding: 6px 9px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  .sp-drawer-projects-textarea { resize: none; height: 60px; line-height: 1.4; }
  .sp-drawer-projects-input:focus,
  .sp-drawer-projects-textarea:focus { border-color: var(--agi-ext-focus); }
  .sp-drawer-projects-input::placeholder,
  .sp-drawer-projects-textarea::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
  .sp-drawer-projects-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .sp-drawer-projects-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
  .sp-drawer-project {
    background: var(--agi-ext-surface);
    border: 1px solid var(--agi-ext-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .sp-drawer-project[data-active='true'] { border-color: var(--agi-ext-accent); }
  .sp-drawer-project-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    background: none;
    border: none;
    color: var(--agi-ext-text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .sp-drawer-project-summary:hover { background: var(--agi-ext-hover); }
  .sp-drawer-project-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sp-drawer-project-count { font-size: 12px; color: var(--agi-ext-text-muted); flex-shrink: 0; }
  .sp-drawer-project-active-tag {
    font-size: 12px;
    color: var(--agi-ext-accent);
    flex-shrink: 0;
  }
  .sp-drawer-project-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 10px 10px;
    border-top: 1px solid var(--agi-ext-border);
    padding-top: 8px;
  }
  .sp-drawer-project-detail[hidden] { display: none; }
  .sp-drawer-project-text {
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .sp-drawer-project-subtitle { font-size: 12px; color: var(--agi-ext-text); }
  .sp-drawer-project-chat {
    background: none;
    border: none;
    color: var(--agi-ext-text-muted);
    font: inherit;
    font-size: 12px;
    text-align: left;
    padding: 3px 0;
    cursor: default;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sp-drawer-project-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .sp-drawer-project-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: 5px;
    color: var(--agi-ext-text-muted);
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }
  .sp-drawer-project-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
  .sp-drawer-project-btn:disabled { cursor: wait; opacity: 0.55; }
  .sp-drawer-project-btn.is-danger:hover {
    color: var(--agi-ext-danger);
    border-color: var(--agi-ext-danger-border);
  }
  .sp-drawer-project-btn.is-confirm {
    color: var(--agi-ext-on-accent);
    background: var(--agi-ext-danger);
    border-color: var(--agi-ext-danger);
  }
  .sp-drawer-project-warning {
    font-size: 12px;
    color: var(--agi-ext-danger);
    line-height: 1.5;
  }
  .sp-drawer-project-warning[hidden] { display: none; }
  .sp-drawer-projects-empty,
  .sp-drawer-projects-status {
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.5;
    padding: 4px 0;
  }
  .sp-drawer-projects-empty[hidden],
  .sp-drawer-projects-status[hidden] { display: none; }
  .sp-drawer-projects-status-action {
    margin-left: 6px;
    padding: 0;
    font: inherit;
    color: var(--agi-ext-accent);
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }
  .sp-drawer-projects-status-action:disabled { cursor: wait; opacity: 0.55; }
`;

export interface ActiveProjectSelection {
  id: string;
  name: string;
}

export interface ProjectsDrawerDependencies {
  listProjects: typeof listChromeProjects;
  createProject: typeof createChromeProject;
  deleteProject: typeof deleteChromeProject;
  listConversations: typeof listChromeProjectConversations;
  signIn: typeof openClerkSignIn;
  getActiveProject: () => ActiveProjectSelection | null;
  setActiveProject: (project: ActiveProjectSelection | null) => void;
}

export interface ProjectsDrawerAPI {
  sectionEl: HTMLElement;
  refresh(): Promise<boolean>;
}

const DELETE_CONFIRM_MS = 6000;

const DEFAULT_DEPENDENCIES: Omit<
  ProjectsDrawerDependencies,
  'getActiveProject' | 'setActiveProject'
> = {
  listProjects: listChromeProjects,
  createProject: createChromeProject,
  deleteProject: deleteChromeProject,
  listConversations: listChromeProjectConversations,
  signIn: openClerkSignIn,
};

function formatChatCount(project: ManagedCloudProject): string {
  const count = project.conversationCount ?? 0;
  return t('spProjectsCount', [String(count)]);
}

export function buildProjectsDrawerSection(
  dependencies: Pick<ProjectsDrawerDependencies, 'getActiveProject' | 'setActiveProject'> &
    Partial<ProjectsDrawerDependencies>,
): ProjectsDrawerAPI {
  const deps: ProjectsDrawerDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };

  const sectionEl = el('div', { class: 'sp-drawer-section', id: 'sp-drawer-projects-section' });
  sectionEl.appendChild(el('div', { class: 'sp-drawer-section-title' }, t('spProjectsTitle')));
  sectionEl.appendChild(el('p', { class: 'sp-drawer-projects-help' }, t('spProjectsHelp')));

  const newBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-projects-new-btn', id: 'sp-drawer-projects-new-btn' },
    t('spProjectsNew'),
  );
  sectionEl.appendChild(newBtn);

  const form = el('div', { class: 'sp-drawer-projects-form' });
  const nameInput = el('input', {
    type: 'text',
    class: 'sp-drawer-projects-input',
    id: 'sp-drawer-projects-name',
    placeholder: t('spProjectsNamePlaceholder'),
    'aria-label': t('spProjectsNamePlaceholder'),
    maxlength: String(CHROME_PROJECT_NAME_MAX_CHARS),
    autocomplete: 'off',
  });
  const instructionsInput = el('textarea', {
    class: 'sp-drawer-projects-textarea',
    id: 'sp-drawer-projects-instructions',
    placeholder: t('spProjectsInstructionsPlaceholder'),
    'aria-label': t('spProjectsInstructionsPlaceholder'),
    maxlength: String(CHROME_PROJECT_INSTRUCTIONS_MAX_CHARS),
    rows: '3',
  });
  const formActions = el('div', { class: 'sp-drawer-projects-form-actions' });
  const createBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-project-btn' },
    t('spProjectsCreate'),
  );
  const cancelBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-project-btn' },
    t('spProjectsCancel'),
  );
  formActions.appendChild(createBtn);
  formActions.appendChild(cancelBtn);
  form.appendChild(nameInput);
  form.appendChild(instructionsInput);
  form.appendChild(formActions);
  sectionEl.appendChild(form);

  const listEl = el('ul', {
    class: 'sp-drawer-projects-list',
    id: 'sp-drawer-projects-list',
    'aria-label': t('spProjectsTitle'),
  });
  const emptyEl = el(
    'div',
    { class: 'sp-drawer-projects-empty', hidden: '' },
    t('spProjectsEmpty'),
  );
  const statusEl = el('div', {
    class: 'sp-drawer-projects-status',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  });
  sectionEl.appendChild(listEl);
  sectionEl.appendChild(emptyEl);
  sectionEl.appendChild(statusEl);

  let projects: ManagedCloudProject[] = [];
  let openProjectId: string | null = null;
  let conversationsByProjectId = new Map<string, ChromeProjectConversation[] | 'failed'>();
  let inFlight: AbortController | null = null;

  function setStatus(message: string): void {
    statusEl.replaceChildren(document.createTextNode(message));
    statusEl.hidden = message.length === 0;
  }

  function setActionableStatus(
    message: string,
    label: string,
    busyLabel: string,
    run: () => Promise<void>,
  ): void {
    setStatus(message);
    const action = el(
      'button',
      { type: 'button', class: 'sp-drawer-projects-status-action' },
      label,
    );
    action.addEventListener('click', () => {
      action.disabled = true;
      action.textContent = busyLabel;
      void run().finally(() => {
        action.disabled = false;
        action.textContent = label;
      });
    });
    statusEl.appendChild(action);
  }

  function reportFailure(result: { code: string; message: string }): void {
    if (result.code === 'auth_required') {
      setActionableStatus(result.message, t('spProjectsSignIn'), t('spProjectsSigningIn'), () =>
        deps.signIn().catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : result.message);
        }),
      );
      return;
    }
    setActionableStatus(result.message, t('spProjectsRetry'), t('spProjectsLoading'), async () => {
      await refresh();
    });
  }

  function buildConversationList(projectId: string): HTMLElement {
    const wrapper = el('div', { class: 'sp-drawer-project-detail-chats' });
    wrapper.appendChild(
      el('div', { class: 'sp-drawer-project-subtitle' }, t('spProjectsConversations')),
    );
    const loaded = conversationsByProjectId.get(projectId);
    if (loaded === undefined) {
      wrapper.appendChild(el('div', { class: 'sp-drawer-project-text' }, t('spProjectsLoading')));
      return wrapper;
    }
    if (loaded === 'failed') {
      wrapper.appendChild(
        el('div', { class: 'sp-drawer-project-text' }, t('spProjectsConversationsFailed')),
      );
      return wrapper;
    }
    if (loaded.length === 0) {
      wrapper.appendChild(
        el('div', { class: 'sp-drawer-project-text' }, t('spProjectsNoConversations')),
      );
      return wrapper;
    }
    for (const conversation of loaded) {
      wrapper.appendChild(el('div', { class: 'sp-drawer-project-chat' }, conversation.title));
    }
    return wrapper;
  }

  function buildDetail(project: ManagedCloudProject): HTMLElement {
    const detail = el('div', { class: 'sp-drawer-project-detail' });
    const described = project.description?.trim() || project.instructions?.trim();
    detail.appendChild(
      el('div', { class: 'sp-drawer-project-text' }, described || t('spProjectsNoInstructions')),
    );
    detail.appendChild(buildConversationList(project.id));

    const warning = el('div', { class: 'sp-drawer-project-warning', hidden: '', role: 'alert' });
    warning.textContent = t('spProjectsDeleteWarning', [project.name]);
    detail.appendChild(warning);

    const actions = el('div', { class: 'sp-drawer-project-actions' });
    const active = deps.getActiveProject();
    const isActive = active?.id === project.id;
    const useBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-project-btn' },
      isActive ? t('spProjectsStopUse') : t('spProjectsUse'),
    );
    useBtn.addEventListener('click', () => {
      if (isActive) {
        deps.setActiveProject(null);
        setStatus(t('spProjectsCleared'));
      } else {
        deps.setActiveProject({ id: project.id, name: project.name });
        setStatus(t('spProjectsUsedNotice', [project.name]));
      }
      render();
    });
    actions.appendChild(useBtn);

    const deleteBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-project-btn is-danger' },
      t('spProjectsDelete'),
    );
    let confirmTimer: ReturnType<typeof setTimeout> | null = null;
    const resetConfirm = (): void => {
      if (confirmTimer !== null) clearTimeout(confirmTimer);
      confirmTimer = null;
      deleteBtn.classList.remove('is-confirm');
      deleteBtn.textContent = t('spProjectsDelete');
      warning.hidden = true;
    };
    deleteBtn.addEventListener('click', () => {
      if (!deleteBtn.classList.contains('is-confirm')) {
        deleteBtn.classList.add('is-confirm');
        deleteBtn.textContent = t('spProjectsDeleteConfirm');
        warning.hidden = false;
        confirmTimer = setTimeout(resetConfirm, DELETE_CONFIRM_MS);
        return;
      }
      resetConfirm();
      deleteBtn.disabled = true;
      setStatus(t('spProjectsDeleting'));
      void deps
        .deleteProject(project.id)
        .then(async (result) => {
          if (result.status === 'error') {
            reportFailure(result);
            return;
          }
          if (deps.getActiveProject()?.id === project.id) deps.setActiveProject(null);
          openProjectId = null;
          // Only claim the delete landed when the reload agrees. Saying so over a
          // failed reload leaves an empty list reading as "no projects".
          if (await refresh()) setStatus(t('spProjectsDeleted'));
        })
        .finally(() => {
          deleteBtn.disabled = false;
        });
    });
    actions.appendChild(deleteBtn);
    detail.appendChild(actions);
    return detail;
  }

  function render(): void {
    const fragment = document.createDocumentFragment();
    const active = deps.getActiveProject();
    for (const project of projects) {
      const item = el('li', { class: 'sp-drawer-project' });
      if (active?.id === project.id) item.setAttribute('data-active', 'true');
      const summary = el('button', {
        type: 'button',
        class: 'sp-drawer-project-summary',
        'aria-expanded': String(openProjectId === project.id),
      });
      summary.appendChild(el('span', { class: 'sp-drawer-project-name' }, project.name));
      if (active?.id === project.id) {
        summary.appendChild(
          el('span', { class: 'sp-drawer-project-active-tag' }, t('spProjectsInUse')),
        );
      }
      summary.appendChild(
        el('span', { class: 'sp-drawer-project-count' }, formatChatCount(project)),
      );
      summary.addEventListener('click', () => {
        openProjectId = openProjectId === project.id ? null : project.id;
        render();
        if (openProjectId === project.id) void loadConversations(project.id);
      });
      item.appendChild(summary);
      if (openProjectId === project.id) item.appendChild(buildDetail(project));
      fragment.appendChild(item);
    }
    listEl.replaceChildren(fragment);
    emptyEl.hidden = projects.length > 0 || !statusEl.hidden;
  }

  async function loadConversations(projectId: string): Promise<void> {
    if (conversationsByProjectId.has(projectId)) return;
    const result = await deps.listConversations(projectId);
    if (result.status === 'error') {
      if (result.code === 'cancelled') return;
      conversationsByProjectId.set(projectId, 'failed');
    } else {
      conversationsByProjectId.set(projectId, result.conversations);
    }
    if (openProjectId === projectId) render();
  }

  async function refresh(): Promise<boolean> {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    setStatus(t('spProjectsLoading'));
    const result = await deps.listProjects({ signal: controller.signal });
    if (controller.signal.aborted) return false;
    if (result.status === 'error') {
      if (result.code === 'cancelled') return false;
      // A signed-out account has nothing to show; a rate limit or a server
      // error means this device could not ask, so the rows it already has stay
      // rather than being replaced by an empty list that reads as "you have none".
      if (result.code === 'auth_required') {
        projects = [];
        conversationsByProjectId = new Map();
      }
      reportFailure(result);
      render();
      return false;
    }
    projects = result.projects;
    conversationsByProjectId = new Map();
    setStatus('');
    render();
    return true;
  }

  function showForm(show: boolean): void {
    form.classList.toggle('open', show);
    if (show) {
      nameInput.value = '';
      instructionsInput.value = '';
      nameInput.focus();
    }
  }

  newBtn.addEventListener('click', () => showForm(!form.classList.contains('open')));
  cancelBtn.addEventListener('click', () => showForm(false));
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = t('spProjectsCreating');
    void deps
      .createProject({ name, instructions: instructionsInput.value })
      .then(async (result) => {
        if (result.status === 'error') {
          reportFailure(result);
          return;
        }
        showForm(false);
        await refresh();
      })
      .finally(() => {
        createBtn.disabled = false;
        createBtn.textContent = t('spProjectsCreate');
      });
  });

  render();

  return { sectionEl, refresh };
}
