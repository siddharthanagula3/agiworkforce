---
id: "COVERAGE"
type: "coverage"
title: "Coverage checklist"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Coverage checklist

What has been documented, read in the code, tested by a person, and what is still open. Rebuilt by `tools/04_build_indexes.py`. Machine-readable: [coverage.json](coverage.json).

| Measure | Count |
|---|---:|
| Product areas | 106 |
| Requirement items | 3466 |
| Features with a stable identifier | 1157 |
| Area pages written from the code | 106 |
| Feature pages with all ten sections | 1148 |
| Hands-on test items (item x app) | 7200 |
| ...with a path whose labels are confirmed in the code | 5818 |
| Built in the code (item x app) | 7202 |
| ...seen working by a person | 149 |
| Open gaps linked to an area | 8548 |

## By area

| # | Area | Items | Features | Area page | Feature pages | Test items | Path confirmed | Built in code | Seen working | Gaps |
|---:|---|---:|---:|---|---:|---:|---:|---:|---:|---:|
| 2 | [Public website and acquisition screens](../20-features/002-public-website-and-acquisition-screens/README.md) | 40 | 12 | yes | 12 | 37 | 37 | 37 | 18 | 58 |
| 3 | [Authentication and onboarding screens](../20-features/003-authentication-and-onboarding-screens/README.md) | 37 | 12 | yes | 12 | 96 | 85 | 96 | 0 | 102 |
| 4 | [Signed-in application destinations](../20-features/004-signed-in-application-destinations/README.md) | 44 | 15 | yes | 15 | 171 | 153 | 171 | 15 | 105 |
| 5 | [Application shell and navigation components](../20-features/005-application-shell-and-navigation-components/README.md) | 40 | 12 | yes | 11 | 147 | 135 | 147 | 7 | 59 |
| 6 | [Visual foundations and spacing conventions](../20-features/006-visual-foundations-and-spacing-conventions/README.md) | 35 | 12 | yes | 12 | 198 | 64 | 198 | 0 | 52 |
| 7 | [Layout systems](../20-features/007-layout-systems/README.md) | 32 | 10 | yes | 10 | 101 | 64 | 101 | 2 | 68 |
| 8 | [Basic interactive elements](../20-features/008-basic-interactive-elements/README.md) | 50 | 12 | yes | 12 | 228 | 196 | 228 | 2 | 68 |
| 9 | [Compound interface components](../20-features/009-compound-interface-components/README.md) | 38 | 11 | yes | 11 | 152 | 133 | 152 | 0 | 76 |
| 10 | [Modal and dialog inventory](../20-features/010-modal-and-dialog-inventory/README.md) | 48 | 12 | yes | 12 | 175 | 154 | 175 | 1 | 72 |
| 11 | [Accessibility and localization components](../20-features/011-accessibility-and-localization-components/README.md) | 28 | 12 | yes | 12 | 112 | 71 | 112 | 0 | 84 |
| 12 | [New-chat experience](../20-features/012-new-chat-experience/README.md) | 24 | 12 | yes | 12 | 104 | 72 | 104 | 3 | 72 |
| 13 | [Composer text interaction](../20-features/013-composer-text-interaction/README.md) | 41 | 13 | yes | 13 | 167 | 145 | 167 | 4 | 87 |
| 14 | [Attachment intake components](../20-features/014-attachment-intake-components/README.md) | 36 | 12 | yes | 12 | 118 | 87 | 118 | 7 | 102 |
| 15 | [Model-selector interface](../20-features/015-model-selector-interface/README.md) | 35 | 12 | yes | 12 | 136 | 129 | 136 | 6 | 118 |
| 16 | [User-message components](../20-features/016-user-message-components/README.md) | 22 | 11 | yes | 11 | 73 | 56 | 73 | 1 | 70 |
| 17 | [Assistant-message components](../20-features/017-assistant-message-components/README.md) | 40 | 9 | yes | 9 | 144 | 127 | 144 | 4 | 59 |
| 18 | [Conversation-level controls](../20-features/018-conversation-level-controls/README.md) | 28 | 2 | yes | 2 | 89 | 79 | 89 | 6 | 26 |
| 19 | [Streaming and response-presentation states](../20-features/019-streaming-and-response-presentation-states/README.md) | 29 | 8 | yes | 8 | 158 | 136 | 158 | 4 | 87 |
| 20 | [Markdown and text rendering](../20-features/020-markdown-and-text-rendering/README.md) | 30 | 9 | yes | 9 | 154 | 103 | 154 | 16 | 67 |
| 21 | [Code blocks and executable code presentation](../20-features/021-code-blocks-and-executable-code-presentation/README.md) | 30 | 11 | yes | 11 | 81 | 64 | 81 | 2 | 93 |
| 22 | [Rich answers and structured result widgets](../20-features/022-rich-answers-and-structured-result-widgets/README.md) | 38 | 11 | yes | 11 | 61 | 51 | 61 | 0 | 103 |
| 23 | [Project workspace](../20-features/023-project-workspace/README.md) | 38 | 9 | yes | 9 | 84 | 77 | 84 | 5 | 108 |
| 24 | [Library and file-management experience](../20-features/024-library-and-file-management-experience/README.md) | 40 | 12 | yes | 12 | 48 | 47 | 48 | 7 | 93 |
| 25 | [File previews and readers](../20-features/025-file-previews-and-readers/README.md) | 31 | 10 | yes | 10 | 46 | 40 | 46 | 3 | 79 |
| 26 | [Artifact container and panel](../20-features/026-artifact-container-and-panel/README.md) | 40 | 10 | yes | 10 | 133 | 108 | 133 | 0 | 118 |
| 27 | [Document and writing editor](../20-features/027-document-and-writing-editor/README.md) | 41 | 12 | yes | 12 | 58 | 41 | 58 | 0 | 99 |
| 28 | [Code Canvas and application preview](../20-features/028-code-canvas-and-application-preview/README.md) | 32 | 12 | yes | 12 | 51 | 31 | 51 | 0 | 96 |
| 29 | [Spreadsheet and data-analysis workspace](../20-features/029-spreadsheet-and-data-analysis-workspace/README.md) | 40 | 12 | yes | 12 | 30 | 23 | 30 | 0 | 74 |
| 30 | [Presentation workspace](../20-features/030-presentation-workspace/README.md) | 33 | 12 | yes | 12 | 4 | 4 | 4 | 0 | 74 |
| 31 | [PDF and document-transformation products](../20-features/031-pdf-and-document-transformation-products/README.md) | 26 | 13 | yes | 12 | 30 | 19 | 31 | 0 | 65 |
| 32 | [Design workspace](../20-features/032-design-workspace/README.md) | 34 | 12 | yes | 12 | 16 | 9 | 16 | 0 | 56 |
| 33 | [Generated Sites and published applications](../20-features/033-generated-sites-and-published-applications/README.md) | 30 | 10 | yes | 10 | 50 | 31 | 50 | 0 | 92 |
| 34 | [Search experiences](../20-features/034-search-experiences/README.md) | 32 | 9 | yes | 9 | 75 | 65 | 75 | 3 | 85 |
| 35 | [Research workspace](../20-features/035-research-workspace/README.md) | 34 | 10 | yes | 10 | 72 | 69 | 72 | 0 | 94 |
| 36 | [Sources and grounding interface](../20-features/036-sources-and-grounding-interface/README.md) | 25 | 11 | yes | 11 | 43 | 39 | 43 | 0 | 74 |
| 37 | [Notebook and knowledge-workspace product](../20-features/037-notebook-and-knowledge-workspace-product/README.md) | 39 | 12 | yes | 12 | 66 | 56 | 66 | 0 | 77 |
| 38 | [Learning and study products](../20-features/038-learning-and-study-products/README.md) | 35 | 12 | yes | 12 | 9 | 9 | 9 | 3 | 67 |
| 39 | [Memory product](../20-features/039-memory-product/README.md) | 32 | 12 | yes | 12 | 127 | 111 | 127 | 0 | 108 |
| 40 | [Instructions, preferences, and personal style](../20-features/040-instructions-preferences-and-personal-style/README.md) | 30 | 11 | yes | 11 | 120 | 102 | 120 | 0 | 88 |
| 41 | [Temporary and private experiences](../20-features/041-temporary-and-private-experiences/README.md) | 20 | 11 | yes | 11 | 55 | 48 | 55 | 1 | 90 |
| 42 | [Proactive assistance, briefings, and reflection](../20-features/042-proactive-assistance-briefings-and-reflection/README.md) | 25 | 11 | yes | 11 | 39 | 39 | 39 | 0 | 88 |
| 43 | [Image and visual understanding](../20-features/043-image-and-visual-understanding/README.md) | 20 | 9 | yes | 9 | 70 | 70 | 70 | 0 | 68 |
| 44 | [Image-generation studio](../20-features/044-image-generation-studio/README.md) | 36 | 12 | yes | 12 | 76 | 56 | 76 | 0 | 95 |
| 45 | [Image editor](../20-features/045-image-editor/README.md) | 37 | 11 | yes | 11 | 26 | 22 | 26 | 0 | 85 |
| 46 | [Video-generation studio](../20-features/046-video-generation-studio/README.md) | 37 | 12 | yes | 12 | 37 | 37 | 37 | 0 | 67 |
| 47 | [Video editing and media continuity](../20-features/047-video-editing-and-media-continuity/README.md) | 27 | 11 | yes | 11 | 0 | 0 | 0 | 0 | 58 |
| 48 | [Voice conversation interface](../20-features/048-voice-conversation-interface/README.md) | 41 | 12 | yes | 12 | 97 | 79 | 97 | 0 | 111 |
| 49 | [Dictation, transcription, and recording](../20-features/049-dictation-transcription-and-recording/README.md) | 30 | 11 | yes | 11 | 50 | 33 | 50 | 0 | 98 |
| 50 | [Audio overviews, speech generation, and music](../20-features/050-audio-overviews-speech-generation-and-music/README.md) | 32 | 12 | yes | 12 | 9 | 9 | 9 | 0 | 52 |
| 51 | [Voice-agent builder and telephony extensions](../20-features/051-voice-agent-builder-and-telephony-extensions/README.md) | 25 | 11 | yes | 11 | 0 | 0 | 0 | 0 | 45 |
| 52 | [Custom-assistant builder](../20-features/052-custom-assistant-builder/README.md) | 41 | 12 | yes | 12 | 13 | 8 | 13 | 0 | 77 |
| 53 | [Skill creation and management](../20-features/053-skill-creation-and-management/README.md) | 36 | 12 | yes | 12 | 65 | 53 | 65 | 4 | 98 |
| 54 | [Plugin marketplace and customization](../20-features/054-plugin-marketplace-and-customization/README.md) | 40 | 11 | yes | 11 | 92 | 87 | 92 | 7 | 100 |
| 55 | [Connector setup and account management](../20-features/055-connector-setup-and-account-management/README.md) | 32 | 12 | yes | 12 | 80 | 65 | 80 | 4 | 98 |
| 56 | [Concrete integration families](../20-features/056-concrete-integration-families/README.md) | 47 | 11 | yes | 11 | 219 | 169 | 219 | 0 | 106 |
| 57 | [Tool catalog and invocation experience](../20-features/057-tool-catalog-and-invocation-experience/README.md) | 38 | 12 | yes | 12 | 165 | 95 | 165 | 0 | 76 |
| 58 | [MCP and interactive extension products](../20-features/058-mcp-and-interactive-extension-products/README.md) | 28 | 10 | yes | 10 | 66 | 49 | 66 | 0 | 95 |
| 59 | [Approvals and human-in-the-loop UI](../20-features/059-approvals-and-human-in-the-loop-ui/README.md) | 31 | 10 | yes | 10 | 161 | 146 | 161 | 0 | 131 |
| 60 | [Agentic work product](../20-features/060-agentic-work-product/README.md) | 34 | 11 | yes | 11 | 128 | 115 | 128 | 0 | 117 |
| 61 | [Persistent agents and agent rosters](../20-features/061-persistent-agents-and-agent-rosters/README.md) | 24 | 9 | yes | 9 | 16 | 15 | 16 | 0 | 76 |
| 62 | [Multi-agent and multi-model interfaces](../20-features/062-multi-agent-and-multi-model-interfaces/README.md) | 28 | 11 | yes | 11 | 43 | 40 | 43 | 0 | 80 |
| 63 | [Routines, schedules, and triggers](../20-features/063-routines-schedules-and-triggers/README.md) | 35 | 9 | yes | 9 | 106 | 105 | 106 | 0 | 152 |
| 64 | [Browser-assistant experience](../20-features/064-browser-assistant-experience/README.md) | 32 | 12 | yes | 12 | 55 | 44 | 55 | 0 | 122 |
| 65 | [Computer-use experience](../20-features/065-computer-use-experience/README.md) | 29 | 2 | yes | 2 | 41 | 23 | 41 | 0 | 50 |
| 66 | [Coding-workspace frontend](../20-features/066-coding-workspace-frontend/README.md) | 52 | 13 | yes | 12 | 91 | 86 | 91 | 0 | 102 |
| 67 | [Coding capabilities and developer workflows](../20-features/067-coding-capabilities-and-developer-workflows/README.md) | 41 | 12 | yes | 11 | 159 | 145 | 159 | 0 | 97 |
| 68 | [Session continuity and remote-session product](../20-features/068-session-continuity-and-remote-session-product/README.md) | 30 | 11 | yes | 11 | 86 | 64 | 86 | 0 | 94 |
| 69 | [Web application](../20-features/069-web-application/README.md) | 20 | 12 | yes | 12 | 14 | 12 | 14 | 3 | 44 |
| 70 | [Desktop application](../20-features/070-desktop-application/README.md) | 32 | 12 | yes | 12 | 24 | 20 | 24 | 2 | 79 |
| 71 | [Mobile application](../20-features/071-mobile-application/README.md) | 32 | 12 | yes | 12 | 23 | 1 | 23 | 0 | 72 |
| 72 | [CLI and terminal application](../20-features/072-cli-and-terminal-application/README.md) | 39 | 13 | yes | 12 | 37 | 35 | 37 | 0 | 85 |
| 73 | [VS Code and IDE extension](../20-features/073-vs-code-and-ide-extension/README.md) | 30 | 12 | yes | 12 | 30 | 27 | 30 | 0 | 41 |
| 74 | [Browser extension](../20-features/074-browser-extension/README.md) | 28 | 11 | yes | 11 | 22 | 19 | 22 | 0 | 50 |
| 76 | [Model-capability registry](../20-features/076-model-capability-registry/README.md) | 38 | 13 | yes | 13 | 127 | 75 | 127 | 0 | 95 |
| 78 | [UI gating and adaptation components](../20-features/078-ui-gating-and-adaptation-components/README.md) | 30 | 9 | yes | 9 | 127 | 88 | 127 | 0 | 43 |
| 79 | [Routing and model-neutral orchestration](../20-features/079-routing-and-model-neutral-orchestration/README.md) | 31 | 11 | yes | 11 | 130 | 56 | 130 | 0 | 95 |
| 81 | [Free / Basic / Pro / Max 5x / Max 20x planning structure](../20-features/081-free-basic-pro-max-5x-max-20x-planning-structure/README.md) | 28 | 7 | yes | 7 | 88 | 77 | 88 | 0 | 89 |
| 82 | [Usage dashboard and limit UI](../20-features/082-usage-dashboard-and-limit-ui/README.md) | 33 | 12 | yes | 12 | 125 | 114 | 125 | 1 | 107 |
| 83 | [Billing and subscription screens](../20-features/083-billing-and-subscription-screens/README.md) | 33 | 11 | yes | 11 | 77 | 68 | 77 | 0 | 86 |
| 84 | [General and appearance settings](../20-features/084-general-and-appearance-settings/README.md) | 27 | 13 | yes | 12 | 57 | 55 | 58 | 0 | 94 |
| 85 | [Personalization and data settings](../20-features/085-personalization-and-data-settings/README.md) | 26 | 12 | yes | 12 | 73 | 66 | 73 | 1 | 107 |
| 86 | [Security and connected-access settings](../20-features/086-security-and-connected-access-settings/README.md) | 26 | 12 | yes | 12 | 69 | 68 | 69 | 1 | 103 |
| 87 | [Enterprise administration screens](../20-features/087-enterprise-administration-screens/README.md) | 42 | 13 | yes | 12 | 81 | 78 | 81 | 0 | 187 |
| 88 | [Support, trust, and policy product](../20-features/088-support-trust-and-policy-product/README.md) | 32 | 12 | yes | 11 | 81 | 69 | 81 | 6 | 81 |
| 89 | [Account and access components](../20-features/089-account-and-access-components/README.md) | 26 | 13 | yes | 12 | 0 | 0 | 0 | 0 | 45 |
| 90 | [Conversation and synchronization components](../20-features/090-conversation-and-synchronization-components/README.md) | 23 | 12 | yes | 12 | 0 | 0 | 0 | 0 | 68 |
| 91 | [Model and inference components](../20-features/091-model-and-inference-components/README.md) | 32 | 10 | yes | 10 | 0 | 0 | 0 | 0 | 44 |
| 92 | [Tool-calling and agent-loop components](../20-features/092-tool-calling-and-agent-loop-components/README.md) | 30 | 10 | yes | 10 | 0 | 0 | 0 | 0 | 72 |
| 93 | [Search, retrieval, and context components](../20-features/093-search-retrieval-and-context-components/README.md) | 31 | 12 | yes | 12 | 0 | 0 | 0 | 0 | 79 |
| 94 | [Memory and personalization components](../20-features/094-memory-and-personalization-components/README.md) | 22 | 10 | yes | 10 | 0 | 0 | 0 | 0 | 71 |
| 95 | [File and Library components](../20-features/095-file-and-library-components/README.md) | 28 | 9 | yes | 9 | 0 | 0 | 0 | 0 | 64 |
| 96 | [Artifact and generated-application components](../20-features/096-artifact-and-generated-application-components/README.md) | 28 | 10 | yes | 10 | 0 | 0 | 0 | 0 | 94 |
| 97 | [Media and realtime components](../20-features/097-media-and-realtime-components/README.md) | 30 | 1 | yes | 1 | 0 | 0 | 0 | 0 | 8 |
| 98 | [Integration and extensibility components](../20-features/098-integration-and-extensibility-components/README.md) | 29 | 11 | yes | 11 | 0 | 0 | 0 | 0 | 97 |
| 99 | [Coding and local-runtime components](../20-features/099-coding-and-local-runtime-components/README.md) | 30 | 2 | yes | 2 | 0 | 0 | 0 | 0 | 25 |
| 100 | [Commercial and administrative components](../20-features/100-commercial-and-administrative-components/README.md) | 28 | 12 | yes | 12 | 0 | 0 | 0 | 0 | 84 |
| 101 | [Shared package boundaries](../20-features/101-shared-package-boundaries/README.md) | 40 | 9 | yes | 9 | 0 | 0 | 0 | 0 | 48 |
| 102 | [Runtime inventory](../20-features/102-runtime-inventory/README.md) | 32 | 12 | yes | 12 | 0 | 0 | 0 | 0 | 49 |
| 103 | [Data and persistence categories](../20-features/103-data-and-persistence-categories/README.md) | 38 | 10 | yes | 10 | 0 | 0 | 0 | 0 | 45 |
| 104 | [Named technology options-not claims about competitor internals](../20-features/104-named-technology-options-not-claims-about-competitor-interna/README.md) | 39 | 11 | yes | 11 | 0 | 0 | 0 | 0 | 45 |
| 105 | [Developer platform and console](../20-features/105-developer-platform-and-console/README.md) | 30 | 12 | yes | 12 | 42 | 40 | 42 | 0 | 66 |
| 106 | [Office, collaboration-channel, and email surfaces](../20-features/106-office-collaboration-channel-and-email-surfaces/README.md) | 25 | 11 | yes | 11 | 10 | 9 | 10 | 0 | 51 |
| 107 | [Discovery, social, and public-content products](../20-features/107-discovery-social-and-public-content-products/README.md) | 23 | 12 | yes | 12 | 14 | 11 | 14 | 0 | 65 |
| 108 | [Specialist workspaces](../20-features/108-specialist-workspaces/README.md) | 35 | 12 | yes | 12 | 50 | 43 | 50 | 0 | 75 |
| 109 | [Optional native and ambient extensions](../20-features/109-optional-native-and-ambient-extensions/README.md) | 25 | 13 | yes | 13 | 23 | 20 | 23 | 0 | 86 |
| 110 | [Cross-product experiences to include in the product map](../20-features/110-cross-product-experiences-to-include-in-the-product-map/README.md) | 30 | 12 | yes | 12 | 67 | 43 | 67 | 0 | 106 |

## Checks on this knowledge base

- Pages: 2062 (0 without a metadata header).
- Links checked: 28058; broken: 0.
- References to project files checked: 37154; not found: 100 ({'00-start': 11, '20-features': 1, '30-surfaces': 17, '40-systems': 48, '50-competitors': 14, '60-engineering': 6, '70-qa': 3}).
- Duplicate identifiers: 0.
- Relationship map: 24996 nodes, 87849 edges.

Details: [checks.json](checks.json).
