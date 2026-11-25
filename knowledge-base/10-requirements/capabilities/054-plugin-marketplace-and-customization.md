---
id: "REQ-AREA-054"
type: "requirements"
title: "Requirement items: Plugin marketplace and customization"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 54. Plugin marketplace and customization

40 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S54.01

**Unified Customize destination.** One Customize destination gathers skills, connectors and plugins.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F054-01 Customize area and tabs](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)

## S54.02

**Plugins tab.** A Plugins section lists available and installed plugins.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F054-01 Customize area and tabs](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.03

**Skills tab.** A Skills section sits beside plugins in the customization area.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F054-01 Customize area and tabs](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)

## S54.04

**Connectors tab.** A Connectors section sits in the customization area.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F054-01 Customize area and tabs](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)

## S54.05

**Public marketplace.** A user can browse a public plugin marketplace and install from it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI unverified, VS Code missing, Chrome missing
- Feature: [F054-02 Browse and search the marketplace](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Competitor trace: CAP-connectors-apps-and-extensions-24
- An owner decision is open on this item.

## S54.06

**Private organization marketplace.** An organization has a private marketplace of plugins for its members.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-04 Organization private marketplace and admin assignment](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Competitor trace: CAP-connectors-apps-and-extensions-24

## S54.07

**Repository-backed marketplace.** A user can add a git repository as a plugin marketplace and install plugins listed in it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-03 Add a git repository as a marketplace](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Competitor trace: CAP-connectors-apps-and-extensions-24

## S54.08

**Search and filters.** A user can search the plugin catalogue and filter the results.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI unverified, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F054-02 Browse and search the marketplace](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)

## S54.09

**Role/use-case categories.** Plugins are grouped into role or use-case categories a user can browse.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-02 Browse and search the marketplace](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)

## S54.10

**Featured plugins.** The marketplace highlights featured plugins.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-05 Featured, recommended and categories](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)

## S54.11

**Recommended plugins.** The marketplace recommends plugins for the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-05 Featured, recommended and categories](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)

## S54.12

**Publisher detail.** A user can see details about a plugin's publisher.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.13

**Plugin detail.** A user can open a plugin's detail page.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.14

**Included Skills.** A plugin shows the skills it includes, and they become usable when installed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.15

**Included connectors.** A plugin shows the connectors it includes, and they work when installed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.16

**Included agents.** A plugin shows the agents it includes, and they are usable when installed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.17

**Included commands.** A plugin shows the commands it includes, and they are usable when installed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.18

**Included hooks.** A plugin shows the hooks it includes, and they run when installed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code missing
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)

## S54.19

**Required permissions.** Before and after installing, a user sees the permissions a plugin requires.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-07 Safety before install: permissions, scan, compatibility, dependencies](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.20

**Supported surfaces.** A plugin shows which surfaces it works on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F054-06 Plugin detail: what it includes and what it needs](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- An owner decision is open on this item.

## S54.21

**Install.** A user can install a plugin.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F054-08 Install, configure and bundled connections](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.22

**Configure.** A user can configure an installed plugin's settings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-08 Install, configure and bundled connections](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.23

**Authenticate bundled connections.** A user can authenticate the connections a plugin bundles.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-08 Install, configure and bundled connections](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)

## S54.24

**Enable/disable.** A user can turn an installed plugin off and on without uninstalling it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F054-09 Turn off, update, pin, uninstall](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.25

**Update.** A user can update an installed plugin to a newer version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-09 Turn off, update, pin, uninstall](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.26

**Pin version.** A user can pin a plugin to a specific version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-09 Turn off, update, pin, uninstall](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.27

**Customize installed plugin.** A user can customize an installed plugin (edit its skills or content).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F054-10 Customize a plugin (copy its skills)](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Competitor trace: CAP-connectors-apps-and-extensions-25

## S54.28

**Fork plugin.** A user can fork a plugin into their own editable copy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-10 Customize a plugin (copy its skills)](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)

## S54.29

**Uninstall.** A user can uninstall a plugin.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-09 Turn off, update, pin, uninstall](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.30

**Organization assignment.** An admin can assign plugins to an organization, its groups or members.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-04 Organization private marketplace and admin assignment](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Competitor trace: CAP-connectors-apps-and-extensions-24

## S54.31

**Installation approval request.** A member can request admin approval to install a blocked plugin.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-04 Organization private marketplace and admin assignment](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)

## S54.32

**Security-scan result.** A user can see a plugin's security-scan result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-07 Safety before install: permissions, scan, compatibility, dependencies](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Competitor trace: CAP-connectors-apps-and-extensions-22

## S54.33

**Compatibility warning.** The product warns when a plugin is not compatible with this surface or version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F054-07 Safety before install: permissions, scan, compatibility, dependencies](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S54.34

**Missing-dependency repair.** When a plugin's dependency is missing, the product offers to fix it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-07 Safety before install: permissions, scan, compatibility, dependencies](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)

## S54.35

**Plugin-creation assistant.** The product helps a user build a plugin with an assistant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-10 Customize a plugin (copy its skills)](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Competitor trace: CAP-connectors-apps-and-extensions-25

## S54.36

**Submission and review workflow.** A publisher can submit a plugin for review and track the review.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-11 Publish, review and moderate](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Competitor trace: CAP-connectors-apps-and-extensions-30

## S54.37

**Listing moderation.** Platform staff can moderate listings (suspend, deprecate).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-11 Publish, review and moderate](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Competitor trace: CAP-connectors-apps-and-extensions-30

## S54.38

**Report plugin.** A user can report a plugin.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-11 Publish, review and moderate](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Competitor trace: CAP-connectors-apps-and-extensions-30

## S54.39

**Publisher analytics.** A publisher sees analytics for their plugins.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-11 Publish, review and moderate](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)

## S54.40

**Commercial procurement where offered.** Paid plugins can be bought through commercial procurement where offered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F054-11 Publish, review and moderate](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
