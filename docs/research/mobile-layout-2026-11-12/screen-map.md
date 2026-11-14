# Screenshot names and screen map: ChatGPT, Claude, Perplexity and Gemini on iPhone (observed 2026-11-12)

Status: Historical snapshot
Owner: Product (founder)
Last updated: 2026-11-13

An index of the founder's 229 reference screenshots. Every picture has a name that says what it shows, every screen says which screen it opens from, and each one points at the section of the layout file that measures it. Use it to find the right picture without opening images. Like the rest of this folder it is dated inventory, not authority (AGENTS.md section 10).

## How to use it

1. Find the screen in the tree below by its title. The words in backticks are its id; its pictures follow.
2. Open the picture: its file is `IMG_<number>_<picture name>.PNG` in the folder `competitor_mobile_pics` on the founder's Desktop, so `IMG_<number>_*` finds it. The pictures are not in the repository.
3. For the measurements, search `screens.jsonl` for the id or the picture number. Its `doc` field names the layout file and the screen number there.

```bash
grep '"img":1248,' docs/research/mobile-layout-2026-11-12/screens.jsonl
```

```bash
grep '"id":"claude.model.model-picker"' docs/research/mobile-layout-2026-11-12/screens.jsonl
```

```bash
grep '"t":"image"' docs/research/mobile-layout-2026-11-12/screens.jsonl | grep '"effort-control"'
```

## Names

- A screen id is `<app>.<area>.<screen>`, for example `chatgpt.composer.effort-slider`.
- A picture name is the screen id, plus one more word when the screen has several pictures: `chatgpt.composer.effort-slider.instant`. The tree prints only that last word after the picture number.
- A picture file is the picture number, then the picture name: `IMG_1134_chatgpt.composer.effort-slider.instant.PNG`. The layout files cite a picture by `IMG_<number>` alone, which is the start of its file name.
- A screen is one surface with one purpose. A picture belongs to the surface in front: a picture of a sheet over a page is filed under the sheet, and the sheet opens from the page.
- The tree nests each screen under the first screen it opens from. Other ways in are listed at the end of its line.

## Counts

| App        | Pictures | Screens | Links | Observed | Inferred |
| ---------- | -------- | ------- | ----- | -------- | -------- |
| ChatGPT    | 107      | 57      | 62    | 49       | 13       |
| Claude     | 58       | 44      | 43    | 32       | 11       |
| Perplexity | 28       | 22      | 22    | 19       | 3        |
| Gemini     | 36       | 28      | 31    | 20       | 11       |
| Total      | 229      | 151     | 158   | 120      | 38       |

A link is OBSERVED when the layout file states it, or when a picture of the parent screen shows the control and a later picture shows the result. It is INFERRED when it is a reading of how the app is built that no picture shows.

## What is in `screens.jsonl`

One record per line: 151 screen records and 229 picture records, grouped by app.

| Field                          | Record  | Meaning                                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------------------- |
| `t`                            | both    | `screen` or `image`                                                             |
| `id`                           | screen  | the screen id                                                                   |
| `img`, `file`                  | picture | picture number and file name                                                    |
| `name`                         | picture | the picture's name                                                              |
| `screen`                       | picture | id of the screen the picture shows                                              |
| `app`                          | both    | `chatgpt`, `claude`, `perplexity` or `gemini`                                   |
| `title`                        | both    | what a person would call the screen                                             |
| `summary`                      | screen  | one sentence on what is on it                                                   |
| `state`                        | picture | what is particular to this picture                                              |
| `area`                         | both    | part of the product, from the list below                                        |
| `container`                    | both    | kind of surface, from the list below                                            |
| `shows`                        | both    | components on the screen, from the list below                                   |
| `keyboard`, `theme`, `rotated` | picture | keyboard on screen; `dark` or `light`; frame wider than tall                    |
| `images`                       | screen  | the numbers of its pictures                                                     |
| `doc`                          | both    | `<layout file>#<N>`: the section headed `### N.` in that file                   |
| `opened_from`                  | screen  | the screens it opens from, each with the control used (`via`) and a status      |
| `opens`                        | screen  | the same links read the other way                                               |
| `root`                         | screen  | true on a screen an app starts on                                               |
| `note`                         | picture | a disagreement with the layout file, or a misfiled, rotated or repeated picture |

