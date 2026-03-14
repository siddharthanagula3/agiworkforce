# Experimental / Unmounted Components

These components were identified during the March 2026 audit as having zero importers
in the production component tree. They have been moved here rather than deleted to:

1. Preserve work-in-progress features (MessagingPanel, CodeWorkspace)
2. Allow easy restoration when wiring is added
3. Avoid blocking TypeScript compilation of partially-complete features

## Components

| Component | Original Path | Status | Notes |
|-----------|--------------|--------|-------|
| DockingSystem | components/Layout/ | Stub | Window docking UI |
| KnowledgeBaseViewer | components/KnowledgeBaseViewer/ | Partial | KB browsing UI |
| ModelComparisonView | components/ModelComparison/ | Partial | Side-by-side model compare |
| MobileCompanionPanel | components/Mobile/ | Stub | Mobile companion UI |
| LovableMigrationWizard | components/Migration/ | Honest stub | UI remains experimental, but live commands now return explicit not-implemented errors instead of fake Lovable data |
| MessagingPanel | components/Messaging/ | In-Progress | Slack/WhatsApp/Discord — has invoke() calls |
| TeamDashboard | components/Teams/ | Partial | Team management UI |
| CodeWorkspace | components/Code/ | In-Progress | Code editor workspace |

## To re-wire a component

1. Move it back to the appropriate `components/` subdirectory
2. Add it to the routing or parent component that should render it
3. Ensure all `invoke()` calls match registered Rust commands
4. Remove from this directory
