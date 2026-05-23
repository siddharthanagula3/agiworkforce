# R27-PARITY Phase A — R26-PARITY Coverage Matrix

**Date:** 2026-05-23
**Auditor:** team-lead delegate (read-only, code-centric per `feedback_code_centric_verification.md`)
**Inputs:**

- 12 R26-PARITY reports at `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-*.md`
- 333 Claude image files under `/Users/siddhartha/Desktop/reference/ui/` (find result)

## Scope of audit population

`find /Users/siddhartha/Desktop/reference/ui -type f -ipath "*claude*"` returns **333 files**. 327 of these live under the six surface buckets and are scored in the matrix below. The remaining 6 are aggregated contact-sheet thumbnails (one per surface), not per-screen captures, and don't belong to any single surface — they are listed in §"Scope notes" below and excluded from coverage scoring.

## Classification rule (strict, per brief)

For each image, scan all 12 reports for lines containing the image's basename:

- **verdict-scored** — at least one matching line ALSO contains one of the verdict symbols `✅ / 🟡 / ❌ / 🔄 / 🚧`. This requires the verdict symbol to be on the same line as the image citation (i.e., a per-image scorecard row).
- **inventory-only** — image is cited in one or more report lines (inventory table, screenshot-ref footer, or appendix), but no line carries a verdict symbol next to it.
- **uncovered** — no report line contains the image's basename.

This strict reading matches the brief's premise that R26-PARITY produced inventories with feature-level (not per-image) verdicts; the matrix is designed to confirm or refute that premise.

## Per-surface coverage table

| Surface                 | Total imgs | Verdict-scored | Inventory-only | Uncovered | Coverage % | Phase B branch |
| ----------------------- | ---------: | -------------: | -------------: | --------: | ---------: | -------------- |
| web                     |         15 |             14 |              0 |         1 |      93.3% | TARGETED       |
| desktop                 |        210 |              9 |            155 |        46 |       4.3% | FULL           |
| mobile                  |         28 |              0 |             27 |         1 |       0.0% | FULL           |
| cli                     |         31 |              0 |             31 |         0 |       0.0% | FULL           |
| chrome-extension        |         20 |              0 |             18 |         2 |       0.0% | FULL           |
| vscode-extension        |         23 |              0 |             23 |         0 |       0.0% | FULL           |
| **Total (per-surface)** |    **327** |         **23** |        **254** |    **50** |   **7.0%** | —              |

Coverage % = verdict-scored / total. Branch thresholds per brief: ≥95% → SKIP; 50–95% → TARGETED; <50% → FULL.

Only 2 of the 12 R26-PARITY reports (`r-web` and `r-desktop`) actually produced per-image scorecard rows with verdict symbols. The other 10 lanes (`summary`, `v-web-visual`, `w1-web`, `w2a-desktop-pro`, `w2b-desktop-max`, `w2c-desktop-platform`, `w3-mobile`, `w4-cli`, `w5-chrome-ext`, `w6-vscode-ext`) cite images in inventory tables and screenshot-ref footers but apply verdicts at the feature/finding level, not per image. This is the gap Phase B exists to fill.

## Per-surface uncovered + inventory-only image lists

### Surface: web

- inventory-only (0): —
- uncovered (1):
  - `/Users/siddhartha/Desktop/reference/ui/web/perplexity/03_browser_composer-model-selector-best-sonar-gpt-gemini-claude.png`

Note: The single web "uncovered" image lives under `web/perplexity/` and shows a Perplexity model-selector that happens to list "claude" in its name. It is not a Claude reference per se — it is a competitor capture where Claude appears as one of many model options. After excluding it, the 14 actual Claude web images are 100% verdict-scored. Web is effectively at SKIP, not TARGETED, if the brief's intent is "Claude UI references" rather than "files matching `*claude*`".

### Surface: desktop

