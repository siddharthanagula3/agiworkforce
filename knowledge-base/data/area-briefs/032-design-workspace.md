# Area 32. Design workspace

34 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S32.01 Design brief.
- Should: The user starts a design from a structured design brief (goals, audience, style) that the workspace keeps with the design.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.02 Artboard canvas.
- Should: A canvas shows one or more artboards/frames that the user can pan and zoom and work on directly.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.03 Multiple design alternatives.
- Should: The workspace generates several alternative designs for one brief and shows them side by side to pick from.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.04 Page or frame list.
- Should: A panel lists the pages or frames of the design and lets the user switch between them.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.05 Element selection.
- Should: The user can click an element in the rendered design to select it.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.06 Direct text editing.
- Should: The user can edit the text of a design element directly on the design.
- Status: chrome unverified

## S32.07 Position and size controls.
- Should: A selected element exposes position (x/y) and size (w/h) controls that change it.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.08 Alignment and distribution.
- Should: The user can align and distribute selected elements with dedicated controls.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.09 Layers.
- Should: A layers panel shows the element tree and lets the user reorder/hide layers.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.10 Grouping.
- Should: The user can group and ungroup selected elements.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.11 Color controls.
- Should: A selected element has color controls (fill/stroke picker) that change it.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.12 Typography controls.
- Should: A selected element has typography controls (font, size, weight, line height).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.13 Spacing controls.
- Should: A selected element has spacing controls (padding, margin, gap).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.14 Image replacement.
- Should: The user can replace an image in the design with another image (upload or pick).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.15 Component replacement.
- Should: The user can swap one component instance in the design for another component.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.16 Custom adjustment sliders.
- Should: The design exposes custom adjustment sliders (e.g. density, radius, hue) that update it live.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.17 Inline design comments.
- Should: The user can pin comments to a spot or element on the design.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.18 Selection-based change requests.
- Should: The user selects part of the design and asks the model to change just that selection.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.19 Desktop/tablet/mobile breakpoints.
- Should: The preview switches between desktop, tablet and mobile widths.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.20 Light/dark previews.
- Should: The preview switches between light and dark color schemes.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.21 Design-system import.
- Should: The user imports a design system (tokens, components, guidelines) that designs then use.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.22 Brand asset library.
- Should: A library holds brand assets (logos, colors, fonts, imagery) reusable across designs.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.23 Reusable component library.
- Should: A library of reusable components can be inserted into designs.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.24 Design-token mapping.
- Should: Design values map to named design tokens, and the mapping is visible/editable.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.25 Design-system conformance feedback.
- Should: The workspace flags where a design departs from the imported design system.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.26 Prototype navigation.
- Should: A prototype can be clicked through: interactions navigate between screens.
- Status: chrome unverified

## S32.27 Interactive-state previews.
- Should: The user can preview interactive states (hover, pressed, disabled, empty) of the design.
- Status: chrome unverified

## S32.28 Design-to-code handoff.
- Should: A developer can get the code/specs for a design (inspect, copy or export the implementation).
- Status: not applicable anywhere

## S32.29 Code-to-design synchronization.
- Should: Changes made in code flow back into the design so the two stay in sync.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S32.30 Figma import/export integration.
- Should: The workspace imports designs from Figma and/or exports designs to Figma.
- Status: cli missing, chrome missing

## S32.31 Export to HTML.
- Should: The user can export the design as a standalone HTML file.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1452; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745; apps/web/features/chat/pages/WebChatPage.tsx:5834; apps/mobile/src/features/chat/utils/artifactExport.ts:100; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:562; apps/cli/src/lib.rs:1034; apps/cli/src/cloud/artifacts.rs:212; apps/cli/src/lib.rs:1942

## S32.32 Export to PDF.
- Should: The user can export the design as a PDF.
- Status: not applicable anywhere

## S32.33 Export to image or archive.
- Should: The user can export the design as an image file or as a downloadable archive.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:530; apps/web/features/chat/utils/downloadArtifacts.ts:103; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1447; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1001; apps/web/features/chat/pages/WebChatPage.tsx:5834

## S32.34 Version comparison and restoration.
- Should: The user can compare two versions of a design and restore an earlier one.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:648; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2124; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:56; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:88; packages/ui/design-tokens/src/foundation.css:173; apps/web/shared/components/__tests__/theme-contrast.test.ts:314; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:722; apps/mobile/src/features/chat/components/ArtifactChangesView.tsx:4
