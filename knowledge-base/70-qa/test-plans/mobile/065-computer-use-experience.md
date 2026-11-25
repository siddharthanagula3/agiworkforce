---
id: "PLAN-mobile-065"
type: "test-plan"
title: "Mobile · 65. Computer-use experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "65"
---
# Mobile · 65. Computer-use experience

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S65.27 Device-offline state.

- **Expected:** When the target computer is offline the product says so and waits or stops clearly.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/StatusBanners.tsx:42 (quoted code not found in the file now)
- **Where to find it:** Settings > Remote control > Connections (the computer status shows at the top of that screen; the status line reads "Offline" and the banner reads "Desktop unreachable") (labels found in the code)
- **Needs:** a computer already paired with AGI Desktop, and access to that computer to stop it
- **Steps:**
  1. Sign in, open the side menu and tap Settings.
  2. Tap Remote control, then tap Connections.
  3. Make the paired computer unreachable (for example, quit AGI Desktop on it or turn its network off) and wait about 90 seconds.
  4. Look for the red "Desktop unreachable" banner with "Reconnecting automatically." and the Reconnect button, or the "Offline" status line with "Make sure ... is running on this computer." Compare with Expected: the app should say the computer is offline and either wait or stop clearly.

## S65.29 Remote access to a permitted local computer.

- **Expected:** From another device the user directs work on their own permitted computer.
- **Code:** partial. Evidence present: services/signaling-server/src/control-payload.ts:1
- **Known to be unfinished:** live check: phone Dispatch to Electron after the signaling server redeploy (dispatch.task.* and dispatch.task.reply in the relay allowlist).
- **Where to find it:** Settings > Remote control > Connections, then the "Start on Desktop" card on the Remote screen (open once a computer is connected) (labels found in the code)
- **Needs:** a paid account that includes remote control (the app checks the remote_control plan capability), a computer paired with AGI Desktop that you own, and that computer turned on and connected
- **Steps:**
  1. Sign in, open the side menu and tap Settings.
  2. Tap Remote control, then tap Connections. If no computer is paired, tap "Pair a computer" and scan the QR code shown by AGI Desktop on the other computer.
  3. With the computer connected, find the "Start on Desktop" card and type a short task in the box "What should Desktop work on?".
  4. Tap Send (accessibility label "Send task to Desktop"). Look for the task under "Recent Dispatch tasks" and check whether the other computer starts working on it and replies. Compare with Expected: the user directs work on their own permitted computer from this phone.