- inventory-only (155):
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/041_claude-free_home_composer.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/042_claude-free_model-selector_opus-upgrade.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/043_claude-free_add-menu_tools-connectors.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/044_claude-free_directory_connectors.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/045_claude-free_directory_skills.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/046_claude-free_directory_plugins.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/047_claude-free_projects.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/048_claude-free_artifacts.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/048b_claude-free_artifacts_loaded-grid.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/049_claude-free_upgrade-plans.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/050_claude-free_account-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/051_claude-free_settings_general.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/052_claude-free_settings_billing.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/053_claude-free_settings_capabilities.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/054_claude-free_settings_connectors-moved.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/055_claude-free_settings_claude-code-upgrade.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/061_claude-free_artifact_prompt-before-submit.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/062_claude-free_artifact_running.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/063_claude-free_artifact_skill-running.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/064_claude-free_artifact_widget-visible.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/065_claude-free_artifact_result.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/066_claude-free_artifact_widget-interacted.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/071_claude-free_web-search_prompt-before-submit.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/072_claude-free_web-search_running.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/073_claude-free_web-search_sources-visible.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/074_claude-free_web-search_result.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/075_claude-free_web-search_result-lower.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/076_claude-free_logout-menu-before-click.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/101_claude-max20x_model-selector_opus-enabled.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/102_claude-max20x_model-selector_more-models.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/103_claude-max20x_add-menu_tools-connectors.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/104_claude-max20x_connectors-submenu_connected.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/105_claude-max20x_skills-submenu_installed.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/106_claude-max20x_design_research-preview.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/109_claude-max20x_code_sidebar-more-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/110_claude-max20x_code_permission-mode-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/111_claude-max20x_code_model-effort-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/112_claude-max20x_code_usage-popover.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/113_claude-max20x_code_repo-selector.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/114_claude-max20x_code_add-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/115_claude-max20x_code_connectors-submenu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/116_claude-max20x_customize_home.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/117_claude-max20x_customize_skills_detail.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/118_claude-max20x_customize_skills_code-view.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/119_claude-max20x_customize_skills_add-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/120_claude-max20x_directory_skills.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/121_claude-max20x_directory_connectors.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/122_claude-max20x_directory_plugins.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/123_claude-max20x_customize_connectors_github-detail.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/124_claude-max20x_customize_connectors_gmail-permissions.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/125_claude-max20x_customize_connectors_vercel-permissions.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/126_claude-max20x_customize_connectors_add-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/127_claude-max20x_custom-remote-mcp-connector-modal.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/128_claude-max20x_account-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/141_claude-max20x_artifact_prompt-ready.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/142_claude-max20x_artifact_generating.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/143_claude-max20x_artifact_result-inline-widget.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/144_claude-max20x_artifact_widget-interacted-last-month.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/145_claude-max20x_downloads_apps_top.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/146_claude-max20x_downloads_mobile-chrome.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/147_claude-max20x_upgrade-plans_individual.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/148_claude-max20x_upgrade-plans_team-enterprise.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/149_claude-max20x_artifacts_my-empty-or-loading.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/149b_claude-max20x_artifacts_grid-loaded.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/150_claude-max20x_chats_recents.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/151_claude-max20x_global-search-modal.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/152_claude-max20x_sidebar-more-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/153_claude-max20x_chats_bulk-select-mode.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/154_claude-max20x_new-artifact_category-picker.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/155_claude-max20x_new-artifact_start-from-scratch-chat.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/156_claude-max20x_artifact_viewer_split-pane.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/157_claude-max20x_artifact_copy-export-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/158_claude-max20x_research-panel_sources-trace.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/159_claude-max20x_project-create-form.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/160_claude-max20x_example-project_overview.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/161_claude-max20x_project-file-preview-modal.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/162_claude-max20x_project-options-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/163_claude-max20x_project-edit-details-modal.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/164_claude-max20x_project-composer-add-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/165_claude-max20x_project-connectors-submenu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/166_claude-max20x_project-model-selector.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/167_claude-max20x_project-chat-composer-ready.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/168_claude-max20x_project-chat_response-loading.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/169_claude-max20x_project-chat_completed-response.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/170_claude-max20x_project-chat_reasoning-expanded.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/171_claude-max20x_project-return-loading-skeleton.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/172_claude-max20x_project-after-chat-no-chat-list.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/173_claude-max20x_chats-index_recent-project-chat.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/174_claude-max20x_projects-index_cards-sort-search.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/175_claude-max20x_projects-sort-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/176_claude-max20x_expanded-sidebar_projects.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/01_empty-state_new-chat-collapsed-sidebar.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/02_sidebar-expanded_chat-history.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/03_projects-gallery-view.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/04_project-detail_knowledge-panel_error-banner.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/05_three-pane-layout_sidebar-chat-project.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/06_chats-history-management-view.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/20_profile-popover-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/21_customize-claude-landing-page.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/22_skill-detail-view_humanizer.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/23_connector-permissions-dropdown_airtable.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/24_connector-detail_gmail-tool-permissions.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/25_connector-detail_github-integration-info.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/26_connector-detail_vercel-tool-permissions.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/27_connector-detail_control-your-mac.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/28_connector-detail_desktop-commander-permissions.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/29_connector-detail_excel-blocked-permissions.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/30_connector-detail_filesystem-settings.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/31_connectors-list_filesystem-selected.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/32_connectors-list_apple-notes-selected.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/33_connector-oauth-flow_slack-grant-access-modal.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/34_connector-overview_slack-details.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/35_plans-pricing_individual-plans.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/36_plans-pricing_team-enterprise-plans.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/37_feature-showcase_integrations-top.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/38_feature-showcase_integrations-middle.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/39_feature-showcase_integrations-platforms.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/003-cowork-model-menu-adaptive-thinking.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/004-cowork-skills-submenu-installed-skills.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/005-cowork-connectors-submenu-toggles.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/006-cowork-plugins-submenu-categories.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/007-cowork-plugin-category-legal-workflows.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/008-cowork-plugin-selected-inline-slash-command.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/011-claude-desktop-chat-home.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/024-settings-general.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/025-settings-account.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/026-settings-privacy.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/027-settings-billing.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/028-settings-usage.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/029-settings-capabilities.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/030-settings-connectors-deferred.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/031-settings-claude-code.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/032-settings-cowork.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/033-settings-chrome-extension.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/034-settings-desktop-app-extensions.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/035-settings-desktop-app-developer.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/036-customize-home.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/037-customize-skills.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/038-customize-connectors.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/039-customize-plugin-legal.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/040-customize-plugin-legal-skills.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/041-customize-plugin-legal-connectors.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/042-customize-plugin-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended/043-browse-plugins-overlay.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/205_claude-desktop_settings-extension-detail.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/206_claude-desktop_local-permission-or-mcp-warning.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/208_claude-desktop_handoff-result-from-code.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/209_claude-desktop_updated-code-dashboard.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/210_claude-desktop_updated-chat-home-type-for-skills.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/211_claude-desktop_chat-filesystem-readonly-prompt-ready.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/214_claude-desktop_filesystem-tool-result-table.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/215_claude-desktop_slash-skills-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/216_claude-desktop_skill-selected-in-composer.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/217_claude-desktop_skill-composer-with-prompt.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/218_claude-desktop_skill-used-response.png`
- uncovered (46):
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/01_chat-response_comparison-options-ab.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/02_inline-tool-use_filesystem-results-summary.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/03_inline-tool-expanded-detail_json-request-response.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/04_chat-layout_scroll-to-bottom-floating-button.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/05_chat-response_thumbnail-artifact-preview.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/06_inline-web-search-results_with-favicons.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/07_inline-tool-steps_file-creation-sequence.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/08_stacked-tool-status-messages_compact.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/09_chat-context_relevant-chats-list.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/10_inline-tool-steps_file-operations-html.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/11_inline-reasoning-steps_thinking-blocks-clock-icons.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/12_artifact-sidebar_html-resume-preview.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/13_artifact-viewer_toolbar-copy-refresh-close.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/14_chat-user-message_pasted-tag-reasoning-steps.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/15_inline-reasoning-flow_multiple-thought-blocks.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/16_artifact-editor_html-code-source-view.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/17_chat-response_multiple-artifact-cards-download-all.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/18_artifact-sidebar_markdown-preview-split-view.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/19_artifact-sidebar_markdown-source-code-view.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/20_artifact-sidebar_rich-text-document-preview.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/21_artifact-sidebar_pdf-preview-dark-mode.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/22_inline-reasoning_pdf-generation-library-install.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/23_inline-tool-iterative-fixes_python-pdf-script.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/24_artifact-viewer_tabbed-content-with-print-button.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/25_inline-reasoning_design-skill-tool-use.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/26_inline-reasoning_multiple-markdown-artifacts.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-artifacts/27_inline-tool_sequential-pdf-generation.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/01_directory_modal-page-01-gmail-canva-google-calendar-notion-slack.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/02_directory_modal-page-02-vercel-granola-sentry-asana-stripe.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/03_directory_modal-page-03-hugging-face-clay-ahrefs-pitchbook.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/04_directory_modal-page-04-scholar-make-snowflake-zapier.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/05_directory_modal-page-05-posthog-databricks-klaviyo-pendo.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/06_directory_modal-page-06-similarweb-paypal-crypto-biorender.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/07_directory_modal-page-07-outreach-fellow-bitly-calendly.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/08_directory_modal-page-08-mt-newswires-lseg-customer-io.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/09_directory_modal-page-09-airops-cloudinary-lunarcrush-pagerduty.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/10_directory_modal-page-10-craft-motherduck-mem-metaview.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/11_directory_modal-page-11-owkin-yardi-google-compute-clarify.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/12_directory_modal-page-12-benevity-port-io-quartr-planetscale.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/13_directory_modal-page-13-q2-clarity-ai-quickbooks-amplitude.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/14_directory_modal-page-14-alayyn-cb-insights-clinical-trials.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/15_directory_modal-page-15-zoho-filesystem-pdf-figma-tableau.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/16_directory_modal-page-16-apple-notes-control-mac-spotify.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/17_directory_modal-page-17-b12-elevenlabs-shadcn-grafana.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/18_directory_modal-page-18-sapus-tomtom-fantastical-vendr.png`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/19_directory_modal-page-19-meeting-memory-pathmode-jaz-comviso.png`

### Surface: mobile

- inventory-only (27):
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/01_app-shell_splash-opus-extended-faded-greeting.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/02_empty-state_composer-keyboard-up.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/03_sidebar_chats-projects-artifacts-code-dispatch-recents.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/04_composer_model-selector-opus-sonnet-haiku-extended.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/05_projects_list-research-claude-prompt.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/06_artifacts_gallery-loading-skeleton.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/07_artifacts_gallery-loaded-card-grid.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/08_code_sessions-list-idle-and-archived.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/09_cowork_looking-for-desktop-loading.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/10_settings_main-profile-billing-usage-capabilities-connectors.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/11_settings_connectors-drive-gmail-vercel-calendar-n8n.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/12_settings_capabilities-artifacts-code-web-memory-tools.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/13_settings_usage-current-session-and-weekly-limits.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/14_settings_notifications-research-chat-code.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/15_settings_shared-links-empty-state.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/16_settings_permissions-location-calendar-reminders-health.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/17_settings_billing-max-plan-manage-subscription.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/18_settings_profile-personal-preferences.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/19_code_session-detail-connecting-state.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/20_code_session-select-mode-plan-vs-code.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/21_code_session-more-menu-copy-share-rename-archive.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/22_code_session-attachment-take-or-choose-photo.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/23_code_archived-sessions-list.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/24_chat_thread-reasoning-chip-reply-composer.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/25_chat_thought-process-sheet-overview.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/26_chat_thought-process-sheet-expanded.png`
  - `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/27_composer_add-to-chat-sheet-camera-photos-files-toggles.png`