Words used in `area`: `home`, `composer`, `chat`, `voice`, `model`, `add-menu`, `sidebar`, `search`, `projects`, `library`, `tasks`, `customize`, `connectors`, `code`, `work`, `health`, `account`, `billing`, `settings`, `privacy`, `help`, `onboarding`.

Words used in `container`: `page` (full screen), `drawer` (side panel), `sheet` (bottom sheet joined to the edges), `floating-sheet` (card with a gap around it), `dialog` (centred alert), `menu` (popover), `system` (drawn by iOS or the App Store), `web` (in-app browser), `overlay` (replaces part of a page in place).

Words used in `shows`: `chat-header`, `composer`, `effort-control`, `model-picker`, `add-menu`, `sidebar`, `messages`, `settings-list`, `sheet`, `dialog`, `menu`, `buttons`, `paywall`, `voice-mode`, `projects`, `files`, `memory`, `connectors`, `tasks`, `library`, `search`, `account`, `usage`, `notifications`, `privacy`, `code`, `work`, `health`, `sign-in`, `onboarding`, `tabs`, `list`, `form`, `toggle`, `empty-state`, `toast`, `web-view`, `system-ui`, `personalization`, `media`.

## How it was made and checked

- Built from the layout files in this folder, one pass per app, with the pictures opened where a layout file left a state or a link unclear.
- Checked by script: every picture appears once, every name is unique, every screen can be reached from a start screen by following links, every picture is listed in the heading of the layout section it points at, and no record carries a personal name, an address or a model name.
- Twelve pictures were then compared with their records by eye and all matched. That pass moved one link (the Claude Shared links page opens from the settings list, not from the Privacy page) and raised nine Claude settings links to OBSERVED, because the settings picture shows their rows.
- Two pairs are the same frame taken twice and are named as duplicates: IMG_1220 with IMG_1221, and IMG_1285 with IMG_1286.
- IMG_1274 to IMG_1278 are ChatGPT pictures filed among the Claude numbers; they are indexed under ChatGPT with a note.
- On 2026-11-13 the founder had the 229 files in his folder renamed from `IMG_<number>.PNG` to `IMG_<number>_<picture name>.PNG`. The `file` field carries the new name, and `_rename-map.tsv` in that folder lists the camera name each file had.
- Nothing personal from the pictures is recorded, the same rule as the layout files (see `README.md`).

## Screen tree

### ChatGPT

