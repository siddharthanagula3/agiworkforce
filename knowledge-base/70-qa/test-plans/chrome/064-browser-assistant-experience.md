---
id: "PLAN-chrome-064"
type: "test-plan"
title: "Chrome · 64. Browser-assistant experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "64"
---
# Chrome · 64. Browser-assistant experience

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S64.01 Current-page context.

- **Expected:** The assistant reads the page open in the user's browser and answers with it as context.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:6544; apps/extension/src/side_panel.ts:10565; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:461
- **Where to find it:** Chat tab > + (Add attachment) > Add the browser page (labels found in the code)
- **Needs:** a normal website tab open
- **Steps:**
  1. Open a normal website in a tab and open the side panel (toolbar AGI icon).
  2. In the Chat tab, click the + button labelled Add attachment, then click Add the browser page.
  3. Type a question that depends on the page, such as what the page says about a named topic, and send it.
  4. Check the answer uses the content of the open page, and that the page chip shows the site's host.

## S64.02 Selected-text context.

- **Expected:** Text the user highlights on a web page reaches the assistant as context for a question.
- **Code:** done. Evidence moved: apps/extension/src/background.ts:7455; apps/extension/src/background.ts:7608; apps/extension/src/side_panel.ts:10950 (quoted code not found in the file now)
- **Where to find it:** Chat tab > + (Add attachment) > Add selected text (labels found in the code)
- **Needs:** a normal website and the site approved in Extension settings
- **Steps:**
  1. On a normal website, highlight a sentence or paragraph with the mouse.
  2. Open the side panel and click the + button labelled Add attachment.
  3. Click Add selected text, then type a question about the highlighted text and send it.
  4. Check the answer refers to the highlighted text.

## S64.05 Page summary.

- **Expected:** One action summarizes the page the user is viewing.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6869 (quoted code not found in the file now); apps/extension/src/side_panel.ts:4556 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10565
- **Where to find it:** Right-click page background > Summarize this page (labels found in the code)
- **Needs:** a normal website tab
- **Steps:**
  1. Open a normal website and right-click an empty part of the page (not a link, image or text).
  2. Click Summarize this page in the menu.
  3. The side panel opens with the page attached; wait for the reply.
  4. Check the reply summarizes the page that is open in the tab.

## S64.06 Question about page.

- **Expected:** The user asks a free-form question and the answer uses the current page's content.
- **Code:** done. Evidence present: apps/extension/src/features/content/in-page-panel/panel.ts:565; apps/extension/src/side_panel.ts:6544; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:461
- **Where to find it:** Website tab > Ask AGI launcher (round button at the edge of the page) > text box 'Ask one question about this page…' (labels found in the code)
- **Needs:** an approved website and the Page assistant overlay setting on
- **Steps:**
  1. Open a website that you have approved for AGI, and make sure the side panel is closed (the launcher hides while it is open).
  2. Click the round Ask AGI launcher button on the page.
  3. Type a question about the page into the box labelled Ask one question about this page… and press Enter.
  4. Check the streamed answer uses the visible text of this page.

## S64.07 Question about video/transcript.

- **Expected:** The assistant answers questions about a video on the page using its transcript.
- **Code:** done. Evidence present: apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:290; apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:164; apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:270; apps/extension/src/features/content/in-page-panel/panel.ts:537; apps/extension/src/features/content/in-page-panel/panel.ts:518
- **Where to find it:** YouTube watch page > Ask AGI launcher > Summarize video, Key timestamps or Q&A (labels found in the code)
- **Needs:** a YouTube video with captions
- **Steps:**
  1. Open a YouTube video that has captions, on an approved site.
  2. Click the Ask AGI launcher on the page.
  3. Click the chip Summarize video (or Key timestamps, or Q&A).
  4. Wait for 'Reading the video captions…', then check the answer is about what is said in the video.

## S64.08 Browser side conversation.