- uncovered (1):
  - `/Users/siddhartha/Desktop/reference/ui/mobile/perplexity-ios/03_composer_models-sheet-best-sonar-gpt-gemini-claude-nemotron.png`

### Surface: cli

- inventory-only (31):
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/02_cli_first-run-login-3-options-claude-account-anthropic-console-3rdparty.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/03_cli_oauth-browser-fallback-paste-code-prompt.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/04_cli_theme-selector-6-options-dark-light-colorblind-ansi.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/05_web_auth-error-claude-max-or-pro-required-to-connect.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/600_cli_chrome-command-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/601_cli_ide-select-dialog.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/602_cli_mcp-list-scopes.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/603_cli_mcp-built-in-detail.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/605_cli_plan-mode-screen.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/607_cli_slash-command-palette-top.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/608_cli_slash-command-palette-middle.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/609_cli_slash-command-palette-lower.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/610_cli_slash-command-palette-bottom.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/611_cli_slash-command-palette-more.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/612_cli_slash-command-palette-more-2.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/613_cli_slash-command-palette-more-3.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/614_cli_slash-command-palette-more-4.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/615_cli_slash-command-palette-more-5.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/616_cli_slash-command-palette-more-6.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/617_cli_slash-command-palette-final.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/618_cli_slash-command-palette-end.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/619_cli_agents-screen.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/620_cli_agents-library-tab.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/621_cli_skills-screen.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/622_cli_plugin-screen.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/623_cli_plugin-installed-tab.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/624_cli_plugin-marketplaces-tab.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/625_cli_plugin-errors-tab.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/626_cli_tasks-screen.png`
  - `/Users/siddhartha/Desktop/reference/ui/cli/claude-code/2026-05-15/627_cli_permissions-screen.png`
- uncovered (0): —

### Surface: chrome-extension

- inventory-only (18):
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/01_sidebar-extension_empty-state_paid-plan-required-banner.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/02_sidebar-extension_action-permission-dropdown_ask-vs-act.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/03_sidebar-extension_attachment-menu_screenshot-image-options.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/04_sidebar-extension_more-options-menu_task-settings-language.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/06_sidebar-extension_quick-mode-modal_model-options.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/401_claude-chrome_side-panel-first-open.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/402_claude-chrome_side-panel-login-or-connected.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/403_claude-chrome_pairing-prompt.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/404_claude-chrome_permissions-page.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/406_claude-chrome_site-permission-action-prompt.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/409_claude-chrome_blocked-sensitive-site.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/413_claude-chrome_shortcuts-list.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/414_claude-chrome_record-workflow-entry.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/415_claude-chrome_record-workflow-mic-permission.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/416_claude-chrome_reconnect-page.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/417_claude-chrome_options-page.png`
- uncovered (2):
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/perplexity-comet/01_comet_sidebar-assistant-empty-state-claude-sonnet.png`
  - `/Users/siddhartha/Desktop/reference/ui/chrome-extension/perplexity-comet/03_comet_sidebar-model-selector-best-gpt-claude-thinking.png`

### Surface: vscode-extension

- inventory-only (23):
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/01_vscode-extension_marketplace-detail-page.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/02_vscode-sidebar_chat-new-chat-empty-state.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/03_vscode-extension_settings-editor-view.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/04_vscode-extension_settings-with-usage-limit-sidebar.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/05_vscode-chat_modes-dropdown-and-effort-slider.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/06_vscode-chat_actions-and-settings-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/07_vscode-chat_input-add-context-menu.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/08_vscode-main-editor_chat-empty-state-full-screen.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/claude/09_vscode-main-editor_chat-sessions-history-dropdown.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/300_cursor_extension-installed_activitybar.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/301_cursor_claude-code_panel-empty-state.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/302_cursor_claude-code_sidebar-empty-state.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/303_cursor_claude-code_header-actions.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/304_cursor_claude-code_session-history.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/305_cursor_claude-code_command-palette.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/306_cursor_claude-code_settings.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/307_cursor_claude-code_walkthrough.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/308_cursor_claude-code_selected-code-context.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/309_cursor_claude-code_at-mention.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/310_cursor_claude-code_permission-notification.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/311_cursor_claude-code_diff-review-inline.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/312_cursor_claude-code_plan-preview.png`
  - `/Users/siddhartha/Desktop/reference/ui/vscode-extension/cursor-claude-code/2026-05-15/313_cursor_claude-code_open-in-terminal.png`
