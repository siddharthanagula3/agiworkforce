import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, StyleSheet, TextInput, View } from 'react-native';
import { Check, MailPlus, ShieldCheck, TriangleAlert, Users } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import { API_URL } from '@/lib/constants';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { SettingsGroup, SettingsInfo, SettingsRow } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import {
  INVITABLE_ROLES,
  fetchWorkspaceInvitations,
  fetchWorkspacePosture,
  inviteWorkspaceMember,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  type InvitableRole,
  type WorkspaceInvitation,
  type WorkspaceInvitations,
  type WorkspacePosture,
} from './administration';
import { toUserMessage } from '@/services/userMessage';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatExpiry(iso: string | null): string {
  if (!iso) return 'Pending';
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? 'Pending'
    : `Expires ${at.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

function seatSummary(invitations: WorkspaceInvitations): string {
  const { licensedSeats, seatsConsumed, seatsAvailable } = invitations.seats;
  if (licensedSeats === null || seatsConsumed === null) return 'Not available';
  return `${seatsConsumed} of ${licensedSeats} used · ${seatsAvailable ?? 0} available`;
}

function InviteMemberModal({
  visible,
  onCancel,
  onInvite,
}: {
  visible: boolean;
  onCancel: () => void;
  onInvite: (email: string, role: InvitableRole) => Promise<void>;
}) {
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('member');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) return;
    setEmail('');
    setRole('member');
  }, [visible]);

  const trimmed = email.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView style={styles.flex} behavior={keyboardAvoidingBehavior('modal')}>
        <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surfaceBase, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]}>Invite by email</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              They get an email with a link that expires. Joining takes a seat.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              editable={!sending}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email address"
              placeholder="name@company.com"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputSurface,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
            />
            {INVITABLE_ROLES.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: option === role }}
                onPress={() => setRole(option)}
                style={[
                  styles.option,
                  { borderColor: option === role ? colors.textPrimary : colors.border },
                ]}
              >
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                  {titleCase(option)}
                </Text>
                {option === role ? <Check size={16} color={colors.textPrimary} /> : null}
              </Pressable>
            ))}
            <View style={styles.actions}>
              <Button title="Cancel" variant="ghost" disabled={sending} onPress={onCancel} />
              <Button
                title="Send invitation"
                loading={sending}
                disabled={!trimmed}
                onPress={() => {
                  void (async () => {
                    setSending(true);
                    try {
                      await onInvite(trimmed, role);
                    } finally {
                      setSending(false);
                    }
                  })();
                }}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function WorkspaceAdministration({ organizationId }: { organizationId: string }) {
  const [invitations, setInvitations] = useState<WorkspaceInvitations | null>(null);
  const [posture, setPosture] = useState<WorkspacePosture | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoadError(null);
      try {
        const [nextInvitations, nextPosture] = await Promise.all([
          fetchWorkspaceInvitations(organizationId, signal),
          fetchWorkspacePosture(signal),
        ]);
        setInvitations(nextInvitations);
        setPosture(nextPosture);
      } catch (error) {
        if (signal?.aborted) return;
        setLoadError(toUserMessage(error, 'Workspace administration could not load.'));
      }
    },
    [organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const invite = useCallback(
    async (email: string, role: InvitableRole) => {
      try {
        await inviteWorkspaceMember(organizationId, email, role);
        setInviting(false);
        await load();
      } catch (error) {
        Alert.alert('The invitation was not sent', toUserMessage(error, 'Please try again.'));
      }
    },
    [load, organizationId],
  );

  const runInvitationAction = useCallback(
    (invitation: WorkspaceInvitation, action: 'resend' | 'revoke') => {
      void (async () => {
        setBusyInvitationId(invitation.id);
        try {
          if (action === 'resend') await resendWorkspaceInvitation(organizationId, invitation.id);
          else await revokeWorkspaceInvitation(organizationId, invitation.id);
          await load();
        } catch (error) {
          Alert.alert(
            action === 'resend'
              ? 'The invitation was not resent'
              : 'The invitation was not revoked',
            toUserMessage(error, 'Please try again.'),
          );
        } finally {
          setBusyInvitationId(null);
        }
      })();
    },
    [load, organizationId],
  );

  const manageInvitation = useCallback(
    (invitation: WorkspaceInvitation) => {
      Alert.alert(invitation.email, `Invited as ${titleCase(invitation.role)}.`, [
        { text: 'Resend invitation', onPress: () => runInvitationAction(invitation, 'resend') },
        {
          text: 'Revoke invitation',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Revoke this invitation?',
              `${invitation.email} can no longer join with it, and its seat is released.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Revoke',
                  style: 'destructive',
                  onPress: () => runInvitationAction(invitation, 'revoke'),
                },
              ],
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [runInvitationAction],
  );

  if (loadError) {
    return (
      <SettingsGroup>
        <SettingsRow
          label="Workspace administration could not load"
          icon={TriangleAlert}
          value="Retry"
          onPress={() => void load()}
          isLast
        />
      </SettingsGroup>
    );
  }

  if (!invitations || !posture) {
    return (
      <SettingsGroup>
        <SettingsRow label="Loading administration" icon={Users} value="Checking…" isLast />
      </SettingsGroup>
    );
  }

  return (
    <>
      <InviteMemberModal visible={inviting} onCancel={() => setInviting(false)} onInvite={invite} />
      <SettingsInfo
        title="Seats and invitations"
        body="Pending invitations hold a seat until they are accepted, expire or are revoked."
        icon={Users}
      />
      <SettingsGroup>
        <SettingsRow label="Seats" icon={Users} value={seatSummary(invitations)} />
        {invitations.invitations.map((invitation) => (
          <SettingsRow
            key={invitation.id}
            label={invitation.email}
            icon={MailPlus}
            value={
              busyInvitationId === invitation.id
                ? 'Working…'
                : `${titleCase(invitation.role)} · ${formatExpiry(invitation.expiresAt)}`
            }
            onPress={busyInvitationId ? undefined : () => manageInvitation(invitation)}
          />
        ))}
        <SettingsRow
          label="Invite by email"
          icon={MailPlus}
          onPress={() => setInviting(true)}
          isLast
        />
      </SettingsGroup>
      {posture.groups.map((group) => (
        <View key={group.id}>
          <SettingsInfo
            title={group.title}
            body={
              group.signals.some((signal) => signal.state === 'attention')
                ? 'Some of these need attention. The web admin console explains each one.'
                : 'Everything here is in place.'
            }
            icon={ShieldCheck}
          />
          <SettingsGroup>
            {group.signals.map((signal, index) => (
              <SettingsRow
                key={signal.id}
                label={signal.label}
                icon={signal.state === 'attention' ? TriangleAlert : ShieldCheck}
                value={signal.value}
                isLast={index === group.signals.length - 1}
              />
            ))}
          </SettingsGroup>
        </View>
      ))}
      {posture.recommendations.length > 0 ? (
        <SettingsGroup>
          {posture.recommendations.map((recommendation, index) => (
            <SettingsRow
              key={recommendation.id}
              label={recommendation.title}
              icon={TriangleAlert}
              value="Web"
              onPress={() =>
                void openInAppBrowser(new URL(recommendation.href, API_URL).toString())
              }
              isLast={index === posture.recommendations.length - 1}
            />
          ))}
        </SettingsGroup>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    padding: dialogPadding,
    borderWidth: 1,
    gap: 10,
  },
  title: { fontSize: typeScale.headline, fontWeight: '600' },
  body: { fontSize: typeScale.subhead, lineHeight: 20 },
  input: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    fontSize: typeScale.body,
  },
  option: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: { fontSize: typeScale.body },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
