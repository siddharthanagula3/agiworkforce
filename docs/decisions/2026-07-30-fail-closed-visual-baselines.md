# Keep Visual Baselines Reviewed and Fail Closed

Status: Accepted

Date: 2026-07-30

Owners: Desktop and release infrastructure

## Context

The former Desktop visual-regression suite treated a missing image as a request
to create a new baseline. That let a first CI run approve its own output
instead of detecting a regression. Its target pages also depended on stale
shell selectors and no workflow invoked the project. Separate Desktop and Web
visual-verification specs only overwrote documentation screenshots; they never
compared an observed image with an accepted image.

The unauthenticated Desktop cloud-web entry surface is reachable in the
deterministic browser test target without user credentials or a native runtime.
It is therefore the honest first pixel-level release gate.

## Decision

Visual baselines are reviewed repository artifacts, not incidental test output.
A normal run must fail when its baseline is absent. Baseline creation or
replacement requires the explicit local `UPDATE_VISUAL_BASELINES=1` opt-in and
the resulting PNG must be reviewed before commit.

The blocking Desktop Playwright lane compares the rendered cloud sign-in page
at a fixed 1440 by 900 viewport, unit device scale, light color scheme, reduced
motion, loaded fonts, and hidden caret. It fails when image dimensions change
or more than three percent of pixels differ, and attaches a diff image on
failure. CI invokes this project directly.

Capture-only specs that overwrite unreviewed screenshots are removed. Future
pixel baselines may be added only for deterministic, reachable surfaces and
must follow the same fail-closed update contract.

## Consequences

CI can no longer silently bless a missing baseline. The repository owns one
small, reviewable source of visual truth and Playwright output remains
ephemeral. Broader signed-in coverage is still desirable, but it must first
provide deterministic state setup rather than restoring stale capture jobs.