- uncovered (0): —

## Decision tree summary

| Surface          | Coverage % | Threshold | Branch   | Reason                                                                                                                                                                                |
| ---------------- | ---------: | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web              |      93.3% | 50–95%    | TARGETED | 14/15 verdict-scored in `r-web` per-image scorecard. Only the lone Perplexity-named image is uncovered; excluding it, web is at 100%.                                                 |
| desktop          |       4.3% | <50%      | FULL     | 9/210 verdict-scored, all from `r-desktop` runtime-launch table covering ~9 launch/home/menu screenshots. 155 inventory-only + 46 uncovered — Phase B requires a full per-image lane. |
| mobile           |       0.0% | <50%      | FULL     | No per-image scorecard in any of the 12 reports. All 27 Claude-iOS screens cited in inventory tables only.                                                                            |
| cli              |       0.0% | <50%      | FULL     | All 31 Claude-Code CLI screenshots cited in `w4-cli` inventory only; verdicts in that lane are feature-level.                                                                         |
| chrome-extension |       0.0% | <50%      | FULL     | 18 Claude-Chrome screens cited in `w5-chrome-ext` inventory only; 2 Perplexity-Comet captures uncovered.                                                                              |
| vscode-extension |       0.0% | <50%      | FULL     | 9 Claude-VSCode + 14 Cursor-Claude-Code screens cited in `w6-vscode-ext` inventory only.                                                                                              |