- **Expected:** A chat sits beside the page in the browser and keeps its own conversation while the user browses.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:4802 (quoted code not found in the file now); apps/extension/manifest.json:84; apps/extension/src/side_panel.ts:6861 (quoted code not found in the file now)
- **Where to find it:** Toolbar AGI icon (or Open AGI side panel shortcut) > Chat tab (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Open the side panel with the toolbar AGI icon, or the shortcut Command+Shift+K on Mac.
  2. In the Chat tab, ask a question and wait for the answer.
  3. Switch to a different website tab and come back to the side panel.
  4. Check the same conversation is still shown, then click New chat and check a new empty conversation starts.

## S64.10 Open URL.

- **Expected:** The assistant opens a web address in the browser for the user.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1597; apps/extension/src/side_panel.ts:14042; apps/extension/src/features/computer-use/agentLoop.ts:871
- **Where to find it:** Computer Use tab > Task > Start (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site
- **Steps:**
  1. Open a normal website tab and open the side panel, then click the Computer Use tab.
  2. If the panel asks, click the Allow browser control button for the site.
  3. Type in the Task box a goal such as 'Open https://example.com' and click Start.
  4. Check the tab goes to that address and the Assistant steps list shows the opening step.

## S64.14 Website search.

- **Expected:** The assistant runs a search on a website and reads the results back.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1597; apps/extension/src/side_panel.ts:13949; apps/extension/src/background.ts:6700
- **Where to find it:** Computer Use tab > Task > Start (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site
- **Steps:**
  1. Open a website that has its own search box and open the Computer Use tab.
  2. In the Task box type a goal such as 'Search this site for a term and read me the first three results', then click Start.
  3. Watch the Assistant steps list as the search is typed and submitted.
  4. Check the reply reads back the results shown on the page.

## S64.15 Form filling.

- **Expected:** The assistant fills in a web form on the user's behalf.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14042; apps/extension/src/background.ts:6700
- **Where to find it:** Computer Use tab > Run Autofill (job application pages), or Computer Use tab > Task > Start (other forms) (labels found in the code)
- **Needs:** a web form and a signed-in AGI account
- **Steps:**
  1. Open a job application form on an approved site (Greenhouse, Lever or Ashby for Run Autofill).
  2. Open the Computer Use tab and click Run Autofill.
  3. For another form, type in the Task box a goal such as 'Fill the name and email fields with the details I give you' and click Start.
  4. Check the fields show the values that were asked for, and that password and payment fields were left alone.

## S64.16 Multi-step website task.

- **Expected:** The user gives a goal and the assistant carries it out over several steps on websites.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1655; apps/extension/src/side_panel.ts:13949
- **Where to find it:** Computer Use tab > Task > Start (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site
- **Steps:**
  1. Open a website with several linked pages and open the Computer Use tab.
  2. In the Task box type a goal with several steps, such as 'Find the contact phone number on this site, then open the pricing page and read the first price', and click Start.
  3. Watch the Steps counter (Steps: n/max) and the Assistant steps list climb over several actions.
  4. Check the run ends with an 'Agent finished' entry and the answer covers both parts of the goal.

## S64.17 Structured site-tool invocation.

- **Expected:** The assistant calls tools a website declares (e.g. WebMCP) instead of clicking through the page.
- **Code:** done. Evidence moved: apps/extension/src/background.ts:1379 (quoted code not found in the file now); apps/extension/src/background.ts:4271 (quoted code not found in the file now); apps/extension/src/features/computer-use/agentLoop.ts:525 (quoted code not found in the file now)
- **Where to find it:** Computer Use tab > Task > Start, on a website that declares its own tools (labels found in the code)
- **Needs:** a website that declares WebMCP tools
- **Steps:**
  1. Open a website that publishes WebMCP tools (none is named in the code, so find one first).
  2. In the Computer Use tab type a task the site's tool can do, and click Start.
  3. Check Assistant steps shows a call to the site's tool rather than only clicks.
  4. For a tool that changes data, check the page shows a confirmation dialog that must be accepted before the call runs.

## S64.18 Visible action timeline.

- **Expected:** Each browser action the assistant takes is listed for the user as it happens.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14042; apps/extension/src/features/side-panel/computerUsePanel.ts:1932
- **Where to find it:** Computer Use tab > Assistant steps (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site
- **Steps:**
  1. Start any Computer Use task (see Task and Start).
  2. While it runs, click the Assistant steps toggle to open the list.
  3. Watch each action appear as it happens, with its time.
  4. Check the list matches the actions the tab takes, and the last entry is the final report.

## S64.19 Live browser preview.

- **Expected:** The user can watch the browser the assistant is driving while it works.
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/agentLoop.ts:179; apps/extension/src/features/side-panel/computerUsePanel.ts:1837
- **Where to find it:** Computer Use tab > Assistant steps > Screenshot captured (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site
- **Steps:**
  1. Start a Computer Use task and open Assistant steps.
  2. Watch the browser tab itself, which is the task's visible page.
  3. When an entry titled 'Screenshot captured' appears, click its thumbnail to view it larger.
  4. Check the thumbnail shows the current state of the page.

## S64.20 Active-tab indicator.

- **Expected:** A visible marker shows which tab the assistant is working in.
- **Code:** done. Evidence moved: apps/extension/src/background.ts:1426 (quoted code not found in the file now); apps/extension/src/background.ts:6794; apps/extension/src/content.ts:1846 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. A tab already in a Chrome tab group is not regrouped (apps/extension/src/background.ts markComputerUseTab). The right-click item Add Tab to AGI Group is a separate manual control.
- **Steps:**
  1. Open a normal website tab that is not already in a Chrome tab group.
  2. Start a Computer Use task on that tab (Computer Use tab > Task > Start).
  3. Look at the Chrome tab strip for a blue group titled AGI around that tab.
  4. After the run ends, check the tab has left the group.

## S64.21 Login handoff.

- **Expected:** When a site needs the user to sign in, the assistant pauses, lets them sign in, then continues.
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/agentLoop.ts:1129; apps/extension/src/features/computer-use/agentLoop.ts:1476; apps/extension/src/background.ts:1066; apps/extension/src/features/side-panel/computerUsePanel.ts:1322
- **Where to find it:** Computer Use tab > Task > Start, on a site that asks you to sign in during the task (labels found in the code)
- **Needs:** a site that asks you to sign in during a task, a signed-in AGI account, an approved site
- **Steps:**
  1. Start a Computer Use task on a site that needs you to sign in (for example a site with a login page).
  2. Wait for the banner titled 'Your turn' to appear.
  3. Click Take over, sign in on the page, then click Continue.
  4. Check AGI carries on with the task after Continue and the run reaches Agent finished.

## S64.22 Human verification handoff.

- **Expected:** When a site shows a CAPTCHA or human check, the assistant hands it to the user and resumes after.
- **Code:** done. Evidence moved: apps/extension/src/features/computer-use/agentLoop.ts:1129; apps/extension/src/background.ts:4480 (quoted code not found in the file now)
- **Where to find it:** Computer Use tab > Task > Start, on a page that shows a CAPTCHA or human check (labels found in the code)
- **Needs:** a page that shows a CAPTCHA or human check, a signed-in AGI account, an approved site
- **Steps:**
  1. Start a Computer Use task on a page that shows a CAPTCHA or 'I am not a robot' check.
  2. Wait for the banner titled 'Your turn' to appear.
  3. Click Take over, solve the check on the page, then click Continue.
  4. Check AGI resumes the task after Continue.

## S64.25 Pause/stop.

- **Expected:** The user can pause or stop the assistant's browser task at any moment.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:1224; apps/extension/src/features/side-panel/computerUsePanel.ts:1337; apps/extension/src/background.ts:4480 (quoted code not found in the file now)
- **Where to find it:** Computer Use tab > Stop (shown while a run is active), or Take over (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site
- **Steps:**
  1. Start a Computer Use task that takes several actions.
  2. While it runs, click Stop, or click Take over to pause AGI.
  3. Check the Stop control changes to Stopping… and the run ends.
  4. Check a banner titled 'Browser control stopped' appears and no more actions happen on the page.

## S64.26 Download review.

- **Expected:** Files the assistant downloads are approved and listed so the user can review them.
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/approvalPolicy.ts:358; apps/extension/src/features/computer-use/agentLoop.ts:939; apps/extension/src/side_panel.ts:14042
- **Where to find it:** Computer Use tab > Task > Start, on a page that offers a file to download (labels found in the code)
- **Needs:** a page that offers a file to download
- **Steps:**
  1. Start a Computer Use task that downloads a file from a page.
  2. Before the download, check an approval card appears titled 'Approve action: download_file'.
  3. Read the card, then click Allow or Skip.
  4. Check the step 'Download: <address>' is listed in Assistant steps.

## S64.27 Upload review.

- **Expected:** Before the assistant uploads a file to a website the user reviews and approves it.
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/approvalPolicy.ts:359; apps/extension/src/side_panel.ts:14042
- **Where to find it:** Computer Use tab > Task > Start, on a page with a file upload control (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Have a small file ready on the computer.
  2. Start a Computer Use task that needs to upload that file to a page.
  3. When the card 'Approve file upload' appears, click Choose files to upload and pick the file. Check the preview lists it and nothing has been sent yet.
  4. Click Allow to send it, or Skip, and check the result shown in Assistant steps.

## S64.28 Website permission controls.

- **Expected:** The user decides which websites the assistant may read or act on.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7640 (quoted code not found in the file now); apps/extension/src/features/options/site-permission-policy.ts:236 (quoted code not found in the file now); apps/extension/src/features/site-policy/store.ts:27
- **Where to find it:** More > Extension settings > Permissions (labels found in the code)
- **Needs:** a normal website tab to test with
- **Steps:**
  1. Click More in the side panel, then Extension settings.
  2. Click Permissions and find the Browser access section and the Browser control choice (Auto, Ask first, Full access, YOLO).
  3. Open a normal website, then reopen Options and use Add or Remove for the current site in the approved sites list.
  4. Under Blocked sites click Block for a site, then check that site is removed from approved sites and AGI no longer reads it.

## S64.32 Browser-task result summary.

- **Expected:** When a browser task ends the assistant reports what it did and what still needs the user.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1932; apps/extension/src/side_panel.ts:14042
- **Where to find it:** Computer Use tab > Assistant steps > Agent finished (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site
- **Steps:**
  1. Run a short Computer Use task and wait for it to finish.
  2. Open Assistant steps and look at the last entry titled 'Agent finished'.
  3. Check its text lists what was done and the result.
  4. Open the Chat tab and check it shows 'The browser task finished.' followed by the report.
