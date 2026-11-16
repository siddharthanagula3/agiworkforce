import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Image, type ImageSource } from 'expo-image';
import { ImageIcon, Images, Paperclip } from 'lucide-react-native';

import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useTheme } from '@/src/ui/theme';
import {
  HEADER_TEXT_SCALE_LIMIT,
  elevation,
  radii,
  spacing,
  typeScale,
} from '@/src/ui/theme/tokens';
import { CloudFeatureGate, EmptyState, LoadingRows } from '@/src/shared/components/cloud-screen';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import {
  BOTTOM_SEARCH_BAR_MARGIN,
  useKeyboardOverlap,
} from '@/src/shared/components/BottomSearchBar';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { AttachmentPreview } from '@/src/features/chat/components/AttachmentPreview';
import { SendButton } from '@/src/features/chat/components/SendButton';
import { COMPOSER_CONTROL_SIZE } from '@/src/features/chat/components/composerMetrics';
import { toUserMessage } from '@/services/userMessage';
import {
  IMAGE_CREATION_UNAVAILABLE,
  IMAGE_REQUEST_NOT_SENT,
  startImageCreation,
} from './startImageCreation';
import { useImageCreationAvailability } from './imageCreationAvailability';
import { IMAGE_REFERENCES_UNAVAILABLE } from './imageReferenceModel';
import { startImageReferenceCreation } from './startImageReferenceCreation';
import { useImageReferences } from './useImageReferences';

export interface ImagePromptTile {
  id: string;
  label: string;
  phrase: string;
  image: ImageSource | number;
}

type ImagesTab = 'templates' | 'ideas';

const TILE_ASPECT_RATIO = 190 / 238;
const PROMPT_MAX_HEIGHT = 132;
const TAB_HEIGHT = 44;

export function appendImagePhrase(current: string, phrase: string): string {
  const head = current.trimEnd();
  return head ? `${head} ${phrase}` : phrase;
}

function ImagesSwitch({ tab, onChange }: { tab: ImagesTab; onChange: (next: ImagesTab) => void }) {
  const { colors } = useTheme();
  const options: { key: ImagesTab; label: string }[] = [
    { key: 'templates', label: 'Templates' },
    { key: 'ideas', label: 'Ideas' },
  ];
  return (
    <View
      testID="images.switch"
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
      }}
    >
      {options.map((option) => {
        const selected = option.key === tab;
        return (
          <PressableBox
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={{
              minHeight: TAB_HEIGHT,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.full,
              justifyContent: 'center',
              backgroundColor: selected ? colors.accentSurface : colors.transparent,
            }}
          >
            <Text
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{
                color: selected ? colors.textPrimary : colors.textSecondary,
                fontSize: typeScale.callout,
                fontWeight: selected ? '600' : '400',
              }}
            >
              {option.label}
            </Text>
          </PressableBox>
        );
      })}
    </View>
  );
}

function ImageTileGrid({
  tiles,
  onPick,
}: {
  tiles: readonly ImagePromptTile[];
  onPick: (tile: ImagePromptTile) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.lg,
        paddingHorizontal: spacing.lg,
      }}
    >
      {tiles.map((tile) => (
        <PressableBox
          key={tile.id}
          testID={`images.tile.${tile.id}`}
          onPress={() => onPick(tile)}
          accessibilityRole="button"
          accessibilityLabel={tile.label}
          accessibilityHint="Adds this idea to your description"
          style={{
            flexBasis: '45%',
            flexGrow: 1,
            aspectRatio: TILE_ASPECT_RATIO,
            borderRadius: radii.xl,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <Image
            source={tile.image}
            contentFit="cover"
            accessible={false}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              backgroundColor: colors.cameraOverlaySurface,
            }}
          >
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{
                color: colors.cameraOverlayText,
                fontSize: typeScale.subhead,
                fontWeight: '600',
              }}
            >
              {tile.label}
            </Text>
          </View>
        </PressableBox>
      ))}
    </View>
  );
}

