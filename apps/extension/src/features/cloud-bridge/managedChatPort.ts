const PORT_PREFIX = 'agi-managed-chat:';
const CLIENT_INSTANCE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export function createManagedChatPortName(clientInstanceId: string): string {
  if (!CLIENT_INSTANCE_PATTERN.test(clientInstanceId)) {
    throw new Error('Invalid Managed chat client instance identifier.');
  }
  return `${PORT_PREFIX}${clientInstanceId}`;
}

export function parseManagedChatPortName(name: string): string | null {
  if (!name.startsWith(PORT_PREFIX)) return null;
  const clientInstanceId = name.slice(PORT_PREFIX.length);
  return CLIENT_INSTANCE_PATTERN.test(clientInstanceId) ? clientInstanceId : null;
}
