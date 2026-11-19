import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  MoreHorizontal,
  Presentation,
  Sparkles,
  X,
} from 'lucide-react-native';
import {
  Directions,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { normalizeEditInstruction } from '@agiworkforce/unified-chat/artifact-edit-request';
import {
  REWRITE_SLIDE_INSTRUCTION,
  buildSlideEditRequest,
} from '@agiworkforce/unified-chat/deck-request';
import {
  NEW_SLIDE_MARKDOWN,
  insertSlide,
  joinEditedSlide,
  moveSlide,
  parseDeck,
  removeSlide,
  replaceSlide,
  serializeDeck,
  splitSlideForEditing,
  type DeckDocument,
} from '@agiworkforce/unified-chat/deck-model';
import { Input } from '@/components/ui/Input';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { radii, spacing, typeScale, zIndex } from '@/src/ui/theme/tokens';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { useActionMenu, type ActionMenu } from '@/src/shared/hooks/useActionMenu';
import { useLandscapeWhileOpen } from '@/src/shared/hooks/useLandscapeWhileOpen';
import { ModalSafeArea } from '../../ModalSafeArea';
import { SLIDE_ASPECT } from './deckContent';

type SlideAction = 'edit' | 'add' | 'duplicate' | 'earlier' | 'later' | 'delete';

const SLIDE_ACTION_LABEL: Readonly<Record<SlideAction, string>> = {
  edit: 'Edit slide',
  add: 'New slide after this',
  duplicate: 'Duplicate slide',
  earlier: 'Move earlier',
  later: 'Move later',
  delete: 'Delete slide',
};

function chooseSlideAction(
  title: string,
  actions: readonly SlideAction[],
  onChoose: (action: SlideAction) => void,
  openMenu: ActionMenu['open'],
): void {
  const labels = actions.map((action) => SLIDE_ACTION_LABEL[action]);
  if (Platform.OS === 'ios') {
    const destructive = actions.indexOf('delete');
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...labels, 'Cancel'],
        cancelButtonIndex: actions.length,
        ...(destructive >= 0 ? { destructiveButtonIndex: destructive } : {}),
      },
      (chosen) => {
        const action = actions[chosen];
        if (action) onChoose(action);
      },
    );
    return;
  }
  openMenu(
    title,
    actions.map((action) => ({
      key: action,
      label: SLIDE_ACTION_LABEL[action],
      ...(action === 'delete' ? { destructive: true } : {}),
      run: () => onChoose(action),
    })),
  );
}

