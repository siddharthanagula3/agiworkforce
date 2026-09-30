import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  builtInRoleKeyForMembershipRole,
  canonicalOrganizationPermissions,
  ORGANIZATION_PERMISSION_COPY,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import type { WorkspaceMember, WorkspaceRole } from './service';

interface RolePickerModalProps {
  member: WorkspaceMember | null;
  roles: readonly WorkspaceRole[];
  ownershipConsequence: string | null;
  onCancel: () => void;
  onChoose: (member: WorkspaceMember, role: WorkspaceRole) => void;
}

function roleDefinition(role: WorkspaceRole) {
  return BUILT_IN_ORGANIZATION_ROLES[builtInRoleKeyForMembershipRole(role)];
}

export function RolePickerModal({
  member,
  roles,
  ownershipConsequence,
  onCancel,
  onChoose,
}: RolePickerModalProps) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<WorkspaceRole | null>(member?.role ?? null);

  useEffect(() => {
    setSelected(member?.role ?? null);
  }, [member]);

  const definition = selected ? roleDefinition(selected) : null;
  const transfersOwnership = selected === 'owner' && member?.role !== 'owner';
  const abilities = definition
    ? canonicalOrganizationPermissions(definition.permissions).map(
        (permission) => ORGANIZATION_PERMISSION_COPY[permission],
      )
    : [];

  return (
    <Modal
      visible={member !== null}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surfaceBase, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {member ? `Role for ${member.name}` : 'Role'}
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {roles.map((role) => {
              const option = roleDefinition(role);
              const isSelected = role === selected;
              return (
                <Pressable
                  key={role}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${option.name}. ${option.description}`}
                  onPress={() => setSelected(role)}
                  style={[
                    styles.option,
                    {
                      borderColor: isSelected ? colors.textPrimary : colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                >
                  <View style={styles.optionText}>
                    <Text style={[styles.optionName, { color: colors.textPrimary }]}>
                      {option.name}
                    </Text>
                    <Text style={[styles.optionBody, { color: colors.textSecondary }]}>
                      {option.description}
                    </Text>
                  </View>
                  {isSelected ? <Check size={18} color={colors.textPrimary} /> : null}
                </Pressable>
              );
            })}
            {definition ? (
              <View style={styles.abilities}>
                <Text style={[styles.abilitiesTitle, { color: colors.textPrimary }]}>
                  {`${definition.name} can`}
                </Text>
                {abilities.map((ability) => (
                  <Text key={ability} style={[styles.ability, { color: colors.textSecondary }]}>
                    {`• ${ability}`}
                  </Text>
                ))}
              </View>
            ) : null}
            {transfersOwnership && ownershipConsequence ? (
              <Text style={[styles.warning, { color: colors.agentWarning }]}>
                {ownershipConsequence}
              </Text>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button title="Cancel" variant="ghost" onPress={onCancel} />
            <Button
              title={transfersOwnership ? 'Transfer ownership' : 'Save role'}
              variant={transfersOwnership ? 'destructive' : 'primary'}
              disabled={!member || !selected || selected === member.role}
              onPress={() => {
                if (member && selected && selected !== member.role) onChoose(member, selected);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    borderRadius: 14,
    borderWidth: 1,
    padding: dialogPadding,
    gap: 12,
  },
  title: { fontSize: typeScale.headline, fontWeight: '600' },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  optionText: { flex: 1, gap: 2 },
  optionName: { fontSize: typeScale.body, fontWeight: '600' },
  optionBody: { fontSize: typeScale.footnote, lineHeight: 18 },
  abilities: { gap: 4, paddingTop: 8 },
  abilitiesTitle: { fontSize: typeScale.subhead, fontWeight: '600' },
  ability: { fontSize: typeScale.footnote, lineHeight: 19 },
  warning: { fontSize: typeScale.footnote, lineHeight: 19, paddingTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