## Recommendation for Phase B dispatch

Applying the brief's branching rules mechanically: five surfaces are FULL, one is TARGETED.

### Recommended dispatch (6 lanes)

1. **`phase-b-desktop` — FULL** — 210 images (155 inventory-only + 46 uncovered + 9 verdict-scored to be re-verified against current code). Largest lane.
2. **`phase-b-mobile` — FULL** — 28 images (27 inventory-only + 1 uncovered).
3. **`phase-b-cli` — FULL** — 31 images (all inventory-only).
4. **`phase-b-chrome-extension` — FULL** — 20 images (18 inventory-only + 2 uncovered).
5. **`phase-b-vscode-extension` — FULL** — 23 images (all inventory-only).
6. **`phase-b-web` — TARGETED** — 1 image gap-fill (the lone uncovered Perplexity-named file). Per the brief, TARGETED lanes are scoped to the uncovered+inventory-only lists in §"Per-surface uncovered + inventory-only image lists" — web's combined list is one image. Estimated ~30 minutes.

### Out-of-surface contact sheets

The 6 aggregated thumbnails under `_verification/contact-sheets/` (listed in §"Scope notes") fall outside any surface bucket and are not counted in any lane. Recommend skipping — they duplicate content already scored at per-screen granularity in their parent surface lanes.

