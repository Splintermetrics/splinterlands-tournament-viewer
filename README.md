# Splinterlands Tournament Viewer

A stream-friendly web app for viewing Splinterlands tournaments with clean bracket displays and reveal controls for live commentary.

## Features

- Refresh upcoming, in-progress, and completed tournaments from the Splinterlands API.
- Filter tournaments by completion state and format.
- Show Swiss rounds as match boards.
- Show single-elimination tournaments as a full bracket, with future rounds positioned in the correct bracket slots.
- Reveal names, scores, winners, and battle links separately.
- Hide battle links until scores are revealed.
- Stream clean mode with an exit button.

## GitHub Pages

This repo includes a GitHub Pages deployment workflow at `.github/workflows/deploy-pages.yml`.

To deploy:

1. Open repository Settings.
2. Go to Pages.
3. Set Build and deployment source to GitHub Actions.
4. Push to `main` or run the workflow manually.

## Entrant Review

Use **Entrant Check** to open the review dialog in the pop-out controls window. The broadcast window never receives review findings or notes.

- **Authorities only** compares entrants' public Hive owner, active and posting authorities. It records signature thresholds and distinguishes posting connections from stronger control connections.
- **Authorities + HIVE/HBD transfers** adds a 30- or 90-day history scan. Repeated transfers require at least three operations across two different UTC dates. Shared funding and shared recipients are shown separately.
- Edit **Ignore service accounts** to exclude known exchanges, sponsors, guild treasuries and other shared services. The default list is a starting point, not an exhaustive service directory.
- Financial checks cover HIVE/HBD transfers only. DEC, SPS, card transfers and delegations are not checked in this version.
- Each account history is bounded to five pages of up to 1,000 operations. Missing accounts, API failures, cancellation and truncated history are reported as incomplete.
- Connections are evidence for host review, not proof of ownership. No connections found does not establish separate ownership; connected pairs are never automatically grouped as one owner.
- Host decisions and notes are saved in this browser's local storage. Scan results remain in memory until the controls window reloads. **Export Report** downloads the findings, coverage and review notes as JSON.

No login or private keys are required. Public account authorities and history are read using the [Hive APIs](https://developers.hive.io/apidefinitions/condenser-api.html).

## Checks

Run `node entrant-check.test.cjs` and `node entrant-check.integration.test.cjs`. The Pages workflow runs both suites before uploading the site. Integration checks use mocked browser controls and API responses; they do not replace live browser and API testing.
