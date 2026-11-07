import { readFileSync } from 'fs';
import { join } from 'path';
import { runComposerAttachmentPick } from '../utils/runComposerAttachmentPick';
import type { Attachment } from '../components/AttachmentPreview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const image: Attachment = {
  id: 'picked', uri: 'file:///original.png', fileName: 'original.png', mimeType: 'image/png',
};

function operation() {
  let current = true;
  return {
    isCurrent: () => current,
    addAttachments: jest.fn(),
    retire: () => { current = false; },
  };
}

describe('native attachment pick settlement', () => {
  it('publishes only to the captured operation', async () => {
    const scope = operation();
    const picked = deferred<Attachment[]>();
    const done = runComposerAttachmentPick(scope, () => picked.promise, jest.fn());
    picked.resolve([image]);
    await done;
    expect(scope.addAttachments).toHaveBeenCalledWith([image]);
  });

  it('ignores stale normalization/cache completion without modifying original files', async () => {
    const scope = operation();
    const picked = deferred<Attachment[]>();
    const error = jest.fn();
    const done = runComposerAttachmentPick(scope, () => picked.promise, error);
    scope.retire();
    picked.resolve([image]);
    await done;
    expect(scope.addAttachments).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(image.uri).toBe('file:///original.png');
  });

  it('suppresses stale failures but reports current failures', async () => {
    const scope = operation();
    const picked = deferred<Attachment[]>();
    const error = jest.fn();
    const done = runComposerAttachmentPick(scope, () => picked.promise, error);
    scope.retire();
    picked.reject(new Error('stale'));
    await done;
    expect(error).not.toHaveBeenCalled();
    const failure = new Error('current');
    await runComposerAttachmentPick(operation(), () => Promise.reject(failure), error);
    expect(error).toHaveBeenCalledWith(failure);
  });

  it('does not start unavailable operations or supersede concurrent picks', async () => {
    const pick = jest.fn(async () => [image]);
    await runComposerAttachmentPick(null, pick, jest.fn());
    expect(pick).not.toHaveBeenCalled();
    const scope = operation();
    const first = deferred<Attachment[]>();
    const second = deferred<Attachment[]>();
    const a = runComposerAttachmentPick(scope, () => first.promise, jest.fn());
    const b = runComposerAttachmentPick(scope, () => second.promise, jest.fn());
    second.resolve([image]);
    first.resolve([{ ...image, id: 'other', uri: 'file:///other.png' }]);
    await Promise.all([a, b]);
    expect(scope.addAttachments).toHaveBeenCalledTimes(2);
  });

  it('does not launch a second native operation after a retired permission request', async () => {
    const scope = operation();
    const permission = deferred<void>();
    const launch = jest.fn(async () => [image]);
    const done = runComposerAttachmentPick(scope, async (captured) => {
      await permission.promise;
      if (!captured.isCurrent()) return [];
      return launch();
    }, jest.fn());
    scope.retire();
    permission.resolve();
    await done;
    expect(launch).not.toHaveBeenCalled();
  });
});

const root = join(__dirname, '../../../..');
for (const [route, mode] of [
  ['app/(app)/(tabs)/chat.tsx', 'activeMode'],
  ['app/(app)/chat/[id].tsx', 'conversationExecutionMode'],
]) {
  it(`wires ${route} native continuations to composer ownership`, () => {
    const source = readFileSync(join(root, route!), 'utf8');
    const native = source.slice(source.indexOf('  const handleSheetCamera'), source.indexOf('  const handle', source.indexOf('  const handleSheetFile') + 20));
    expect(native.match(new RegExp(`captureAttachmentOperation\\(${mode}\\)`, 'g'))).toHaveLength(4);
    expect(native.match(/runComposerAttachmentPick\(operation/g)).toHaveLength(4);
    expect(native).not.toContain('chatInputAttachRef.current?.addAttachments');
    expect(native).toMatch(/await ImagePicker.requestCameraPermissionsAsync\(\);\s+if \(!scope.isCurrent\(\)\) return \[\];/);
    expect(native).toContain('if (scope.isCurrent()) void Linking.openSettings();');
    expect(native).toContain("scope.isCurrent() ? imageAssetsToChatAttachments(assets, 'cam') : []");
    expect(native).toContain('scope.isCurrent() ? imageAssetsToChatAttachments(assets) : []');
    expect(native).toContain('if (!scope.isCurrent() || result.canceled) return [];');
    expect(native).not.toMatch(/deleteAsync|unlink|AppState/);
  });
}

it('rechecks ownership inside the final attachment updater without alert side effects there', () => {
  const source = readFileSync(join(root, 'src/features/chat/components/ChatInput.tsx'), 'utf8');
  const updater = source.slice(source.indexOf('setAttachments((prev) => {'), source.indexOf('if (!isCurrent()) return;', source.indexOf('setAttachments((prev) => {')));
  expect(updater).toContain('if (!isCurrent()) return prev;');
  expect(updater).not.toContain('Alert.alert');
});
