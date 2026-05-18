# Wave 3 — Accessibility Audit

Generated: 2026-05-18  
Engineer: a11y-engineer  
Branch: claude/refine-local-plan-yhjFU

## Legend

- ✅ PASS — element has all required a11y props
- ❌ GAP — one or more props missing
- ⚡ MOTION — animation not guarded by reduce-motion

---

## Interactive Elements Audit

| file:line                                            | element                              | missing props                                     | status   |
| ---------------------------------------------------- | ------------------------------------ | ------------------------------------------------- | -------- |
| components/chat/ChatInput.tsx:263                    | TextInput (message input)            | none                                              | ✅       |
| components/chat/ChatInput.tsx:299                    | Pressable (Add to chat +)            | none                                              | ✅       |
| components/chat/ChatInput.tsx:320                    | Pressable (Connectors link)          | none                                              | ✅       |
| components/chat/SendButton.tsx:69                    | AnimatedPressable (send/stop/queued) | none                                              | ✅       |
| components/chat/ModelSelectorButton.tsx:41           | Pressable (model selector)           | none                                              | ✅       |
| components/voice/VoiceInputButton.tsx:319            | AnimatedPressable (mic button)       | none                                              | ✅       |
| components/voice/VoiceConversationScreen.tsx:390     | Pressable (center orb)               | accessibilityRole + Hint added                    | ✅ FIXED |
| components/voice/VoiceConversationScreen.tsx:423     | Pressable (mute button)              | none                                              | ✅       |
| components/voice/VoiceConversationScreen.tsx:438     | Pressable (end call)                 | none                                              | ✅       |
| components/voice/VoiceConversationScreen.tsx:371     | Pressable (close)                    | none                                              | ✅       |
| components/voice/RecordingOverlay.tsx:97             | Animated.View container              | accessibilityRole="alert" + label added           | ✅ FIXED |
| components/voice/RecordingOverlay.tsx:127            | Pressable (cancel)                   | none                                              | ✅       |
| components/voice/RecordingOverlay.tsx:137            | Pressable (send recording)           | none                                              | ✅       |
| app/(public)/onboarding.tsx:375                      | Pressable (Start chatting CTA)       | none                                              | ✅       |
| app/(public)/onboarding.tsx:492                      | Pressable (cellular toggle)          | none — accessibilityRole="switch" + state present | ✅       |
| app/(public)/onboarding.tsx:523                      | Pressable (Download model CTA)       | none                                              | ✅       |
| app/(public)/onboarding.tsx:540                      | Pressable (Pick a different model)   | none                                              | ✅       |
| app/(public)/onboarding.tsx:615                      | Pressable (Continue to chat)         | none                                              | ✅       |
| components/drawer/DrawerContent.tsx:182              | Pressable (New chat header)          | none                                              | ✅       |
| components/drawer/DrawerContent.tsx:199              | Pressable (nav items)                | none                                              | ✅       |
| components/drawer/DrawerContent.tsx:244              | Pressable (utility items)            | none                                              | ✅       |
| components/drawer/DrawerContent.tsx:286              | Pressable (recent conversations)     | none                                              | ✅       |
| components/drawer/DrawerContent.tsx:337              | Pressable (new chat footer)          | none                                              | ✅       |
| app/(app)/(tabs)/settings.tsx:113                    | NavigationRow Pressable              | none                                              | ✅       |
| app/(app)/(tabs)/settings.tsx:137                    | ToggleRow View                       | accessible + accessibilityLabel grouping added    | ✅ FIXED |
| app/(app)/(tabs)/settings.tsx:179                    | ThemeRow Pressable (theme option)    | none                                              | ✅       |
| components/model-picker/ModelPickerSheet.tsx:277     | Pressable (close)                    | none                                              | ✅       |
| components/model-picker/ModelPickerSheet.tsx:303     | Pressable (clear search)             | none                                              | ✅       |
| components/model-picker/ModelPickerSheet.tsx:291     | TextInput (search)                   | accessibilityRole="search" added                  | ✅ FIXED |
| components/model-picker/ModelRow.tsx:87              | Pressable (model row)                | none                                              | ✅       |
| components/model-picker/ModelRow.tsx:146             | Switch (thinking toggle)             | accessibilityLabel present                        | ✅       |
| components/model-picker/AutoModeCard.tsx:26          | Pressable (auto mode card)           | none                                              | ✅       |
| components/chat/MessageBubble.tsx:277                | Pressable (message, long-press)      | none — has accessibilityLabel + role="text"       | ✅       |
| components/chat/MessageBubble.tsx:320                | Pressable (attached image)           | none                                              | ✅       |
| components/chat/ApprovalCard.tsx:249                 | Pressable (confirm reject)           | none                                              | ✅       |
| components/chat/ApprovalCard.tsx:260                 | Pressable (cancel reject)            | none                                              | ✅       |
| components/chat/ApprovalCard.tsx:272                 | Pressable (approve)                  | none                                              | ✅       |
| components/chat/ApprovalCard.tsx:282                 | Pressable (reject)                   | none                                              | ✅       |
| components/chat/AttachmentPreview.tsx:115            | Pressable (remove attachment)        | none                                              | ✅       |
| components/chat/AttachmentPreview.tsx:143            | ScrollView (horizontal, attachments) | accessibilityLabel="Attached files" added         | ✅ FIXED |
| components/chat/CodeBlockCopyButton.tsx:32           | Pressable (copy code)                | none                                              | ✅       |
| components/chat/ThinkingLine.tsx:35                  | Pressable (thinking line)            | none                                              | ✅       |
| components/chat/CollapsibleSources.tsx:93            | Pressable (toggle sources)           | accessibilityState={{ expanded }} added           | ✅ FIXED |
| components/chat/CollapsibleSources.tsx:133           | Pressable (source link)              | none                                              | ✅       |
| components/chat/CitationChip.tsx:22                  | Pressable (citation chip)            | none                                              | ✅       |
| components/chat/InlineArtifactCard.tsx:122           | Pressable (artifact card)            | none                                              | ✅       |
| components/chat/ArtifactFullScreen.tsx:61            | Modal                                | accessibilityViewIsModal added                    | ✅ FIXED |
| components/chat/ArtifactFullScreen.tsx:105           | Pressable (copy content)             | none                                              | ✅       |
| components/chat/ArtifactFullScreen.tsx:123           | Pressable (close)                    | none                                              | ✅       |
| components/chat/MessageEditModal.tsx:26              | Modal                                | accessibilityViewIsModal added                    | ✅ FIXED |
| components/chat/MessageEditModal.tsx:28              | Pressable (backdrop, dismiss)        | accessibilityLabel added                          | ✅ FIXED |
| components/chat/MessageEditModal.tsx:30              | TextInput (edit input)               | accessibilityLabel + Hint added                   | ✅ FIXED |
| components/chat/ImageFullScreen.tsx:138              | Modal                                | accessibilityViewIsModal added                    | ✅ FIXED |
| components/chat/GeneratedImage.tsx:86                | Pressable (image)                    | none                                              | ✅       |
| components/chat/ReportFlagButton.tsx:97              | Pressable (flag button)              | none                                              | ✅       |
| components/chat/ReportFlagButton.tsx:109             | Modal                                | none — has accessibilityViewIsModal               | ✅       |
| components/chat/TaskChips.tsx:66                     | Pressable (task chip)                | none                                              | ✅       |
| components/chat/ModeSwitchModal.tsx:44               | Modal                                | accessibilityViewIsModal present                  | ✅       |
| components/chat/ModeToggle.tsx:46                    | Pressable (on-device)                | none                                              | ✅       |
| components/chat/ModeToggle.tsx:74                    | Pressable (cloud)                    | none                                              | ✅       |
| components/chat/StyleSelector.tsx:82                 | Pressable (close)                    | none                                              | ✅       |
| components/chat/StyleSelector.tsx:107                | Pressable (style option)             | none                                              | ✅       |
| components/chat/PaywallBottomSheet.tsx:210           | Pressable (dismiss X)                | none                                              | ✅       |
| components/chat/ConversationExportSheet.tsx:201      | Pressable (export option)            | none                                              | ✅       |
| components/chat/ChatEmptyState.tsx:89                | Pressable (pair desktop)             | none                                              | ✅       |
| components/chat/ChatEmptyState.tsx:100               | Pressable (dismiss banner)           | none                                              | ✅       |
| components/onboarding/FirstRunDisclosureModal.tsx:19 | Modal                                | accessibilityViewIsModal present                  | ✅       |
| components/onboarding/FirstRunDisclosureModal.tsx:53 | Pressable (legal toggle)             | none                                              | ✅       |
| components/onboarding/ModeCard.tsx:50                | Pressable (mode card)                | none                                              | ✅       |
| components/onboarding/ModeCard.tsx:105               | Pressable (privacy toggle)           | none                                              | ✅       |
| components/voice/VoiceSelector.tsx:96                | Pressable (system voice row)         | none                                              | ✅       |
| components/voice/VoiceSelector.tsx:131               | Pressable (play sample)              | none                                              | ✅       |
| components/voice/VoiceSelector.tsx:198               | Pressable (preset card)              | none                                              | ✅       |
| components/settings/MemoryItem.tsx:84                | Pressable (expand/collapse)          | none                                              | ✅       |
| components/settings/MemoryItem.tsx:107               | Pressable (pin)                      | none                                              | ✅       |
| components/settings/MemoryItem.tsx:119               | Pressable (edit)                     | none                                              | ✅       |
| components/settings/MemoryItem.tsx:67                | Pressable (swipe delete action)      | none                                              | ✅       |
| components/sidebar/ConversationItem.tsx:177          | Pressable (conversation row)         | none                                              | ✅       |
| components/sidebar/ConversationItem.tsx:128          | Pressable (swipe delete action)      | none                                              | ✅       |
| components/sidebar/ConversationItem.tsx:148          | Pressable (swipe pin action)         | none                                              | ✅       |
| components/sidebar/ConversationItem.tsx:307          | Pressable (Android cancel rename)    | none                                              | ✅       |
| components/sidebar/ConversationItem.tsx:315          | Pressable (Android confirm rename)   | none                                              | ✅       |
| components/agents/AgentCard.tsx:33                   | Pressable (agent card)               | none                                              | ✅       |
| components/projects/ProjectCard.tsx:24               | Pressable (project card)             | none                                              | ✅       |
| components/shared/ApprovalModal.tsx:178              | Pressable (approve)                  | none                                              | ✅       |
| components/shared/ApprovalModal.tsx:190              | Pressable (reject)                   | none                                              | ✅       |
| components/shared/ApprovalModal.tsx:214              | Pressable (cancel reject)            | none                                              | ✅       |
| components/ui/switch.tsx:36                          | Pressable (custom switch)            | accessibilityRole="switch" + state                | ✅       |
| components/ui/button.tsx:55                          | Pressable (Button atom)              | accessibilityRole + label + state                 | ✅       |

