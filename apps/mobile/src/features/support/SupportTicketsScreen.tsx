import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LifeBuoy, Plus } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  CloudAccountRequired,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  MAX_TICKET_MESSAGE_CHARS,
  MAX_TICKET_SUBJECT_CHARS,
  TICKET_STATUS_LABEL,
} from '@agiworkforce/cloud-contracts/support';
import { listSupportTickets, openSupportTicket, type SupportTicketView } from './service';
import { toUserMessage } from '@/services/userMessage';

const SUPPORT_EMAIL = 'contact@agiworkforce.com';

function formatDate(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function SupportTicketsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const [tickets, setTickets] = useState<SupportTicketView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    try {
      setTickets(await listSupportTickets(signal));
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(toUserMessage(error, 'Your tickets could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [appMode, isClerkSignedIn, load]);

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
            : `The ticket is saved, but the email that tells the support team about it was not sent. If this is urgent, also write to ${SUPPORT_EMAIL}.`,
        );
      } catch (error) {
        Alert.alert('That ticket was not raised', toUserMessage(error, 'Please try again.'));
      } finally {
        setSubmitting(false);
      }
    })();
  }, [includeDiagnostics, load, message, subject]);

  if (!isClerkLoaded || !isClerkSignedIn || appMode !== 'cloud') {
    return (
      <SettingsScreenShell title="Support" backHref="/(app)/about">
        <CloudAccountRequired
          isLoading={!isClerkLoaded}
          onSignIn={() => router.push('/(auth)/login' as Parameters<typeof router.push>[0])}
        />
      </SettingsScreenShell>
    );
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.inputSurface, borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <SettingsScreenShell title="Support" backHref="/(app)/about">
      <SettingsInfo
        title="Raise a ticket"
        body="Describe what went wrong and the support team replies here. Replies are not emailed."
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
              isLast={index === tickets.length - 1}
            />
          ))}
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
