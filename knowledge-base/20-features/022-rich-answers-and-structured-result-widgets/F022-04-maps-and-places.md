---
id: "F022-04"
type: "feature"
title: "Maps and places"
aliases: ["Maps", "Places", "Map card", "Place cards", "Map search card", "places.v1", "map-search.v1", "search_maps", "search_places", "S22.10", "S22.11"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S22.10", "S22.11"]
depends_on: ["SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "table:web_messages"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-04 Maps and places

Location answers show a map with numbered pins and a list; place answers show cards with rating, address, hours and links. Web and Mobile (Cloud only) and Chrome (map only) draw maps. Real place data needs a places key, and the map tile provider is still a public development default.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.10](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2210), [S22.11](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2211).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Draws a tile map with markers for places in an answer, lists each stop with a link to open it in a maps service, and shows rich place cards (name, rating, address, hours, phone, website, photos) from a places search.

**Why it exists.** Location questions are answered best by a map and real data. The brief requires interactive maps (S22.10) and place cards (S22.11). The places tool is built so the model does not answer from memory.

**Who uses it.** Web and Desktop (Electron hosted web), Mobile Cloud users and Chrome side panel users.

**Problems it solves**

- Model inventing ratings or opening hours (the tool is required for place questions and says so when unavailable).
- Opening unsafe links (only allowed map provider URLs open).
- Maps that swallow page scrolling (wheel zoom is off).

**Use cases**

- Ask 'coffee near Union Square', see rated places and a map.
- Ask for a map of a few landmarks and open one in Maps.
- Open a place popup for address, hours and website.

## 2. User experience

**Where to find it**

- Web and Desktop: map-search card, places card with list and popup, answer-ui map block (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38-55; cards/PlacesMapCard.tsx; cards/MapSearchCard.tsx; cards/answer-ui/AnswerUiMap.tsx).
- Mobile: PlacesCard, MapSearchCard, static tile map and MapViewer (apps/mobile/src/features/chat/components/cards/).
- Chrome side panel: map preview card with provider actions (apps/extension/src/features/side-panel/bubbles.ts:161; mapPreview.ts).
- CLI and VS Code: none found.

**Before you start**

- Cloud chat with a tool-capable model on the web, desktop, mobile or chrome surface.
- Places cards also need the places key on the server.
- Mobile map tiles need Managed Cloud mode and a signed-in session.

**Screens and controls**

- Map with numbered pins, no zoom buttons and no wheel zoom (apps/web/features/chat/components/messages/cards/map/LeafletMapCanvas.tsx:133-136), fullscreen toggle on the answer-ui map.
- Stop list with a 'Maps' link for each pin, opens in a new tab with noopener.
- Places: list of cards, selected popup, photo carousel, rating label.
- Note under answer-ui map: 'Pins are placed from the answer and can be approximate.' (packages/ui/unified-chat/src/lib/answer-ui.ts:11).

**Journey**

1. Person asks about a place or location.
2. Server offers search_places (place questions) or search_maps (map intent) to the model.
3. Tool runs and a card streams to the client.
4. Client loads the map config and tiles, draws pins.
5. Person selects a place or opens it in Maps.

**What the person sees and gets**

- 'No places matched this search.' when empty (PlacesMapCard.tsx:25).
- 'The map could not be loaded. The places from this search are listed below.' when tiles are unavailable (PlacesMapCard.tsx:26).
- Mobile: 'Map preview is available in Managed Cloud.' outside Cloud mode (apps/mobile/src/features/chat/services/mapTiles.ts:24).

**Settings**

- Server environment names: AGI_MAP_TILE_URL_TEMPLATE, AGI_MAP_TILE_ATTRIBUTION, AGI_MAP_TILE_MAX_ZOOM, AGI_MAP_TILE_DARK_URL_TEMPLATE, AGI_MAP_TILE_DARK_ATTRIBUTION (apps/web/lib/maps/map-tile-provider.ts:5-9); GOOGLE_PLACES_API_KEY (apps/web/lib/places/places-config.ts:7); AGI_MAP_GEOCODER_CONTACT (tile route).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Tile provider config with https and {z}{x}{y} validation, dark template or dimmed light tiles (map-tile-provider.ts:92-110).
- Authenticated tile proxy route with size and time caps (apps/web/app/api/maps/tile/[z]/[x]/[y]/route.ts) and config route (apps/web/app/api/maps/config/route.ts).
- Web Leaflet map canvas, places card, map search card, answer-ui map.
- Places tool with not-configured and unaffordable messages (apps/web/lib/places/places-tool.ts:105-113).
- Mobile cards gated by Cloud mode (apps/mobile/src/features/chat/components/MessageBubble.tsx:2462).
- Chrome map preview fitting points with zoom cap 15 (apps/extension/src/features/side-panel/mapPreview.ts:21,80-100); Chrome registry has map-search, itinerary, comparison, image, clarify (bubbles.ts:241-249).
- Link safety for provider URLs (packages/contracts/cloud-contracts/src/map-urls.ts:3-24).

**Incomplete**

- Tile provider default is the public OpenStreetMap server for development (map-tile-provider.ts:16); the owner must choose a production provider (S22.10).
- The brief says GOOGLE_PLACES_API_KEY and a live check by the owner are pending (S22.11).
- Electron map rendering and CSP for the tile host not live-checked (brief S22.10).

**Present but disconnected or switched off**

- Without GOOGLE_PLACES_API_KEY the search_places tool is not offered (apps/web/lib/config/optional-features.ts:116-122).
- The map fence in AnswerSurface builds a public OpenStreetMap tile address directly at zoom 5 and does not use the configured provider (packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx:155-162) [deviation].

**Not available**

- CLI and VS Code: no map or place cards found.
- Chrome: places.v1 and answer-ui.v1 are not in its registry (bubbles.ts:241-249).
- Mobile outside Managed Cloud: tiles blocked, so no map preview (mapTiles.ts:24).

## 4. Required behaviour

**Established requirements**

- Location answers render an interactive map with markers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.10)
- Place and business results render as cards (name, rating, address, hours, links). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.11)
- Map tile address comes from AGI_MAP_TILE_URL_TEMPLATE; unset falls back to a development tile address; the dark style uses a dark template or dims light tiles. (source: apps/web/lib/maps/map-tile-provider.ts:5-26,92-110)
- Place search is optional; without the key the tool is not offered and place questions go unlocated. (source: apps/web/lib/config/optional-features.ts:116-122)
- Only allowed map provider URLs open from a card. (source: packages/contracts/cloud-contracts/src/map-urls.ts:3-24)
- Do not substitute remembered places, ratings or hours when places are unavailable. (source: apps/web/lib/places/places-tool.ts:105-113)