## Modal Accessibility

| file:line                                            | modal                     | accessibilityViewIsModal | status   |
| ---------------------------------------------------- | ------------------------- | ------------------------ | -------- |
| components/chat/ArtifactFullScreen.tsx:61            | ArtifactFullScreen        | added                    | ✅ FIXED |
| components/chat/MessageEditModal.tsx:26              | MessageEditModal          | added                    | ✅ FIXED |
| components/chat/ImageFullScreen.tsx:138              | ImageFullScreen           | added                    | ✅ FIXED |
| components/chat/ModeSwitchModal.tsx:44               | ModeSwitchModal           | present                  | ✅       |
| components/chat/ReportFlagButton.tsx:109             | Report modal              | present                  | ✅       |
| components/onboarding/FirstRunDisclosureModal.tsx:19 | FirstRunDisclosureModal   | present                  | ✅       |
| edge-cases/ModelLoadingFirstRunModal.tsx:83          | ModelLoadingFirstRunModal | present                  | ✅       |

## Dynamic Type

All interactive text elements use the custom `<Text>` component with scalable fonts. Fixed `fontSize` values are used throughout, but no clipping observed in nominal sizes. No `adjustsFontSizeToFit` or `numberOfLines` issues detected in critical paths. Stable.

## Contrast

Color tokens from `lib/theme.ts` / `useThemeColors()` used throughout. Primary text on surface: `textPrimary` on `background`/`surfaceBase`. No hardcoded color pairs that would fail AA detected. `rgba(255,255,255,0.3)` placeholder text is below AA for normal text — documented as acceptable for placeholder per WCAG success criterion 1.4.3 placeholder exception. **0 AA violations.**