- **New chat home** `chatgpt.home.new-chat` (page): IMG_1133 `keyboard-up`, IMG_1196 `upgrade-pill`, IMG_1208 `account-toast`
  - **Effort slider in place of the composer** `chatgpt.composer.effort-slider` (overlay): IMG_1134 `instant`, IMG_1135 `medium`, IMG_1136 `high`, IMG_1137 `extra-high`, IMG_1138 `pro`
  - **Work tab with usage notice** `chatgpt.work.usage-notice` (page): IMG_1139
  - **Sidebar drawer** `chatgpt.sidebar.drawer` (drawer): IMG_1140 `short-list`, IMG_1141 `long-list`, IMG_1197 `second-account-keyboard-up`
    - **Projects list** `chatgpt.projects.list` (page): IMG_1142
      - **New project sheet** `chatgpt.projects.new-project` (sheet): IMG_1143
        - **Project settings sheet** `chatgpt.projects.project-settings` (sheet): IMG_1144
      - **Project page** `chatgpt.projects.project-page` (page): IMG_1274 `chats-tab`, IMG_1275 `sources-tab`, IMG_1276 `keyboard-up`, IMG_1277 `keyboard-up-caret`
        - **Chat and Work mode menu** `chatgpt.projects.mode-menu` (menu): IMG_1278
    - **Plugins catalogue** `chatgpt.connectors.plugin-catalog` (page): IMG_1145 `top`, IMG_1146 `scrolled`
    - **Reconnect Apple Health prompt** `chatgpt.health.reconnect-prompt` (page): IMG_1147
      - **Health access system sheet** `chatgpt.health.access-sheet` (system): IMG_1148 `top`, IMG_1149 `nutrition-upper`, IMG_1150 `nutrition-middle`, IMG_1151 `nutrition-lower`, IMG_1152 `bottom-buttons`, IMG_1153 `all-on`
        - **Health sharing duration step** `chatgpt.health.share-duration` (system): IMG_1154
    - **Health page** `chatgpt.health.overview` (page): IMG_1155 `home-tab-tooltip`, IMG_1156 `home-tab-activity`, IMG_1157 `home-tab-scrolled`, IMG_1158 `home-tab-scrolled-end`, IMG_1159 `chats-tab`, IMG_1160 `records-tab`, IMG_1161 `accounts-tab`. Also opens from `chatgpt.health.share-duration`
      - **Health overflow menu** `chatgpt.health.overflow-menu` (menu): IMG_1162
      - **Health access continue dialog** `chatgpt.health.access-continue-prompt` (system): IMG_1236
    - **Images page** `chatgpt.library.images` (page): IMG_1163 `templates`, IMG_1164 `trending`
    - **Sites page** `chatgpt.library.sites` (page): IMG_1165 `owned-by-you`, IMG_1166 `shared-with-you`
    - **Customize page** `chatgpt.customize.page` (page): IMG_1167
    - **Space page** `chatgpt.library.space` (page): IMG_1168 `suggested`, IMG_1169 `favorites`, IMG_1170 `images`, IMG_1171 `folders`, IMG_1172 `sites`, IMG_1173 `pages`, IMG_1174 `all`
    - **Scheduled tasks** `chatgpt.tasks.scheduled` (page): IMG_1175 `active`, IMG_1176 `completed`, IMG_1177 `paused`
    - **Chat thread** `chatgpt.chat.thread` (page): IMG_1178 `call-button`, IMG_1181 `after-call`
      - **Voice call full screen** `chatgpt.voice.call-full` (page): IMG_1179
        - **Voice call compact card** `chatgpt.voice.call-compact` (floating-sheet): IMG_1180
    - **Search** `chatgpt.search.page` (page): IMG_1182
    - **Account and settings sheet** `chatgpt.settings.main` (sheet): IMG_1183 `top`, IMG_1184 `middle`, IMG_1185 `bottom`, IMG_1198 `second-account-top`, IMG_1199 `second-account-middle`, IMG_1200 `second-account-bottom`
      - **Personalization settings** `chatgpt.settings.personalization` (page): IMG_1186
      - **Memory settings** `chatgpt.settings.memory` (page): IMG_1187. Also opens from `chatgpt.customize.page`
      - **Plugins settings** `chatgpt.settings.plugins` (page): IMG_1188. Also opens from `chatgpt.customize.page`
      - **Change your email dialog** `chatgpt.account.change-email-dialog` (dialog): IMG_1189
        - **Web sign-in page** `chatgpt.account.web-sign-in` (web): IMG_1190
      - **Switch account sheet** `chatgpt.account.switch-account` (floating-sheet): IMG_1194 `one-account`, IMG_1209 `two-accounts`
        - **Face ID sign-in prompt** `chatgpt.account.face-id-prompt` (sheet): IMG_1195
      - **Upgrade paywall** `chatgpt.billing.paywall` (page): IMG_1201 `plus-tab`, IMG_1202 `go-tab`, IMG_1204 `plus-tab-scrolled`. Also opens from `chatgpt.home.new-chat`, `chatgpt.work.usage-notice`
        - **App Store purchase sheet** `chatgpt.billing.purchase-sheet` (system): IMG_1203
      - **Usage and limits** `chatgpt.billing.usage-and-limits` (page): IMG_1205 `full-remaining`, IMG_1212 `weekly-limit-used`
        - **Buy credits sheet** `chatgpt.billing.buy-credits` (floating-sheet): IMG_1206
      - **Subscription on another platform alert** `chatgpt.billing.subscription-alert` (dialog): IMG_1211
      - **Appearance menu** `chatgpt.settings.appearance-menu` (menu): IMG_1213
      - **Accent color menu** `chatgpt.settings.accent-menu` (menu): IMG_1214
      - **General settings** `chatgpt.settings.general` (page): IMG_1215
      - **Notifications settings** `chatgpt.settings.notifications` (page): IMG_1216
      - **Voice settings** `chatgpt.settings.voice` (page): IMG_1217
      - **Parental controls** `chatgpt.settings.parental-controls` (page): IMG_1218
      - **Trusted contact** `chatgpt.settings.trusted-contact` (page): IMG_1219
      - **Safety settings** `chatgpt.settings.safety` (page): IMG_1220 `toggle-off`, IMG_1221 `toggle-off-duplicate`
      - **Security and login** `chatgpt.settings.security-login` (page): IMG_1222 `top`, IMG_1223 `scrolled-end`
      - **Codex settings** `chatgpt.settings.codex` (page): IMG_1224
      - **Cloud browser settings** `chatgpt.settings.cloud-browser` (page): IMG_1225
      - **Storage settings** `chatgpt.settings.storage` (page): IMG_1226 `large-quota`, IMG_1235 `small-quota-64-percent`
      - **Data controls** `chatgpt.settings.data-controls` (page): IMG_1227 `top`, IMG_1228 `scrolled-end`
      - **Report app issue sheet** `chatgpt.settings.report-issue` (sheet): IMG_1229
      - **In-app browser sheet** `chatgpt.help.in-app-browser` (web): IMG_1230 `help-center-light`, IMG_1234 `terms-dark`. Also opens from `chatgpt.settings.about`
      - **Privacy center** `chatgpt.privacy.center` (page): IMG_1231 `top`, IMG_1232 `scrolled-articles`
      - **About** `chatgpt.settings.about` (page): IMG_1233
    - **Codex area** `chatgpt.code.codex-home` (page): IMG_1191 `cloud-tab`, IMG_1192 `connect-computer-tab`
      - **Codex title menu** `chatgpt.code.codex-menu` (menu): IMG_1193

