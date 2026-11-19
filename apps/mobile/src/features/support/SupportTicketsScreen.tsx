import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LifeBuoy, Plus } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  MAX_TICKET_MESSAGE_CHARS,
  MAX_TICKET_SUBJECT_CHARS,
  TICKET_STATUS_LABEL,
} from '@agiworkforce/cloud-contracts/support';
import { listSupportTickets, openSupportTicket, type SupportTicketView } from './service';
import { SUPPORT_EMAIL } from './contact';
import { toUserMessage } from '@/services/userMessage';

function formatDate(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function SupportTicketsScreen() {
  const router = useRouter();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Support" backHref="/(app)/about">
        <CloudAccountRequired
          isLoading={!isClerkLoaded}
          onSignIn={() => router.push(beginCloudPostAuthIntent('cloud-support'))}
        />
      </SettingsScreenShell>
    );
  }

  if (appMode !== 'cloud') {
    return (
      <SettingsScreenShell title="Support" backHref="/(app)/about">
        <CloudSyncBlockedBanner
          message="Support tickets are kept in your Cloud account."
          onSwitchToCloud={() => setAppMode('cloud')}
        />
      </SettingsScreenShell>
    );
  }

  return <SupportTicketList key={clerkUserId ?? ''} />;
}

function SupportTicketList() {
  const router = useRouter();
  const colors = useThemeColors();
  const [tickets, setTickets] = useState<SupportTicketView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    generation.current += 1;
    setLoadError(null);
    setMoreError(null);
    setLoadingMore(false);
    try {
      const page = await listSupportTickets(signal);
      setTickets(page.tickets);
      setNextOffset(page.nextOffset);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(toUserMessage(error, 'Your tickets could not be loaded.'));
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingMore) return;
    const started = generation.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await listSupportTickets(undefined, nextOffset);
      if (generation.current !== started) return;
      setTickets((current) => {
        const known = new Set((current ?? []).map((ticket) => ticket.id));
        return [...(current ?? []), ...page.tickets.filter((ticket) => !known.has(ticket.id))];
      });
      setNextOffset(page.nextOffset);
    } catch (error) {
      if (generation.current !== started) return;
      setMoreError(toUserMessage(error, 'Your older tickets could not be loaded.'));
    } finally {
      if (generation.current === started) setLoadingMore(false);
    }
  }, [loadingMore, nextOffset]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [load]);

  const submit = useCallback(() => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject || !trimmedMessage) {
      Alert.alert('Add a subject and a description', 'A ticket needs both to reach support.');
      return;
    }
    void (async () => {
      setSubmitting(true);
      try {
        const opened = await openSupportTicket({
          subject: trimmedSubject,
          message: trimmedMessage,
          includeDiagnostics,
        });
        setSubject('');
        setMessage('');
        setComposing(false);
        await load();
        Alert.alert(
          'Ticket raised',
          opened.staffNotified
            ? 'The support team has been emailed about it. Replies appear here.'
            : `The ticket is saved, but if it’s urgent, also email ${SUPPORT_EMAIL}.`,
        );
      } catch (error) {
        Alert.alert('That ticket was not raised', toUserMessage(error, 'Please try again.'));
      } finally {
        setSubmitting(false);
      }
    })();
  }, [includeDiagnostics, load, message, subject]);

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.inputSurface, borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <SettingsScreenShell title="Support" backHref="/(app)/about">
      <SettingsInfo
        title="Raise a ticket"
        body="Describe the problem. Support replies here and by email."
        icon={LifeBuoy}
      />
      {composing ? (
        <View style={[styles.form, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            maxLength={MAX_TICKET_SUBJECT_CHARS}
            editable={!submitting}
            accessibilityLabel="Subject"
            style={inputStyle}
          />
          <Text style={[styles.label, { color: colors.textSecondary }]}>What happened</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            maxLength={MAX_TICKET_MESSAGE_CHARS}
            editable={!submitting}
            multiline
            textAlignVertical="top"
            accessibilityLabel="What happened"
            style={[...inputStyle, styles.multiline]}
          />
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleText, { color: colors.textPrimary }]}>
              Attach diagnostics: app version, platform, language, time zone and screen size.
              Nothing you were working on is sent.
            </Text>
            <Switch
              value={includeDiagnostics}
              onValueChange={setIncludeDiagnostics}
              disabled={submitting}
              accessibilityLabel="Attach diagnostics"
            />
          </View>
          <View style={styles.actions}>
            <Button
              title="Cancel"
              variant="ghost"
              disabled={submitting}
              onPress={() => setComposing(false)}
            />
            <Button title="Raise ticket" loading={submitting} onPress={submit} />
          </View>
        </View>
      ) : (
        <SettingsGroup>
          <SettingsRow label="New ticket" icon={Plus} onPress={() => setComposing(true)} isLast />
        </SettingsGroup>
      )}
      {loadError ? (
        <SettingsGroup>
          <SettingsRow
            label="Your tickets could not be loaded"
            icon={LifeBuoy}
            value="Retry"
            onPress={() => void load()}
            isLast
          />
        </SettingsGroup>
      ) : tickets === null ? (
        <SettingsGroup>
          <SettingsRow label="Loading your tickets" icon={LifeBuoy} value="Checking…" isLast />
        </SettingsGroup>
      ) : tickets.length === 0 ? (
        <SettingsGroup>
          <SettingsRow label="No tickets yet" icon={LifeBuoy} isLast />
        </SettingsGroup>
      ) : (
        <SettingsGroup>
          {tickets.map((ticket, index) => (
            <SettingsRow
              key={ticket.id}
              label={ticket.subject}
              icon={LifeBuoy}
              value={`${TICKET_STATUS_LABEL[ticket.status]} · ${formatDate(ticket.updatedAt)}`}
              onPress={() =>
                router.push(
                  `/(app)/support/${encodeURIComponent(ticket.id)}` as Parameters<
                    typeof router.push
                  >[0],
                )
              }
              isLast={index === tickets.length - 1 && nextOffset === null}
            />
          ))}
          {nextOffset !== null ? (
            <SettingsRow
              label={moreError ? 'Older tickets could not be loaded' : 'Show older tickets'}
              icon={LifeBuoy}
              value={loadingMore ? 'Loading…' : moreError ? 'Retry' : undefined}
              onPress={loadingMore ? undefined : () => void loadMore()}
              isLast
            />
          ) : null}
        </SettingsGroup>
      )}
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  form: { borderRadius: 14, padding: 14, gap: 8, marginBottom: 24 },
  label: { fontSize: typeScale.footnote },
  input: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    fontSize: typeScale.body,
  },
  multiline: { minHeight: 120, paddingTop: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  toggleText: { flex: 1, fontSize: typeScale.footnote, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