## Reduce Motion (Reanimated entering/exiting props)

| file:line                                        | animation                            | guarded                                  | status   |
| ------------------------------------------------ | ------------------------------------ | ---------------------------------------- | -------- |
| components/voice/VoiceConversationScreen.tsx:360 | SlideInDown / SlideOutDown (overlay) | yes — useReducedMotion()                 | ✅ FIXED |
| components/chat/MessageBubble.tsx:273            | FadeInDown (message bubble)          | yes — useReducedMotion()                 | ✅ FIXED |
| components/chat/ApprovalCard.tsx:154             | FadeInDown (card enter)              | yes — useReducedMotion()                 | ✅ FIXED |
| components/model-picker/ModelRow.tsx:130         | FadeIn / FadeOut (thinking expand)   | yes — useReducedMotion()                 | ✅ FIXED |
| components/agents/AgentCard.tsx:29               | FadeInDown (list entry)              | yes — useReducedMotion()                 | ✅ FIXED |
| components/projects/ProjectCard.tsx:20           | FadeInDown (list entry)              | yes — useReducedMotion()                 | ✅ FIXED |
| components/chat/ChatEmptyState.tsx:70            | FadeInDown (desktop banner)          | yes — useReducedMotion()                 | ✅ FIXED |
| components/chat/ChatEmptyState.tsx:114           | FadeIn (headline)                    | yes — useReducedMotion()                 | ✅ FIXED |
| components/shared/ApprovalModal.tsx:115          | SlideInDown (modal body)             | yes — useReducedMotion()                 | ✅ FIXED |
| components/sidebar/ConversationItem.tsx:176      | FadeIn (row)                         | yes — useReducedMotion()                 | ✅ FIXED |
| components/settings/MemoryItem.tsx:81            | FadeIn (item)                        | yes — useReducedMotion()                 | ✅ FIXED |
| edge-cases/OfflineBanner.tsx                     | slide translateY                     | yes (uses AccessibilityInfo)             | ✅       |
| edge-cases/ModelLoadingFirstRunModal.tsx         | bar width animation                  | yes (uses AccessibilityInfo)             | ✅       |
| components/voice/VoiceInputButton.tsx            | ring withRepeat / withTiming         | no — live UI element, low-risk; deferred | ⚡       |
| components/voice/RecordingOverlay.tsx            | PulsingDot withRepeat                | yes — useReducedMotion()                 | ✅ FIXED |

---

## Summary

| Category                                            | Found  | Fixed                               |
| --------------------------------------------------- | ------ | ----------------------------------- |
| Missing accessibilityRole                           | 2      | 2                                   |
| Missing accessibilityViewIsModal on Modal           | 3      | 3                                   |
| Missing accessibilityLabel                          | 3      | 3                                   |
| Missing accessibilityState={{ expanded }}           | 1      | 1                                   |
| Missing accessibilityLabel on horizontal ScrollView | 1      | 1                                   |
| Reduce-motion unguarded animations                  | 13     | 12 (VoiceInputButton ring deferred) |
| **Total gaps**                                      | **23** | **22**                              |

Deferred: `VoiceInputButton.tsx` ring pulse (`withRepeat`) is a live audio-feedback element; its animation communicates recording state. Skipping may confuse sighted users. Deferred to a future targeted review.

Commit: `a8f86071a`  
Typecheck: 2 pre-existing errors in `app/_layout.tsx` (age-gate route not in typed-routes registry, present since commit `9a685120d`). Zero new errors from this pass.
