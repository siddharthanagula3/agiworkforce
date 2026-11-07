export type SharePreviewStatus =
  'idle' | 'pending' | 'refused' | 'accepted' | 'uncertain' | 'invalid';

interface SharePreviewAdmissionDependencies {
  isCurrent: () => boolean;
  conversationExists: (id: string) => boolean;
  createConversation: (title: string) => Promise<string>;
  sendMessage: (
    id: string,
    content: string,
    model: string,
    onAccepted: () => void,
  ) => Promise<unknown>;
  navigate: (id: string | null) => void;
  onChange: (status: SharePreviewStatus) => void;
}

export function createSharePreviewAdmission(dependencies: SharePreviewAdmissionDependencies) {
  let status: SharePreviewStatus = 'idle';
  let conversationId: string | null = null;
  let valid = true;
  let admitted = false;
  let navigated = false;

  const update = (next: SharePreviewStatus) => {
    status = next;
    dependencies.onChange(next);
  };
  const invalidate = () => {
    valid = false;
    update('invalid');
  };
  const isCurrent = () => {
    if (!valid || !dependencies.isCurrent()) {
      if (valid) invalidate();
      return false;
    }
    return true;
  };
  const acquire = () => {
    if (!isCurrent() || (status !== 'idle' && status !== 'refused')) return false;
    update('pending');
    return true;
  };
  const navigate = (id: string | null) => {
    if (!isCurrent()) return;
    try {
      dependencies.navigate(id);
      navigated = true;
    } catch {
      // Admission must not throw back into the send pipeline when routing fails.
    }
  };
  const accept = () => {
    admitted = true;
    if (!isCurrent()) return;
    update('accepted');
    if (!navigated) navigate(conversationId);
  };

  return {
    invalidate,
    isCurrent,
    acquire,
    checkChat() {
      if (!isCurrent() || (status !== 'accepted' && status !== 'uncertain')) return;
      navigate(
        conversationId && dependencies.conversationExists(conversationId) ? conversationId : null,
      );
    },
    async send(title: string, content: string, model: string) {
      if (!acquire()) return;
      try {
        if (!conversationId) conversationId = await dependencies.createConversation(title);
        if (!isCurrent()) return;
        if (!dependencies.conversationExists(conversationId)) {
          update('uncertain');
          return;
        }
        const result = await dependencies.sendMessage(conversationId, content, model, accept);
        if (!isCurrent() || admitted) return;
        if (result === true) accept();
        else update(result === false ? 'refused' : 'uncertain');
      } catch {
        if (isCurrent() && !admitted) update('uncertain');
      }
    },
  };
}
