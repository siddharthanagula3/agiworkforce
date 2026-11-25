---
id: "REQ-AREA-098"
type: "requirements"
title: "Requirement items: Integration and extensibility components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 98. Integration and extensibility components

29 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S98.01

**Connector registry.** A server-side registry defines every connector: id, auth scheme, endpoint, risk class and release state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-01 Connect a service account](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Competitor trace: CAP-connectors-apps-and-extensions-01, CAP-connectors-apps-and-extensions-02, CAP-connectors-apps-and-extensions-12

## S98.02

**Connected-account store.** A store keeps each user's connected accounts and grants per connector.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-01 Connect a service account](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)

## S98.03

**OAuth callback service.** An OAuth callback service validates state, exchanges the code and stores the grant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-01 Connect a service account](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S98.04

**Token vault.** Connector tokens and credentials are stored encrypted and decrypted only for use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-02 Keep connections working](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S98.05

**Token refresh coordinator.** A coordinator refreshes expiring tokens once, even when several requests need the token at the same time.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-02 Keep connections working](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S98.06

**Scope/consent manager.** Requested scopes are capped per provider and a wider scope set forces fresh consent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-01 Connect a service account](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Competitor trace: CAP-connectors-apps-and-extensions-03

## S98.07

**Provider-specific connector adapters.** Provider-specific adapters implement connector behaviour for each supported provider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-03 Use a connected service in chat](../../20-features/098-integration-and-extensibility-components/F098-03-use-a-connected-service-in-chat.md)

## S98.08

**Connector search/index worker.** A background worker syncs and indexes connector content so it can be searched.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-07 Connector search index and private network bridge (not built)](../../20-features/098-integration-and-extensibility-components/F098-07-connector-search-index-and-private-network-bridge.md)

## S98.09

**External webhook receiver.** Signed webhooks from external providers are received, verified and routed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-06 Receive events from outside services](../../20-features/098-integration-and-extensibility-components/F098-06-receive-events-from-outside-services.md)

## S98.10

**Connector health monitor.** A health monitor tracks each connection's state (healthy, needs reauth, failing).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-02 Keep connections working](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)

## S98.11

**Multi-account selection.** When several accounts exist for a connector, the runtime selects the right one per task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-01 Connect a service account](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Competitor trace: CAP-connectors-apps-and-extensions-13

## S98.12

**MCP client runtime.** An MCP client runtime connects to servers and lists and calls their tools, resources and prompts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-04 Connect MCP servers and show their interactive apps](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Competitor trace: CAP-connectors-apps-and-extensions-07

## S98.13

**MCP server host.** The product can run as an MCP server that exposes its own tools to other clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-05 Let other tools use this product](../../20-features/098-integration-and-extensibility-components/F098-05-let-other-tools-use-this-product.md)

## S98.14

**MCP gateway/proxy.** A server-side gateway proxies MCP operations for a user, applying auth and permissions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-03 Use a connected service in chat](../../20-features/098-integration-and-extensibility-components/F098-03-use-a-connected-service-in-chat.md)

## S98.15

**Private-network bridge.** A bridge lets cloud connectors reach services on a customer's private network.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-07 Connector search index and private network bridge (not built)](../../20-features/098-integration-and-extensibility-components/F098-07-connector-search-index-and-private-network-bridge.md)
- Competitor trace: CAP-connectors-apps-and-extensions-09

## S98.16

**Interactive-app host bridge.** A host bridge renders MCP App resources in a sandbox and relays calls between widget and server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-04 Connect MCP servers and show their interactive apps](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Competitor trace: CAP-connectors-apps-and-extensions-14

## S98.17

**Plugin registry.** A plugin registry lists available plugins with versions and metadata.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-08 Find and install plugins](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S98.18

**Plugin package validator.** Plugin packages are validated (manifest, integrity, signature) before they can be installed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-09 Plugin trust and organization rollout](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S98.19

**Plugin dependency resolver.** Installing a plugin resolves and installs the plugins it depends on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-08 Find and install plugins](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S98.20

**Plugin installer/updater.** Plugins can be installed, updated to a newer version and uninstalled.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-08 Find and install plugins](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Competitor trace: CAP-connectors-apps-and-extensions-23

## S98.21

**Skill registry.** A skill registry lists the skills available to a user, including plugin-provided ones.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-10 Skills and commands](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md)
- Competitor trace: CAP-connectors-apps-and-extensions-26

## S98.22

**Skill resource loader.** A skill's bundled files (scripts, references, assets) can be loaded when the skill is used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-10 Skills and commands](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md)
- Competitor trace: CAP-connectors-apps-and-extensions-26

## S98.23

**Hook dispatcher.** A hook dispatcher runs configured hooks at lifecycle events and applies their outcome.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-11 Automation hooks](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Competitor trace: CAP-connectors-apps-and-extensions-26

## S98.24

**Command registry.** A command registry merges built-in, skill, plugin and custom commands for the command surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-10 Skills and commands](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md)
- Competitor trace: CAP-connectors-apps-and-extensions-26

## S98.25

**Marketplace catalog service.** A marketplace service registers plugin catalogs and keeps them refreshed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-08 Find and install plugins](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Competitor trace: CAP-connectors-apps-and-extensions-24

## S98.26

**Publisher identity service.** Publishers have verified identities and installs check a package came from its publisher.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-09 Plugin trust and organization rollout](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Competitor trace: CAP-connectors-apps-and-extensions-30

## S98.27

**Organization distribution service.** An organization can distribute approved extensions (servers, plugins, skills) to its members.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-09 Plugin trust and organization rollout](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Competitor trace: CAP-connectors-apps-and-extensions-24

## S98.28

**Package scanning.** Extension packages are scanned for dangerous content and blocked or flagged before install.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-09 Plugin trust and organization rollout](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Competitor trace: CAP-connectors-apps-and-extensions-22

## S98.29

**Extension evaluation service.** Extensions are evaluated (quality/safety runs) before or after publication.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F098-09 Plugin trust and organization rollout](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