export function ImagesScreen({
  templates = [],
  ideas = [],
}: {
  templates?: readonly ImagePromptTile[];
  ideas?: readonly ImagePromptTile[];
} = {}) {
  const { colors, isDark } = useTheme();
  const pageBackground = isDark ? colors.background : colors.surfaceBase;
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  const { isOnline } = useNetworkStatus();
  const inputRef = useRef<TextInput>(null);
  const [tab, setTab] = useState<ImagesTab>('templates');
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const availability = useImageCreationAvailability(access.ready);
  const references = useImageReferences(setError);

  useFocusEffect(
    useCallback(() => {
      setTab('templates');
      setError(null);
    }, []),
  );

  const openDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const openYourImages = useCallback(() => {
    router.push({
      pathname: '/(app)/library',
      params: { filter: 'images' },
    } as Parameters<typeof router.push>[0]);
  }, [router]);

  const pickTile = useCallback((tile: ImagePromptTile) => {
    setPrompt((current) => appendImagePhrase(current, tile.phrase));
    setError(null);
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    if (sendingRef.current || !prompt.trim()) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const open = (conversationId: string) => {
        router.push({
          pathname: '/(app)/chat/[id]',
          params: { id: conversationId },
        } as Parameters<typeof router.push>[0]);
      };
      const result =
        references.attachments.length > 0
          ? await startImageReferenceCreation({
              prompt,
              references: references.attachments,
              isOnline,
              open,
            })
          : await startImageCreation({ prompt, isOnline, open });
      if (result.status === 'started') {
        setPrompt('');
        references.clear();
      } else setError(result.message);
    } catch (failure) {
      setError(toUserMessage(failure, IMAGE_REQUEST_NOT_SENT));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [isOnline, prompt, references, router]);

  const handleBarLayout = useCallback((event: LayoutChangeEvent) => {
    setBarHeight(Math.ceil(event.nativeEvent.layout.height));
  }, []);

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Images"
        feature="Images"
        description="Image creation runs in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  const available = sending || availability === 'available';
  const showSwitch = available && ideas.length > 0;
  const tiles = showSwitch && tab === 'ideas' ? ideas : templates;
  const hasPrompt = prompt.trim().length > 0;
  const barBottom =
    (keyboardOverlap > 0 ? keyboardOverlap : insets.bottom) + BOTTOM_SEARCH_BAR_MARGIN;
  const barSpace = barHeight + barBottom + spacing.lg;
  const textEndsAboveBar = available && tiles.length === 0;

  return (
    <View testID="images.screen" style={{ flex: 1, backgroundColor: pageBackground }}>
      <View
        style={{
          paddingTop: insets.top,
          minHeight: 52,
          paddingHorizontal: spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <DrawerButton testID="images.open-drawer" onPress={openDrawer} />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.headline,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          Images
        </Text>
        <PressableBox
          testID="images.your-images"
          onPress={openYourImages}
          accessibilityRole="button"
          accessibilityLabel="Your images"
          accessibilityHint="Opens the images you created in Library"
          style={{
            width: COMPOSER_CONTROL_SIZE,
            height: COMPOSER_CONTROL_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Images size={21} color={colors.textPrimary} strokeWidth={1.8} />
        </PressableBox>
      </View>

      {showSwitch ? <ImagesSwitch tab={tab} onChange={setTab} /> : null}

      <ScrollView
        testID="images.scroll"
        style={{ flex: 1, marginBottom: textEndsAboveBar ? barSpace : 0 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: textEndsAboveBar ? 0 : barSpace }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {!available && availability === 'checking' ? (
          <LoadingRows count={2} />
        ) : !available ? (
          <EmptyState
            Icon={ImageIcon}
            title={IMAGE_CREATION_UNAVAILABLE}
            body="Check back later to create images here."
          />
        ) : tiles.length > 0 ? (
          <ImageTileGrid tiles={tiles} onPick={pickTile} />
        ) : (
          <EmptyState
            Icon={ImageIcon}
            title="Create an image"
            body="Describe it below. It opens in a new chat and is saved in Library."
          />
        )}
      </ScrollView>

      {available ? (
        <View
          testID="images.describe-bar"
          onLayout={handleBarLayout}
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: barBottom,
            gap: spacing.xs,
          }}
        >
          <View
            style={{
              minHeight: COMPOSER_CONTROL_SIZE + spacing.xs * 2,
              borderRadius: radii['2xl'],
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.composerBorder,
              backgroundColor: colors.surfaceElevated,
              padding: spacing.xs,
              ...elevation.e2,
            }}
          >
            {references.attachments.length > 0 || references.preparing.length > 0 ? (
              <View
                testID="images.references"
                style={{ paddingTop: spacing.xs, paddingHorizontal: spacing.xs }}
              >
                <AttachmentPreview
                  attachments={references.attachments}
                  onRemove={references.remove}
                  preparing={references.preparing}
                  onDismissPreparing={references.dismissPreparing}
                  numberImages
                />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}>
              <PressableBox
                testID="images.attach"
                onPress={() => void references.pick()}
                disabled={sending || undefined}
                accessibilityRole="button"
                accessibilityLabel="Attach photos"
                accessibilityHint={
                  references.paperclip === 'unavailable'
                    ? IMAGE_REFERENCES_UNAVAILABLE
                    : 'Adds photos to guide the image'
                }
                accessibilityState={{ disabled: sending || references.paperclip !== 'ready' }}
                style={{
                  width: COMPOSER_CONTROL_SIZE,
                  height: COMPOSER_CONTROL_SIZE,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Paperclip
                  size={21}
                  strokeWidth={1.8}
                  color={references.paperclip === 'ready' ? colors.textPrimary : colors.textMuted}
                />
              </PressableBox>
              <TextInput
                ref={inputRef}
                testID="images.prompt"
                value={prompt}
                onChangeText={(next) => {
                  setPrompt(next);
                  if (error) setError(null);
                }}
                editable={!sending}
                multiline
                placeholder="Describe an image"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Describe an image"
                style={{
                  flex: 1,
                  minHeight: COMPOSER_CONTROL_SIZE,
                  maxHeight: PROMPT_MAX_HEIGHT,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.md,
                  color: colors.textPrimary,
                  fontSize: typeScale.body,
                  textAlignVertical: 'center',
                }}
              />
              {sending ? (
                <View
                  testID="images.sending"
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="Creating image"
                  accessibilityState={{ busy: true }}
                  style={{
                    width: COMPOSER_CONTROL_SIZE,
                    height: COMPOSER_CONTROL_SIZE,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator color={colors.textPrimary} />
                </View>
              ) : (
                <SendButton
                  state="idle"
                  onPress={() => void send()}
                  disabled={!hasPrompt || references.busy}
                  accessibilityLabel="Create image"
                />
              )}
            </View>
          </View>
          {references.modelNote ? (
            <Text
              testID="images.reference-note"
              style={{
                color: colors.textMuted,
                fontSize: typeScale.caption,
                lineHeight: 18,
                paddingHorizontal: spacing.lg,
              }}
            >
              {references.modelNote}
            </Text>
          ) : null}
          {error ? (
            <Text
              testID="images.error"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{
                color: colors.agentError,
                fontSize: typeScale.caption,
                lineHeight: 18,
                paddingHorizontal: spacing.lg,
              }}
            >
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
