import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { SettingsScreenShell } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  MAX_TICKET_MESSAGE_CHARS,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_MEANING,
} from '@agiworkforce/cloud-contracts/support';
import {
  canReplyToTicket,
  closeSupportTicket,
  readSupportTicket,
  replyToSupportTicket,
  type SupportTicketThreadView,
} from './service';
import { toUserMessage } from '@/services/userMessage';

function formatDateTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function SupportTicketScreen({ ticketId }: { ticketId: string }) {
  const colors = useThemeColors();
  const [thread, setThread] = useState<SupportTicketThreadView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoadError(null);
      try {
        setThread(await readSupportTicket(ticketId, signal));
      } catch (error) {
        if (signal?.aborted) return;
        setLoadError(toUserMessage(error, 'This ticket could not be loaded.'));
      }
    },
    [ticketId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const sendReply = useCallback(() => {
    const trimmed = reply.trim();
    if (!trimmed) return;
    void (async () => {
      setSending(true);
      try {
        setThread(await replyToSupportTicket(ticketId, trimmed));
        setReply('');
      } catch (error) {
        Alert.alert('That reply was not added', toUserMessage(error, 'Please try again.'));
      } finally {
        setSending(false);
      }
    })();
  }, [reply, ticketId]);

  const confirmClose = useCallback(() => {
    Alert.alert(
      'Close this ticket?',
      'A closed ticket cannot be reopened and no further replies can be added to it. The thread stays readable, and carrying on means raising a new ticket that references this one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close ticket',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setClosing(true);
              try {
                await closeSupportTicket(ticketId);
                await load();
              } catch (error) {
                Alert.alert('The ticket was not closed', toUserMessage(error, 'Please try again.'));
              } finally {
                setClosing(false);
              }
            })();
          },
        },
      ],
    );
  }, [load, ticketId]);

  if (loadError) {
    return (
      <SettingsScreenShell title="Ticket" backHref="/(app)/support">
        <Text style={[styles.body, { color: colors.textSecondary }]}>{loadError}</Text>
        <View style={styles.actions}>
          <Button title="Retry" variant="outline" onPress={() => void load()} />
        </View>
      </SettingsScreenShell>
    );
  }

  if (!thread) {
    return (
      <SettingsScreenShell title="Ticket" backHref="/(app)/support">
        <Text style={[styles.body, { color: colors.textSecondary }]}>Loading the ticket…</Text>
      </SettingsScreenShell>
    );
  }

  const { ticket, replies } = thread;
  const open = canReplyToTicket(ticket.status);

  return (
    <SettingsScreenShell title="Ticket" backHref="/(app)/support">
      <Text style={[styles.subject, { color: colors.textPrimary }]}>{ticket.subject}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {`${TICKET_STATUS_LABEL[ticket.status]} · ${TICKET_STATUS_MEANING[ticket.status]}`}
      </Text>
      <View style={[styles.message, { backgroundColor: colors.surfaceElevated }]}>
        <Text style={[styles.author, { color: colors.textSecondary }]}>
          {`You · ${formatDateTime(ticket.createdAt)}`}
        </Text>
        <Text style={[styles.body, { color: colors.textPrimary }]}>{ticket.message}</Text>
      </View>
      {replies.map((entry) => (
        <View key={entry.id} style={[styles.message, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.author, { color: colors.textSecondary }]}>
            {`${entry.isStaff ? 'AGI support' : 'You'} · ${formatDateTime(entry.createdAt)}`}
          </Text>
          <Text style={[styles.body, { color: colors.textPrimary }]}>{entry.message}</Text>
        </View>
      ))}
      {open ? (
        <View style={styles.composer}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            maxLength={MAX_TICKET_MESSAGE_CHARS}
            editable={!sending}
            multiline
            textAlignVertical="top"
            placeholder="Write a reply"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Reply"
            style={[
              styles.input,
              {
                backgroundColor: colors.inputSurface,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
          />
          <View style={styles.actions}>
            <Button
              title="Close ticket"
              variant="ghost"
              disabled={closing || sending}
              onPress={confirmClose}
            />
            <Button
              title="Send reply"
              loading={sending}
              disabled={!reply.trim() || closing}
              onPress={sendReply}
            />
          </View>
        </View>
      ) : null}
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  subject: { fontSize: typeScale.headline, fontWeight: '600', marginBottom: 4 },
  meta: { fontSize: typeScale.footnote, lineHeight: 18, marginBottom: 16 },
  message: { borderRadius: 12, padding: 12, gap: 4, marginBottom: 10 },
  author: { fontSize: typeScale.caption },
  body: { fontSize: typeScale.body, lineHeight: 21 },
  composer: { gap: 8, marginTop: 8 },
  input: {
    minHeight: 96,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderWidth: 1,
    fontSize: typeScale.body,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
