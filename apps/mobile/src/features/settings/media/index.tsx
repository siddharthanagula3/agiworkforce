import { useCallback, useMemo, useState } from 'react';
import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Images } from 'lucide-react-native';
import { getModelMetadataById, getProviderDisplayLabel } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { SettingsGroup, SettingsRow, SettingsScreenShell } from '@/src/features/settings/Common';
import { listMediaModels, resolveMediaModelId } from '@/src/features/chat/actions/mediaMode';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAppModeSwitch } from '@/src/features/chat/hooks/useAppModeSwitch';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { MEDIA_SCREEN_TITLE } from '../screenTitles';
import { useImageModelChoosable } from './useImageModelChoosable';
import { contentColumn } from '@/src/shared/layout/contentColumn';

const IMAGE_MODEL_LABEL = 'Image generation model';
const DEFAULT_CHOICE_LABEL = 'Default';
const NOT_AVAILABLE_VALUE = 'Not available';
const SWITCH_TO_CLOUD_VALUE = 'Switch to AGI Cloud';
const SIGN_IN_VALUE = 'Sign in';

function modelName(modelId: string): string {
  return getModelMetadataById(modelId)?.name ?? modelId;
}

function providerLine(modelId: string): string | null {
  const provider = getModelMetadataById(modelId)?.provider;
  return provider ? getProviderDisplayLabel(provider) : null;
}

function followRegistryDefault() {
  useChatViewStore.setState((state) => {
    const { image: _image, ...rest } = state.selectedMediaModel;
    return { selectedMediaModel: rest };
  });
}

function ChoiceRow({
  testID,
  label,
  detail,
  selected,
  isLast,
  onPress,
}: {
  testID: string;
  label: string;
  detail: string | null;
  selected: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[label, detail, selected ? 'selected' : null].filter(Boolean).join(', ')}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 8,
        paddingHorizontal: dialogPadding,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontSize: typeScale.callout, color: colors.textPrimary }}>
          {label}
        </Text>
        {detail ? (
          <Text
            numberOfLines={1}
            style={{ fontSize: typeScale.caption, color: colors.textMuted, marginTop: 1 }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={18} color={colors.textPrimary} /> : null}
    </Pressable>
  );
}

function ImageModelSheet({
  visible,
  models,
  selectedId,
  defaultId,
  onClose,
}: {
  visible: boolean;
  models: readonly string[];
  selectedId: string | undefined;
  defaultId: string | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const setMediaModel = useChatViewStore((s) => s.setMediaModel);
  const followsDefault = selectedId === undefined || !models.includes(selectedId);

  const choose = useCallback(
    (apply: () => void) => () => {
      apply();
      onClose();
    },
    [onClose],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        onPress={onClose}
        accessibilityLabel="Dismiss image models"
        accessibilityRole="button"
        accessible={false}
      >
        <Pressable
          testID="media.image-model-sheet"
          onPress={() => undefined}
          accessible={false}
          style={{
            ...contentColumn('reading'),
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 8,
            paddingBottom: 8 + insets.bottom,
          }}
        >
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              fontSize: typeScale.caption,
              color: colors.textMuted,
              paddingHorizontal: dialogPadding,
              paddingBottom: 8,
            }}
          >
            {IMAGE_MODEL_LABEL}
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: height * 0.6 }}
            bounces={false}
          >
            <ChoiceRow
              testID="media.image-model.default"
              label={DEFAULT_CHOICE_LABEL}
              detail={defaultId ? modelName(defaultId) : null}
              selected={followsDefault}
              isLast={models.length === 0}
              onPress={choose(followRegistryDefault)}
            />
            {models.map((modelId, index) => (
              <ChoiceRow
                key={modelId}
                testID={`media.image-model.${modelId}`}
                label={modelName(modelId)}
                detail={providerLine(modelId)}
                selected={!followsDefault && modelId === selectedId}
                isLast={index === models.length - 1}
                onPress={choose(() => setMediaModel('image', modelId))}
              />
            ))}
          </ScrollView>
          <Pressable
            testID="media.image-model-cancel"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{
              minHeight: 52,
              justifyContent: 'center',
              paddingHorizontal: dialogPadding,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: typeScale.callout,
                fontWeight: '600',
                color: colors.textSecondary,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function MediaSettingsScreen() {
  const appMode = useChatAppModeStore((s) => s.appMode);
  const { switchToCloud, cloudUnlocked } = useAppModeSwitch();
  const choosable = useImageModelChoosable();
  const selectedMediaModel = useChatViewStore((s) => s.selectedMediaModel);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const models = useMemo(() => listMediaModels('image'), []);
  const isCloud = appMode === 'cloud';

  if (!isCloud) {
    return (
      <SettingsScreenShell title={MEDIA_SCREEN_TITLE}>
        <SettingsGroup footnote="Images are created in AGI Cloud.">
          <SettingsRow
            label={IMAGE_MODEL_LABEL}
            icon={Images}
            value={cloudUnlocked ? SWITCH_TO_CLOUD_VALUE : SIGN_IN_VALUE}
            onPress={() => void switchToCloud()}
            isLast
          />
        </SettingsGroup>
      </SettingsScreenShell>
    );
  }

  const currentId = resolveMediaModelId('image', selectedMediaModel);
  const defaultId = resolveMediaModelId('image', {});
  const available = models.length > 0 && choosable;
  const value = !available
    ? NOT_AVAILABLE_VALUE
    : currentId
      ? modelName(currentId)
      : DEFAULT_CHOICE_LABEL;

  return (
    <SettingsScreenShell title={MEDIA_SCREEN_TITLE}>
      <SettingsGroup footnote="Used when you create an image. The chat composer shows the same choice.">
        <SettingsRow
          label={IMAGE_MODEL_LABEL}
          icon={Images}
          value={value}
          {...(available ? { onPress: () => setSheetOpen(true) } : {})}
          isLast
        />
      </SettingsGroup>
      {available ? (
        <ImageModelSheet
          visible={sheetOpen}
          models={models}
          selectedId={selectedMediaModel.image}
          defaultId={defaultId}
          onClose={closeSheet}
        />
      ) : null}
    </SettingsScreenShell>
  );
}