**Acceptance criteria**

1. With a valid tile template set, tiles load through the app's tile route.
2. With no template set, development tiles are used; an invalid template logs an error and uses the default.
3. Without the places key, place questions are answered without invented ratings.
4. A map link outside the allowed Google or OpenStreetMap forms is not opened.
5. With tiles unreachable, the list of places still shows.
6. Mobile Local mode shows 'Map preview is available in Managed Cloud.'
7. Chrome map fits all points within zoom limits.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Production must not rely on public development tiles [inferred from the comment in map-tile-provider.ts:11-14].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the map fence use the configured tile route.
- [proposed] Provide an offline-safe static fallback for Local mode on Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | map-tile-provider | `apps/web/lib/maps/map-tile-provider.ts` | Tile config from env, validation, dark style |
| endpoint | GET /api/maps/tile/{z}/{x}/{y} | `apps/web/app/api/maps/tile/[z]/[x]/[y]/route.ts` | Tile proxy with rate limit, 5 s timeout, 512 KB cap |
| endpoint | GET /api/maps/config | `apps/web/app/api/maps/config/route.ts` | Tile config to clients (MAP_CONFIG_PATH) |
| endpoint | GET /api/maps/place-photo | `apps/web/app/api/maps/place-photo/route.ts` | Place photos |
| component | LeafletMapCanvas | `apps/web/features/chat/components/messages/cards/map/LeafletMapCanvas.tsx` | Map drawing, no wheel zoom |
| component | PlacesMapCard | `apps/web/features/chat/components/messages/cards/PlacesMapCard.tsx` | Places map, list, popup, empty and unavailable text |
| component | MapSearchCard | `apps/web/features/chat/components/messages/cards/MapSearchCard.tsx` | Map search card |
| component | AnswerUiMap (web) | `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiMap.tsx` | Pins, list, Maps link, note |
| component | AnswerSurface MapCard | `packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx` | Map fence with fixed public tile (:155-199) |
| service | places tool | `apps/web/lib/places/places-tool.ts` | search_places tool, limits 1-10, default 5, messages |
| service | places config | `apps/web/lib/places/places-config.ts` | Key name, timeout 8 s, price per call |
| service | google places provider | `apps/web/lib/places/google-places-provider.ts` | Outside places vendor client |
| config | optional-features | `apps/web/lib/config/optional-features.ts` | places_search feature record (:116) |
| service | map URL allow-list | `packages/contracts/cloud-contracts/src/map-urls.ts` | Allowed provider and directions URLs |
| component | Mobile PlacesCard | `apps/mobile/src/features/chat/components/cards/PlacesCard.tsx` | Mobile place card |
| service | Mobile mapTiles | `apps/mobile/src/features/chat/services/mapTiles.ts` | Tile access, Cloud-only copy |
| component | Mobile MapFenceSurface | `apps/mobile/src/features/chat/components/MapFenceSurface.tsx` | Map fence surface (not opened) |
| component | Chrome mapPreview | `apps/extension/src/features/side-panel/mapPreview.ts` | Tile fitting and drawing |
| service | request-processor card offers | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | applyMapSearchCardCapability :1318, placesToolOffer :1391 |
| test | map-tile-provider test | `apps/web/lib/maps/map-tile-provider.test.ts` | Tile config |
| test | PlacesMapCard test | `apps/web/features/chat/components/messages/cards/PlacesMapCard.test.tsx` | Places card |
| test | Chrome map preview test | `apps/extension/__tests__/side-panel-map-preview.test.ts` | Chrome map |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client declares which card kinds it can show in the chat request. | device | apps/web/lib/hooks/useChatStream.ts:1334-1350; apps/mobile/src/features/chat/utils/clarifyCard.ts:7-17; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1581-1590 |
| Server offers search_places only if the key exists and the question needs places; offers search_maps on map intent for web, mobile and chrome. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1318-1345,1391-1401 |
| Places search runs against the places vendor; the call is billed and refused when credits are short. | outside service | apps/web/lib/places/places-tool.ts:105-160; places-config.ts:7-12 |
| Card is validated and streamed as an interactive card. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/interactive-card-stream.ts; apps/web/lib/server/neon-chat.ts:94 |
| Client fetches the tile config, then tiles through the app's tile route. | our servers | apps/web/features/chat/components/messages/cards/map/mapTileConfig.ts:32; tile route.ts |
| Tile route fetches from the configured tile vendor. | outside service | apps/web/app/api/maps/tile/[z]/[x]/[y]/route.ts:19-20 (5 s timeout) |
| Map draws and person opens a place link in a new tab. | device | AnswerUiMap.tsx; InteractiveCardBlock.tsx:55-58 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Interactive cards (max 4 per message, 12,000 characters each) | Message metadata under key interactiveCards in web_messages | With the conversation | Follows the message; normalised on write (neon-chat.ts:94-103) |
| Place search billing usage | Usage ledger (places-cost.ts) | Server | unknown |