### Claude

- **New chat home** `claude.home.new-chat` (page): IMG_1237 `resting`, IMG_1247 `keyboard-up`
  - **Add to Chat sheet** `claude.add-menu.add-to-chat` (sheet): IMG_1238 `medium`, IMG_1239 `taller`
  - **Dictation in the composer** `claude.composer.dictation` (overlay): IMG_1240 `transcript-short`, IMG_1241 `transcript-long`
  - **Voice mode** `claude.voice.voice-mode` (page): IMG_1242 `start`, IMG_1243 `reply`, IMG_1244 `reply-scrolled`
    - **Add to Chat sheet in voice mode** `claude.add-menu.voice-add` (sheet): IMG_1245
    - **Voice data consent sheet** `claude.voice.voice-consent` (sheet): IMG_1246
  - **Model picker** `claude.model.model-picker` (sheet): IMG_1248 `medium`, IMG_1249 `taller`
  - **Incognito home** `claude.home.incognito` (page): IMG_1250
  - **Projects tab** `claude.projects.projects-list` (page): IMG_1251
    - **Projects filter menu** `claude.projects.projects-filter` (menu): IMG_1252
    - **Project page** `claude.projects.project-page` (page): IMG_1266
      - **Project Files sheet** `claude.projects.project-files` (sheet): IMG_1267
      - **Project Instructions sheet** `claude.projects.project-instructions` (sheet): IMG_1268
      - **Project Memory sheet** `claude.projects.project-memory` (floating-sheet): IMG_1269
        - **Memory files page** `claude.projects.memory-files` (floating-sheet): IMG_1270
      - **Project New menu** `claude.projects.project-new-menu` (menu): IMG_1271
        - **Project new chat** `claude.home.project-chat` (page): IMG_1272 `resting`, IMG_1273 `keyboard-up`
  - **Code tab** `claude.code.code-list` (page): IMG_1253
    - **Code filter menu** `claude.code.code-filter` (menu): IMG_1254
    - **Scheduled tasks** `claude.code.scheduled-tasks` (page): IMG_1255 `list`, IMG_1262 `empty`
    - **New Code session** `claude.code.new-session` (page): IMG_1257 `keyboard-up`
      - **Auto mode alert** `claude.code.auto-mode-dialog` (dialog): IMG_1256
      - **Add context sheet** `claude.code.add-context` (sheet): IMG_1258
  - **Cowork tab** `claude.work.cowork-list` (page): IMG_1259
    - **Cowork new task** `claude.work.new-task` (page): IMG_1260
      - **Add to project sheet** `claude.work.add-to-project` (sheet): IMG_1261
  - **Artifacts tab** `claude.library.artifacts-list` (page): IMG_1263
    - **Artifacts filter menu** `claude.library.artifacts-filter` (menu): IMG_1264 `top`, IMG_1265 `scrolled`
  - **Settings home** `claude.settings.settings-home` (sheet): IMG_1280
    - **Settings Profile** `claude.account.profile` (sheet): IMG_1281
    - **Settings Billing** `claude.billing.plan` (sheet): IMG_1282
    - **Settings Usage** `claude.billing.usage` (sheet): IMG_1283 `top`, IMG_1284 `scrolled`
    - **Settings Notifications** `claude.settings.notifications` (sheet): IMG_1285 `all-on`, IMG_1286 `all-on-duplicate`
    - **Settings Time and focus** `claude.settings.time-and-focus` (sheet): IMG_1287
    - **Settings Privacy** `claude.privacy.privacy-settings` (sheet): IMG_1288
    - **Settings Shared links** `claude.privacy.shared-links` (sheet): IMG_1289
    - **Settings Capabilities** `claude.settings.capabilities` (sheet): IMG_1290 `top`, IMG_1291 `middle`, IMG_1292 `bottom`
    - **Settings Claude Code** `claude.code.code-settings` (sheet): IMG_1293
      - **Cloud environments list** `claude.code.cloud-environments` (sheet): IMG_1294
        - **New cloud environment form** `claude.code.new-environment` (page): IMG_1295 `top`, IMG_1296 `scrolled`
    - **Settings Connectors** `claude.connectors.connectors-list` (sheet): IMG_1297
      - **Connectors add menu** `claude.connectors.connectors-add-menu` (menu): IMG_1298
    - **Settings Voice** `claude.voice.voice-settings` (sheet): IMG_1299
    - **Browser choice menu** `claude.settings.in-app-browser-menu` (menu): IMG_1300