const ICON_CONTROL = {
  width: FULL_SCREEN_TOUCH_TARGET,
  height: FULL_SCREEN_TOUCH_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const STAGE_TAP_SLOP = 10;

export interface PresentationDeckViewProps {
  title: string;
  content: string;
  renderMarkdown: (text: string) => ReactNode;
  onAsk?: (prompt: string) => void;
  onSave?: (content: string) => void;
  handEdited?: boolean;
}

export function PresentationDeckView({
  title,
  content,
  renderMarkdown,
  onAsk,
  onSave,
  handEdited = false,
}: PresentationDeckViewProps) {
  const colors = useThemeColors();
  const window = useWindowDimensions();
  const deck = useMemo(() => parseDeck(content), [content]);
  const slides = deck.slides;
  const [current, setCurrent] = useState(0);
  const [width, setWidth] = useState(window.width);
  const [presenting, setPresenting] = useState(false);
  const [stageWidth, setStageWidth] = useState(0);
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [editing, setEditing] = useState<{ index: number; base: string; text: string } | null>(
    null,
  );
  const list = useRef<FlatList<string>>(null);
  const stage = useRef<View>(null);
  const stageLeft = useRef(0);
  const stageTouch = useRef<{ x: number; y: number } | null>(null);
  const pendingScroll = useRef<number | null>(null);
  const slideMenu = useActionMenu();
  const openSlideMenu = slideMenu.open;
  const total = slides.length;
  const index = Math.min(current, Math.max(total - 1, 0));
  const deckTitle = title || 'Presentation';
  const landscape = window.width > window.height;
  const laidOutWidth = useRef(width);
  useLandscapeWhileOpen(presenting);

  const goTo = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(total - 1, next));
      setCurrent(target);
      list.current?.scrollToIndex({ index: target, animated: true });
    },
    [total],
  );

  const askAboutSlide = useCallback(
    (text: string) => {
      const normalized = normalizeEditInstruction(text);
      if (!onAsk || !normalized) return;
      onAsk(
        buildSlideEditRequest({
          title: deckTitle,
          slideIndex: index,
          slideCount: total,
          slide: slides[index] ?? '',
          instruction: normalized,
          ...(handEdited ? { currentDeck: content } : {}),
        }),
      );
      setAsking(false);
      setInstruction('');
    },
    [content, deckTitle, handEdited, index, onAsk, slides, total],
  );

  useEffect(() => {
    const target = pendingScroll.current;
    if (target === null) return;
    pendingScroll.current = null;
    if (target < slides.length) list.current?.scrollToIndex({ index: target, animated: false });
  }, [slides]);

  const commit = useCallback(
    (next: DeckDocument, nextIndex: number) => {
      if (!onSave) return;
      const saved = serializeDeck(next);
      if (saved === content) return;
      onSave(saved);
      setCurrent(nextIndex);
      pendingScroll.current = nextIndex;
    },
    [content, onSave],
  );

  const openSlideActions = useCallback(() => {
    const actions: SlideAction[] = ['edit', 'add', 'duplicate'];
    if (index > 0) actions.push('earlier');
    if (index < total - 1) actions.push('later');
    if (total > 1) actions.push('delete');
    chooseSlideAction(
      `Slide ${index + 1}`,
      actions,
      (action) => {
        const slide = slides[index] ?? '';
        switch (action) {
          case 'edit': {
            const text = splitSlideForEditing(slide).text;
            setEditing({ index, base: text, text });
            return;
          }
          case 'add':
            commit(insertSlide(deck, index, NEW_SLIDE_MARKDOWN), index + 1);
            return;
          case 'duplicate':
            commit(insertSlide(deck, index, slide), index + 1);
            return;
          case 'earlier':
            commit(moveSlide(deck, index, index - 1), index - 1);
            return;
          case 'later':
            commit(moveSlide(deck, index, index + 1), index + 1);
            return;
          case 'delete':
            Alert.alert(
              `Delete slide ${index + 1}?`,
              'You can bring it back by restoring the previous version.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => commit(removeSlide(deck, index), Math.max(0, index - 1)),
                },
              ],
            );
        }
      },
      openSlideMenu,
    );
  }, [commit, deck, index, openSlideMenu, slides, total]);

  const saveSlideEdit = useCallback(() => {
    if (!editing) return;
    const slide = slides[editing.index];
    setEditing(null);
    if (slide === undefined || editing.text === editing.base) return;
    const visuals = splitSlideForEditing(slide).visuals;
    commit(
      replaceSlide(deck, editing.index, joinEditedSlide(editing.text, visuals)),
      editing.index,
    );
  }, [commit, deck, editing, slides]);

  const cancelSlideEdit = useCallback(() => {
    if (!editing) return;
    if (editing.text === editing.base) {
      setEditing(null);
      return;
    }
    Alert.alert('Discard your edits?', `Your changes to slide ${editing.index + 1} will be lost.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setEditing(null) },
    ]);
  }, [editing]);
  const canSend = normalizeEditInstruction(instruction) !== '';

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured > 0) setWidth(measured);
  }, []);

  useEffect(() => {
    const resized = laidOutWidth.current !== width;
    laidOutWidth.current = width;
    if (resized) list.current?.scrollToOffset({ offset: width * index, animated: false });
  }, [index, width]);

  const presentingGesture = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.LEFT)
      .runOnJS(true)
      .onEnd(() => goTo(index + 1))
      .withTestId('deck-presenting-swipe-next'),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .runOnJS(true)
      .onEnd(() => goTo(index - 1))
      .withTestId('deck-presenting-swipe-previous'),
  );
  const onStageLayout = (event: LayoutChangeEvent) => {
    setStageWidth(event.nativeEvent.layout.width);
    stage.current?.measureInWindow((x) => {
      stageLeft.current = x;
    });
  };
  const onStageTouch = (event: GestureResponderEvent) => {
    stageTouch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
  };
  const onStageRelease = (event: GestureResponderEvent) => {
    const start = stageTouch.current;
    stageTouch.current = null;
    const { pageX, pageY } = event.nativeEvent;
    if (!start || Math.hypot(pageX - start.x, pageY - start.y) > STAGE_TAP_SLOP) return;
    goTo(pageX - stageLeft.current < stageWidth / 2 ? index - 1 : index + 1);
  };
  const presentingSide = landscape ? FULL_SCREEN_TOUCH_TARGET : FULL_SCREEN_TOUCH_TARGET * 1.5;
  const stopPresenting = (
    <PressableBox
      testID="deck-stop-presenting"
      accessibilityRole="button"
      accessibilityLabel="Stop presenting"
      onPress={() => setPresenting(false)}
      style={ICON_CONTROL}
    >
      <X size={22} color={colors.white} />
    </PressableBox>
  );
  const presentingCounter = (
    <Text
      testID="deck-presenting-counter"
      accessibilityLabel={`Slide ${index + 1} of ${total}`}
      style={{
        fontSize: typeScale.footnote,
        color: colors.white,
        paddingHorizontal: landscape ? 0 : spacing.md,
        fontVariant: ['tabular-nums'],
      }}
    >
      {`${index + 1} / ${total}`}
    </Text>
  );

  const onSwipeEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const settled = Math.round(event.nativeEvent.contentOffset.x / width);
      setCurrent(Math.max(0, Math.min(total - 1, settled)));
    },
    [total, width],
  );

  const renderSlide = useCallback(
    ({ item, index: slideIndex }: ListRenderItemInfo<string>) => (
      <View style={{ width, paddingHorizontal: spacing.lg }}>
        <View
          testID={`deck-slide-${slideIndex}`}
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`Slide ${slideIndex + 1} of ${total}`}
          style={{
            aspectRatio: SLIDE_ASPECT,
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            overflow: 'hidden',
          }}
        >
          <ScrollView
            nestedScrollEnabled
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              padding: spacing.lg,
            }}
          >
            {renderMarkdown(item)}
          </ScrollView>
        </View>
      </View>
    ),
    [colors, renderMarkdown, total, width],
  );

  if (total === 0) {
    return (
      <View
        testID="deck-empty"
        style={{ alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'] }}
      >
        <Presentation size={28} color={colors.textMuted} />
        <Text style={{ marginTop: spacing.md, fontSize: typeScale.body, color: colors.textMuted }}>
          No slides found
        </Text>
      </View>
    );
  }

  return (
    <View testID="presentation-deck" onLayout={onLayout} style={{ gap: spacing.md }}>
      <FlatList
        ref={list}
        testID="deck-slides"
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, slideIndex) => String(slideIndex)}
        renderItem={renderSlide}
        getItemLayout={(_, slideIndex) => ({
          length: width,
          offset: width * slideIndex,
          index: slideIndex,
        })}
        initialNumToRender={2}
        windowSize={3}
        onMomentumScrollEnd={onSwipeEnd}
        extraData={width}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
        }}
      >
        <PressableBox
          testID="deck-previous"
          accessibilityRole="button"
          accessibilityLabel="Previous slide"
          accessibilityState={{ disabled: index === 0 }}
          disabled={index === 0}
          onPress={() => goTo(index - 1)}
          style={ICON_CONTROL}
        >
          <ChevronLeft size={22} color={index === 0 ? colors.textMuted : colors.textPrimary} />
        </PressableBox>
        <Text
          testID="deck-counter"
          accessibilityLiveRegion="polite"
          style={{
            minWidth: FULL_SCREEN_TOUCH_TARGET,
            textAlign: 'center',
            fontSize: typeScale.footnote,
            color: colors.textSecondary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {`${index + 1} / ${total}`}
        </Text>
        <PressableBox
          testID="deck-next"
          accessibilityRole="button"
          accessibilityLabel="Next slide"
          accessibilityState={{ disabled: index >= total - 1 }}
          disabled={index >= total - 1}
          onPress={() => goTo(index + 1)}
          style={ICON_CONTROL}
        >
          <ChevronRight
            size={22}
            color={index >= total - 1 ? colors.textMuted : colors.textPrimary}
          />
        </PressableBox>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {slides.map((_, slideIndex) => (
            <PressableBox
              key={slideIndex}
              testID={`deck-go-${slideIndex}`}
              accessibilityRole="button"
              accessibilityLabel={`Go to slide ${slideIndex + 1}`}
              accessibilityState={{ selected: slideIndex === index }}
              onPress={() => goTo(slideIndex)}
              style={ICON_CONTROL}
            >
              <View
                style={{
                  width: slideIndex === index ? spacing.lg : spacing.sm,
                  height: spacing.sm,
                  borderRadius: radii.full,
                  backgroundColor: slideIndex === index ? colors.textPrimary : colors.border,
                }}
              />
            </PressableBox>
          ))}
        </ScrollView>
        {onAsk ? (
          <PressableBox
            testID="deck-ask-slide"
            accessibilityRole="button"
            accessibilityLabel={`Ask about slide ${index + 1}`}
            accessibilityState={{ expanded: asking }}
            onPress={() => setAsking((open) => !open)}
            style={ICON_CONTROL}
          >
            <Sparkles size={20} color={asking ? colors.textPrimary : colors.textSecondary} />
          </PressableBox>
        ) : null}
        {onSave ? (
          <PressableBox
            testID="deck-slide-actions"
            accessibilityRole="button"
            accessibilityLabel={`Slide ${index + 1} actions`}
            accessibilityHint="Edit, add, duplicate, move or delete this slide"
            onPress={openSlideActions}
            style={ICON_CONTROL}
          >
            <MoreHorizontal size={20} color={colors.textSecondary} />
          </PressableBox>
        ) : null}
        <PressableBox
          testID="deck-present"
          accessibilityRole="button"
          accessibilityLabel="Present"
          accessibilityHint="Shows the slides full screen"
          onPress={() => setPresenting(true)}
          style={ICON_CONTROL}
        >
          <Maximize2 size={20} color={colors.textPrimary} />
        </PressableBox>
      </View>

      {onAsk && asking ? (
        <View
          testID="deck-ask-form"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.lg,
          }}
        >
          <View style={{ flex: 1 }}>
            <Input
              testID="deck-ask-input"
              accessibilityLabel={`What should change on slide ${index + 1}?`}
              placeholder={`What should change on slide ${index + 1}?`}
              value={instruction}
              onChangeText={setInstruction}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => askAboutSlide(instruction)}
            />
          </View>
          <PressableBox
            testID="deck-rewrite-slide"
            accessibilityRole="button"
            accessibilityLabel="Rewrite slide"
            onPress={() => askAboutSlide(REWRITE_SLIDE_INSTRUCTION)}
            style={{
              minHeight: FULL_SCREEN_TOUCH_TARGET,
              justifyContent: 'center',
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text style={{ fontSize: typeScale.footnote, color: colors.textPrimary }}>
              Rewrite slide
            </Text>
          </PressableBox>
          <PressableBox
            testID="deck-ask-send"
            accessibilityRole="button"
            accessibilityLabel="Send the change request"
            accessibilityHint="Puts it in this chat's message box"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => askAboutSlide(instruction)}
            style={ICON_CONTROL}
          >
            <Check size={20} color={canSend ? colors.textPrimary : colors.textMuted} />
          </PressableBox>
        </View>
      ) : null}

      <Modal
        visible={editing !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={cancelSlideEdit}
        accessibilityViewIsModal
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardAvoidingBehavior('modal')}>
          <View testID="deck-edit-sheet" style={{ flex: 1, backgroundColor: colors.background }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                gap: spacing.sm,
              }}
            >
              <PressableBox
                testID="deck-edit-cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
                onPress={cancelSlideEdit}
                style={{
                  minHeight: FULL_SCREEN_TOUCH_TARGET,
                  justifyContent: 'center',
                  padding: spacing.sm,
                }}
              >
                <Text style={{ fontSize: typeScale.body, color: colors.textSecondary }}>
                  Cancel
                </Text>
              </PressableBox>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: typeScale.body,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                {editing ? `Edit slide ${editing.index + 1}` : ''}
              </Text>
              <PressableBox
                testID="deck-edit-save"
                accessibilityRole="button"
                accessibilityLabel="Save the slide"
                onPress={saveSlideEdit}
                style={{
                  minHeight: FULL_SCREEN_TOUCH_TARGET,
                  justifyContent: 'center',
                  padding: spacing.sm,
                }}
              >
                <Text style={{ fontSize: typeScale.body, fontWeight: '600', color: colors.teal }}>
                  Save
                </Text>
              </PressableBox>
            </View>
            <TextInput
              testID="deck-edit-input"
              accessibilityLabel={editing ? `Slide ${editing.index + 1} text` : 'Slide text'}
              value={editing?.text ?? ''}
              onChangeText={(text) => setEditing((draft) => (draft ? { ...draft, text } : draft))}
              multiline
              autoFocus
              textAlignVertical="top"
              selectionColor={colors.teal}
              style={{
                flex: 1,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                fontSize: typeScale.body,
                color: colors.textPrimary,
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={presenting}
        animationType="fade"
        onRequestClose={() => setPresenting(false)}
        supportedOrientations={['portrait', 'landscape']}
        accessibilityViewIsModal
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ModalSafeArea
            testID="deck-presenting"
            style={{ flex: 1, backgroundColor: colors.black }}
          >
            {landscape ? null : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: spacing.sm,
                }}
              >
                {stopPresenting}
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: typeScale.footnote, color: colors.white }}
                >
                  {deckTitle}
                </Text>
                {presentingCounter}
              </View>
            )}
            <View testID="deck-presenting-body" style={{ flex: 1, flexDirection: 'row' }}>
              {landscape ? (
                <View
                  pointerEvents="box-none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: zIndex.control,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  {stopPresenting}
                  <View
                    pointerEvents="none"
                    style={{
                      minWidth: FULL_SCREEN_TOUCH_TARGET,
                      minHeight: FULL_SCREEN_TOUCH_TARGET,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {presentingCounter}
                  </View>
                </View>
              ) : null}
              <PressableBox
                testID="deck-presenting-previous"
                accessibilityRole="button"
                accessibilityLabel="Previous slide"
                accessibilityState={{ disabled: index === 0 }}
                disabled={index === 0}
                onPress={() => goTo(index - 1)}
                style={{ width: presentingSide, alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronLeft size={24} color={index === 0 ? colors.textMuted : colors.white} />
              </PressableBox>
              {/* Taps go through the responder system, which offers a touch to the
                  stage only after a link or button inside the slide has declined it. */}
              <GestureDetector gesture={presentingGesture}>
                <View
                  ref={stage}
                  testID="deck-presenting-stage"
                  onLayout={onStageLayout}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={onStageTouch}
                  onResponderRelease={onStageRelease}
                  onResponderTerminate={() => {
                    stageTouch.current = null;
                  }}
                  style={{ flex: 1 }}
                >
                  <ScrollView
                    testID={`deck-presenting-slide-${index}`}
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                      flexGrow: 1,
                      justifyContent: 'center',
                      padding: spacing.lg,
                      borderRadius: radii.xl,
                      backgroundColor: colors.surfaceElevated,
                    }}
                  >
                    {renderMarkdown(slides[index] ?? '')}
                  </ScrollView>
                </View>
              </GestureDetector>
              <PressableBox
                testID="deck-presenting-next"
                accessibilityRole="button"
                accessibilityLabel="Next slide"
                accessibilityState={{ disabled: index >= total - 1 }}
                disabled={index >= total - 1}
                onPress={() => goTo(index + 1)}
                style={{ width: presentingSide, alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronRight
                  size={24}
                  color={index >= total - 1 ? colors.textMuted : colors.white}
                />
              </PressableBox>
            </View>
          </ModalSafeArea>
        </GestureHandlerRootView>
      </Modal>
      <ActionMenuSheet menu={slideMenu.menu} dismissLabel="Dismiss slide actions" />
    </View>
  );
}
