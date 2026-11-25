---
id: "REQ-AREA-022"
type: "requirements"
title: "Requirement items: Rich answers and structured result widgets"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 22. Rich answers and structured result widgets

38 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S22.01

**Citation chips.** Answers grounded in sources show citation chips that identify and open the source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F022-01 Citations and source previews](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Competitor trace: CAP-rich-content-rendering-17

## S22.02

**Source-preview cards.** Hovering/tapping a citation shows a preview card (title, site, snippet/date) before opening it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F022-01 Citations and source previews](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Competitor trace: CAP-rich-content-rendering-17

## S22.03

**Search-result lists.** Web-search results are listed (title, site, link, optional snippet) and can be opened.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F022-01 Citations and source previews](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Competitor trace: CAP-rich-content-rendering-17

## S22.04

**News cards.** News results render as dedicated news cards (headline, outlet, date, image).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-02 Media results (news, images, video, audio)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.05

**Image carousels.** Image results render in a swipeable/pageable carousel within the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-02 Media results (news, images, video, audio)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Competitor trace: CAP-rich-content-rendering-18

## S22.06

**Video result cards.** Video results render as cards with thumbnail, title, duration and play/open.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-02 Media results (news, images, video, audio)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)

## S22.07

**Audio players.** Audio in an answer (generated speech/music, audio results) plays in an inline audio player.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-02 Media results (news, images, video, audio)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)

## S22.08

**Interactive charts.** Charts in answers render interactively (hover/tap values, legend).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-03 Charts and chart data](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Competitor trace: CAP-rich-content-rendering-14, CAP-rich-content-rendering-25

## S22.09

**Inspectable chart data.** The data behind a chart can be inspected (values on hover, source table/JSON view or download).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-03 Charts and chart data](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Competitor trace: CAP-rich-content-rendering-14

## S22.10

**Geographic maps.** Location answers render an interactive map with markers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile unverified, CLI missing, VS Code missing, Chrome done
- Feature: [F022-04 Maps and places](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.11

**Place and business cards.** Place/business results render as cards (name, rating, address, hours, links).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-04 Maps and places](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.12

**Weather cards.** Weather answers render as a weather card (conditions, temperature, forecast).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-05 Live information cards (weather, sports, markets, company, flights, packages)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.13

**Sports schedules.** Sports schedule answers render as a schedule widget.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-05 Live information cards (weather, sports, markets, company, flights, packages)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.14

**Sports scores and standings.** Sports scores/standings render as a scoreboard or standings table widget.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-05 Live information cards (weather, sports, markets, company, flights, packages)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.15

**Market-price charts.** Stock/market price answers render a price chart widget.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-05 Live information cards (weather, sports, markets, company, flights, packages)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.16

**Company and financial-summary cards.** Company/financial answers render a summary card (key figures, ticker).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-05 Live information cards (weather, sports, markets, company, flights, packages)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.17

**Product comparison cards.** Product comparisons render as side-by-side comparison cards.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-06 Shopping, travel and booking](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.18

**Price and availability displays.** Shopping answers show price and availability (in stock, sellers) in a structured display.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-06 Shopping, travel and booking](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.19

**Travel itinerary cards.** Trip plans render as a structured itinerary card (days, stops, times).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-06 Shopping, travel and booking](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.20

**Flight-status cards.** Flight status answers render a flight-status card (times, gate, status).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-05 Live information cards (weather, sports, markets, company, flights, packages)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.21

**Package-tracking cards.** Package-tracking answers render a tracking card (carrier, status, ETA).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-05 Live information cards (weather, sports, markets, company, flights, packages)](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.22

**Reservation choices.** Booking answers offer selectable reservation choices (times/tables/rooms).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-06 Shopping, travel and booking](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.23

**Calendar availability grids.** Scheduling answers render a calendar availability grid to pick slots.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-06 Shopping, travel and booking](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.24

**Contact cards.** Person/contact answers render a contact card (name, role, email/phone actions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-07 Drafts, contacts and tasks](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.25

**Email draft widgets.** An email draft renders as an email widget (to, subject, body) with copy/send/open actions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-07 Drafts, contacts and tasks](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Competitor trace: CAP-rich-content-rendering-21

## S22.26

**Message draft widgets.** A chat/SMS/Slack message draft renders as a message widget with copy/send.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-07 Drafts, contacts and tasks](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Competitor trace: CAP-rich-content-rendering-20, CAP-rich-content-rendering-21

## S22.27

**Task and issue cards.** Tasks/issues (e.g. Linear, GitHub, Jira) render as task/issue cards with status and link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-07 Drafts, contacts and tasks](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Competitor trace: CAP-rich-content-rendering-20

## S22.28

**Approval forms.** Actions needing consent render an approval form (what will happen, approve/deny).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F022-08 Approvals and questions](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Competitor trace: CAP-rich-content-rendering-15

## S22.29

**Interactive questionnaires.** The assistant can ask structured questions (options/fields) the user answers in an inline form.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F022-08 Approvals and questions](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Competitor trace: CAP-rich-content-rendering-15

## S22.30

**Decision/comparison tables.** Decision/comparison answers render as a readable comparison table.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F022-09 Tables, diagrams and mind maps](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Competitor trace: CAP-rich-content-rendering-04

## S22.31

**Mind maps.** Mind-map answers render as a drawn mind map.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-09 Tables, diagrams and mind maps](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Competitor trace: CAP-rich-content-rendering-11

## S22.32

**Flowcharts.** Flowchart answers render as a drawn flowchart diagram.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-09 Tables, diagrams and mind maps](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Competitor trace: CAP-rich-content-rendering-11

## S22.33

**Timelines.** Timeline answers render as a drawn timeline.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-09 Tables, diagrams and mind maps](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Competitor trace: CAP-rich-content-rendering-11

## S22.34

**Flashcards.** Study answers can render as flip-style flashcards in the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-10 Study cards and quizzes](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Competitor trace: CAP-rich-content-rendering-24

## S22.35

**Quizzes.** Quiz answers render as an interactive quiz with answer checking.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-10 Study cards and quizzes](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Competitor trace: CAP-rich-content-rendering-24

## S22.36

**Interactive demonstrations.** Interactive demonstrations (HTML/JS/React) run live and interactively inside the answer or panel.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-11 Live previews and embedded apps](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Competitor trace: CAP-rich-content-rendering-12

## S22.37

**Embedded third-party app panels.** Third-party apps (e.g. MCP apps) render as embedded interactive panels inside the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-11 Live previews and embedded apps](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Competitor trace: CAP-rich-content-rendering-22

## S22.38

**Generated application previews.** Generated apps/sites render as a live preview that can be opened or expanded.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F022-11 Live previews and embedded apps](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Competitor trace: CAP-rich-content-rendering-12