### Boundary case to flag for team-lead

Web's 93.3% sits 1.7 points below the SKIP threshold (≥95%). The single deficit is one Perplexity-named file mis-bucketed by the inventory `find` (basename contains "claude" because the image shows a Perplexity model picker that lists Claude as one option, not because it captures Claude UI). If the team-lead wants to redefine the audit population, two options:

- **Tighten the inventory filter** to require a `*claude*` directory component (not just basename), which drops 4 Perplexity-named files (1 web, 1 mobile, 2 chrome-extension) from the surface counts. Web becomes 14/14 = 100% → SKIP. Mobile becomes 27/27 = 0% → still FULL. Chrome-ext becomes 18/18 = 0% → still FULL. Net: web flips SKIP, others unchanged.
- **Adjust SKIP threshold to ≥90%** (one image's worth of slack), which lets web qualify without re-running the inventory. Risks future false SKIPs.

This decision is left for the team-lead. The recommended dispatch above honors the brief's literal rules and produces the 6-lane plan; if the threshold is relaxed, lane #6 disappears.

## Methodology and reproducibility

- Inventory built with `find /Users/siddhartha/Desktop/reference/ui -type f -ipath "*claude*" \( -iname "*.png" -o -iname "*.jpg" \) | sort` → 333 files.
- 327 of 333 fall under one of the six surface dirs (`web` 15, `desktop` 210, `mobile` 28, `cli` 31, `chrome-extension` 20, `vscode-extension` 23). The remaining 6 are aggregated contact-sheet thumbnails under `_verification/contact-sheets/`.
- Classifier: Python script at `/tmp/r27-coverage/classify.py`. For each image's basename, searches all 12 R26-PARITY reports line-by-line for co-occurrence with any of the verdict symbols `✅ 🟡 ❌ 🔄 🚧`. The basename is the unique key (citation forms in reports vary between bare filename and full relative path; basename matches both).
- Per-surface TSVs written to `/tmp/r27-coverage/{surface}.tsv` (status, abs_path, verdict_count, mention_count, first_verdict_report:line, first_mention_report:line). Used to generate the gap lists above.
- Only `r-web` (14 verdict rows) and `r-desktop` (16 verdict rows; 9 unique image basenames) carry per-image verdicts. The other 10 reports (`summary`, `v-web-visual`, `w1-web`, `w2a/b/c-desktop-*`, `w3-mobile`, `w4-cli`, `w5-chrome-ext`, `w6-vscode-ext`) had zero verdict rows on image lines per `grep -E "\.(png|jpg)" "$f" | grep -E "✅|🟡|❌|🔄|🚧"`.

## Scope notes

Six contact-sheet thumbnails are NOT counted in the per-surface table (no parent surface):

- `/Users/siddhartha/Desktop/reference/ui/_verification/contact-sheets/claude_claude-chat-artifacts-and-tools.png`
- `/Users/siddhartha/Desktop/reference/ui/_verification/contact-sheets/claude_claude-chrome-extension.png`
- `/Users/siddhartha/Desktop/reference/ui/_verification/contact-sheets/claude_claude-connectors-directory.png`
- `/Users/siddhartha/Desktop/reference/ui/_verification/contact-sheets/claude_claude-desktop.png`
- `/Users/siddhartha/Desktop/reference/ui/_verification/contact-sheets/claude_claude-vscode-extension.png`
- `/Users/siddhartha/Desktop/reference/ui/_verification/contact-sheets/claude-code.png`

Three Perplexity-named files that appear in the `*claude*` find result because their filenames mention Claude as a competing model option (not because they are Claude UI captures):

- `/Users/siddhartha/Desktop/reference/ui/web/perplexity/03_browser_composer-model-selector-best-sonar-gpt-gemini-claude.png`
- `/Users/siddhartha/Desktop/reference/ui/mobile/perplexity-ios/03_composer_models-sheet-best-sonar-gpt-gemini-claude-nemotron.png`
- `/Users/siddhartha/Desktop/reference/ui/chrome-extension/perplexity-comet/01_comet_sidebar-assistant-empty-state-claude-sonnet.png`
- `/Users/siddhartha/Desktop/reference/ui/chrome-extension/perplexity-comet/03_comet_sidebar-model-selector-best-gpt-claude-thinking.png`

These four files are kept in the per-surface counts (they ARE under the surface dirs) but Phase B may choose to exclude them from "Claude parity" scope.