**Models and providers.** Tools need a tool-capable model on a streaming turn (request-processor.ts:1391-1401). The places vendor is Google Places; the tile vendor is configurable. Neither is a chat model provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Tile route calls getClerkAuthUser; Mobile needs a signed-in bearer to load tiles (mapTiles.ts:36-60). Whether the web tile route rejects anonymous requests was not traced. |
| Permissions | search_places is a read tool, auto-allowed in read-only mode (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:138-144). |
| Subscription | Places search is charged per call at a rate card price and refused with 'no credits left' text when unaffordable (places-tool.ts:110-113,147-157). Plan-specific allowance: unknown. |
| Limits and metering | Places limit 1-10, default 5 (packages/contracts/types/src/places-search.ts:16-18); map pins up to 10 in answer-ui (answer-ui.ts:19); tile zoom floor 2, ceiling 22 (map-tile-provider.ts:30-31). |
| Feature flags | GOOGLE_PLACES_API_KEY set or not; AGI_MAP_TILE_URL_TEMPLATE set or not. |
| Model compatibility | Tool-capable streaming model required. |
| Provider restrictions | One places vendor; the tile vendor must support {z}/{x}/{y} and https. |
| Local mode | Map and place cards come from the Cloud tool loop, so they do not appear in Local chat [inferred]. Mobile explicitly blocks tiles outside Managed Cloud (MessageBubble.tsx:2462; mapTiles.ts:24). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Tile config loading | Status loading, then ready or unavailable | mapTileConfig.ts:51-60 |
| Tiles unavailable | List shown with an explanatory line | PlacesMapCard.tsx:26 |
| No places matched | Empty message | PlacesMapCard.tsx:25 |
| Places not configured | Tool not offered; if called, model told not to use memory | optional-features.ts:116-122; places-tool.ts:105 |
| No credits | Search refused, model tells the person the balance stopped it | places-tool.ts:110-113 |
| Tile fetch timeout or oversize | Aborted at 5 s or 512 KB | apps/web/app/api/maps/tile/[z]/[x]/[y]/route.ts:19-20 |
| Invalid tile template | Default used and error logged | map-tile-provider.ts:58-69 |
| Signed out or auth error (Mobile) | Copy 'Sign in to load the secure map preview.' or 'Map preview is unavailable. You can still open the result in Maps.' | mapTiles.ts:22-28 |
| Wheel scroll | Page scrolls; map does not zoom | LeafletMapCanvas.tsx:134-136 |
| Offline or retry | not handled in the code beyond the unavailable state | none found in the map card files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/maps/map-tile-provider.test.ts`: Tile config (file exists)
- `apps/web/app/api/maps/config/__tests__/route.test.ts`: Config route (file exists)
- `apps/web/app/api/maps/tile/[z]/[x]/[y]/route.test.ts`: Tile route (file exists)
- `apps/web/lib/places/places-tool.test.ts`: Places tool (file exists)
- `apps/web/lib/places/google-places-provider.test.ts`: Provider (file exists)
- `apps/web/features/chat/components/messages/cards/PlacesMapCard.test.tsx`: Places card (file exists)
- `apps/web/features/chat/components/messages/cards/MapSearchCard.test.tsx`: Map search card (file exists)
- `apps/mobile/src/features/chat/components/cards/__tests__/PlacesCard.test.tsx`: Mobile places (file exists)
- `apps/mobile/src/features/chat/components/cards/__tests__/MapCardsSafety.test.tsx`: Mobile map safety (by name)
- `apps/extension/__tests__/side-panel-map-preview.test.ts`: Chrome map preview (file exists)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.places-card.test.ts`: Server places card (file exists)

