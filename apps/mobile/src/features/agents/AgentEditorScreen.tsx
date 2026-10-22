import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type BottomSheet from '@gorhom/bottom-sheet';
import { agentCanChat } from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/button';
import { DEFAULT_AUTO_MODE_ID } from '@/lib/models';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import {
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { hiddenSharerIds } from '@/src/features/shared-with-you/hiddenSharers';
import { SharedItemSafetyActions } from '@/src/features/shared-with-you/SharedItemSafetyActions';
import { useThemeColors } from '@/src/ui/theme';
import { AGENTS_ROUTE, NEW_AGENT_ID } from './AgentsScreen';
import { AgentConfigSections, useAgentChoices } from './components/AgentConfigSections';
import { AgentManageSections } from './components/AgentManageSections';
import { agentActionError, startAgentConversation } from './service';
import { useAgentEditor } from './useAgentEditor';

export function AgentEditorScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const agentId = id && id !== NEW_AGENT_ID ? id : null;
  const access = useCloudFeatureAccess();
  const goBack = useGoBack(AGENTS_ROUTE);
  const editor = useAgentEditor(agentId, access.ready);
  const choices = useAgentChoices();
  const modelSheetRef = useRef<BottomSheet>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [startingChat, setStartingChat] = useState(false);
  const [hiddenNow, setHiddenNow] = useState(false);

  const save = useCallback(async () => {
    const saved = await editor.save();
    if (saved && !agentId) {
      router.replace({ pathname: '/(app)/agents/[id]' as const, params: { id: saved.id } });
    }
  }, [agentId, editor, router]);

  const startChat = useCallback(async () => {
    if (!editor.agent || startingChat) return;
    setStartingChat(true);
    setChatError(null);
    try {
      const conversationId = await startAgentConversation(editor.agent.id);
      router.push({ pathname: '/(app)/chat/[id]' as const, params: { id: conversationId } });
    } catch (error) {
      setChatError(agentActionError(error, 'Could not start a chat with this agent.'));
    } finally {
      setStartingChat(false);
    }
  }, [editor.agent, router, startingChat]);

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Agent"
        feature="Agents"
        description="Agents run in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  const title = agentId ? editor.agent?.name || 'Agent' : 'New agent';
  const sharedAgent =
    editor.agent && !editor.agent.isOwner && editor.agent.ownerUserId
      ? { agent: editor.agent, sharerId: editor.agent.ownerUserId }
      : null;
  const sharerHidden =
    sharedAgent !== null &&
    (hiddenNow ||
      (access.ownerId !== null && hiddenSharerIds(access.ownerId).has(sharedAgent.sharerId)));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader
        title={title}
        onBack={goBack}
        trailing={
          editor.editable ? (
            <Button
              title={agentId ? 'Save' : 'Create'}
              size="sm"
              loading={editor.saving}
              disabled={!editor.dirty || editor.problem !== null}
              accessibilityLabel={agentId ? 'Save changes as a draft' : 'Create the agent'}
              onPress={() => void save()}
            />
          ) : null
        }
      />
      {sharerHidden ? (
        <EmptyState title="Hidden" body="You hid this sharer." />
      ) : editor.load.status === 'loading' ? (
        <LoadingRows count={4} />
      ) : editor.load.status === 'error' ? (
        <EmptyState
          title="Could not load this agent"
          body={editor.load.message}
          action={<Button title="Try again" variant="outline" onPress={editor.reload} />}
        />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
          >
            {editor.agent && agentCanChat(editor.agent) ? (
              <Button
                title={`Chat with ${editor.agent.name}`}
                loading={startingChat}
                onPress={() => void startChat()}
              />
            ) : null}
            {chatError ? <ErrorBanner message={chatError} /> : null}
            {editor.saveError ? <ErrorBanner message={editor.saveError} /> : null}
            {editor.problem && editor.dirty ? <MetaText>{editor.problem}</MetaText> : null}
            {!editor.editable ? <MetaText>Only the owner can change this agent.</MetaText> : null}
            {sharedAgent ? (
              <SharedItemSafetyActions
                item={{ kind: 'agent', id: sharedAgent.agent.id, sharerId: sharedAgent.sharerId }}
                title={sharedAgent.agent.name}
                ownerName={sharedAgent.agent.ownerName ?? 'sharer'}
                accountId={access.ownerId}
                onHidden={() => setHiddenNow(true)}
              />
            ) : null}
            <AgentConfigSections
              draft={editor.draft}
              disabled={!editor.editable || editor.saving}
              choices={choices}
              onChange={editor.change}
              onChooseModel={() => modelSheetRef.current?.snapToIndex(0)}
            />
            {editor.agent && editor.agent.isOwner ? (
              <View style={{ marginTop: 4 }}>
                <AgentManageSections
                  agent={editor.agent}
                  dirty={editor.dirty}
                  onAgent={editor.replaceAgent}
                  onDeleted={() =>
                    router.replace(AGENTS_ROUTE as Parameters<typeof router.replace>[0])
                  }
                />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ModelPickerSheet
        sheetRef={modelSheetRef}
        modelScope="cloud"
        onSelect={(model) =>
          editor.change({ model: model === DEFAULT_AUTO_MODE_ID ? null : model })
        }
      />
    </SafeAreaView>
  );
}