### Perplexity

- **Signed-out home** `perplexity.home.signed-out` (page): IMG_1301
  - **Sign-in sheet** `perplexity.account.sign-in-sheet` (floating-sheet): IMG_1302
    - **Signed-in home** `perplexity.home.signed-in` (page): IMG_1305 `search-mode`, IMG_1307 `computer-keyboard-digits-faint`, IMG_1308 `computer-keyboard-digits-strong`, IMG_1309 `computer-mode`
      - **Upgrade paywall** `perplexity.billing.paywall` (page): IMG_1303 `pro-tab`, IMG_1304 `max-tab`. Also opens from `perplexity.home.mode-explainer`
      - **Models sheet** `perplexity.model.models-sheet` (floating-sheet): IMG_1306
      - **Mode explainer dialog** `perplexity.home.mode-explainer` (dialog): IMG_1310
      - **Sidebar page** `perplexity.sidebar.history` (page): IMG_1311
        - **Settings** `perplexity.settings.main` (page): IMG_1312 `top`, IMG_1313 `scrolled`, IMG_1314 `bottom`
          - **Account details** `perplexity.account.details` (page): IMG_1315
          - **Notifications settings** `perplexity.settings.notifications` (page): IMG_1316
          - **Incognito sheet** `perplexity.privacy.incognito-sheet` (sheet): IMG_1318
          - **Connectors list** `perplexity.connectors.list` (page): IMG_1319
          - **Preferences** `perplexity.settings.preferences` (page): IMG_1320
            - **Map provider** `perplexity.settings.map-provider` (page): IMG_1321
            - **Image generation model** `perplexity.settings.image-model` (page): IMG_1322
            - **Language settings** `perplexity.settings.language` (page): IMG_1323
            - **Dictation settings** `perplexity.settings.dictation` (page): IMG_1324
            - **Voice settings** `perplexity.settings.voice` (page): IMG_1325
            - **Read aloud settings** `perplexity.settings.read-aloud` (page): IMG_1326
          - **Personalize** `perplexity.settings.personalize` (page): IMG_1327
          - **Two-factor authentication setup** `perplexity.settings.two-factor` (page): IMG_1328
          - **Account switcher popover** `perplexity.account.account-switcher` (menu): IMG_1329