**Test scenarios**

- **Tile template**
  1. Set AGI_MAP_TILE_URL_TEMPLATE to a valid https template on a test server.
  2. Ask for a map.
  - Expected: Tiles come through /api/maps/tile and attribution reads the configured text.
- **No places key**
  1. Remove GOOGLE_PLACES_API_KEY.
  2. Ask for open coffee shops nearby.
  - Expected: No places tool; the answer does not invent ratings.
- **Mobile Local**
  1. Open a card in Local mode on Mobile.
  - Expected: Text 'Map preview is available in Managed Cloud.'
- **Link safety**
  1. Tamper with a card action URL to another host.
  - Expected: Card fails validation or the link does not open.
- **Scroll**
  1. Scroll the transcript over a map with the wheel.
  - Expected: Page scrolls; map does not zoom.
- **Electron**
  1. Open a map card in the Electron app.
  - Expected: Tiles render (the brief says CSP for the tile host is not yet live-checked).

**Where to look when it fails**

- Log line '[maps] tile template must be an https url...'.
- Error codes not_configured and unaffordable in places-tool.ts.
- Rate limit key map-tile.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)
- Chrome: [70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **Public development tiles are still the default** Affects: Web, Desktop, Mobile, Chrome in production. Evidence: apps/web/lib/maps/map-tile-provider.ts:11-16. Work needed: Owner picks a provider and sets the environment
- **Map fence uses a fixed public tile address** Affects: Web and Desktop fenced maps. Evidence: packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx:155-162. Work needed: Route through the configured provider
- **Places key not set and live check pending** Affects: Web, Desktop, Mobile place cards. Evidence: S22.11 unfinished note in the area brief. Work needed: Create the key and verify
- **Mobile maps only in Managed Cloud** Affects: Mobile Local and own-key users. Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:2462. Work needed: Decide whether Local needs a map
- **Chrome lacks places.v1** Affects: Chrome users. Evidence: apps/extension/src/features/side-panel/bubbles.ts:241-249. Work needed: Add a place card builder
- **The brief says mobile places are missing; code has PlacesCard** Affects: Brief accuracy. Evidence: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1137. Work needed: Update the brief and verify on device
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- table:web_messages

## Unknown

- Whether the web tile route allows anonymous requests.
- Electron CSP for tile hosts.
- Desktop Tauri map behaviour.
- Plan-specific places allowance.
- Mobile MapFenceSurface behaviour.
- Retention of places usage records.
