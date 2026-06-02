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