### Gemini

- **First-run welcome** `gemini.onboarding.welcome` (page): IMG_1330
  - **Home, new chat** `gemini.home.new-chat` (page): IMG_1331 `plain`, IMG_1332 `promo-chip`
    - **Gemini Live voice screen** `gemini.voice.live` (page): IMG_1333 `first-reply`, IMG_1334 `listening`, IMG_1335 `green-reply`, IMG_1336 `tap-to-interrupt`
      - **Chat transcript** `gemini.chat.transcript` (page): IMG_1337
        - **Composer recording a voice message** `gemini.composer.recording` (overlay): IMG_1338. Also opens from `gemini.home.new-chat`
    - **Plus menu sheet** `gemini.add-menu.plus-sheet` (sheet): IMG_1339 `low-detent`, IMG_1340 `tall-detent`, IMG_1341 `rotated`, IMG_1342 `tiles-scrolled`
      - **Create images intro sheet** `gemini.add-menu.create-images-sheet` (sheet): IMG_1348
        - **Create images page** `gemini.home.create-images` (page): IMG_1349
    - **Account sheet** `gemini.account.account-sheet` (sheet): IMG_1343 `rotated`, IMG_1344 `settled`
      - **Settings sheet** `gemini.settings.settings-sheet` (sheet): IMG_1354. Also opens from `gemini.sidebar.menu`
        - **Usage limits** `gemini.settings.usage-limits` (page): IMG_1355
        - **Notifications settings** `gemini.settings.notifications` (page): IMG_1356
        - **Personal Intelligence** `gemini.settings.personal-intelligence` (page): IMG_1357
        - **Your avatar** `gemini.settings.avatar` (page): IMG_1358
        - **Task page** `gemini.settings.task-page` (page): IMG_1360
          - **Task intro card** `gemini.settings.task-intro-card` (floating-sheet): IMG_1359
        - **Theme popup** `gemini.settings.theme-menu` (menu): IMG_1361
        - **Voice settings** `gemini.settings.voice` (page): IMG_1362
        - **Media settings** `gemini.settings.media` (page): IMG_1363
        - **Shopping cart** `gemini.settings.shopping-cart` (page): IMG_1364
        - **Gemini Apps Activity web page** `gemini.privacy.apps-activity` (web): IMG_1365
    - **Model menu** `gemini.model.model-menu` (menu): IMG_1345
    - **Full-screen sidebar** `gemini.sidebar.menu` (page): IMG_1347. Also opens from `gemini.library.library`
      - **Library page** `gemini.library.library` (page): IMG_1346
      - **Scheduled page** `gemini.tasks.scheduled` (page): IMG_1350
      - **Customize, Discover tab** `gemini.customize.discover` (page): IMG_1351
      - **Upgrade to create videos sheet** `gemini.billing.upgrade-videos-sheet` (sheet): IMG_1352. Also opens from `gemini.library.library`
      - **Gems page** `gemini.customize.gems` (page): IMG_1353
