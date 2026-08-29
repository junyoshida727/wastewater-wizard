# AGENTS.md

This repository is a production sales tool for wastewater treatment equipment.
Treat changes as customer-facing unless the user explicitly says otherwise.

## Project Shape

- The app is currently a single static HTML application in `index.html`.
- It is used as a wizard-style sales hearing sheet and PDF/print output tool.
- The most important flows are: draft restore, form navigation, pump/sensor calculations, flow diagram generation, missing-input check, and print/PDF output.

## Development Rules

- Do not commit directly to `main`.
- Use a topic branch for every change.
- Prefer branch names such as `feature/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `docs/<short-name>`, or `codex/<short-name>`.
- Keep edits small and reviewable. This app is already in field use.
- Preserve existing Japanese UI wording unless the user asks for copy changes.
- Escape user-provided values before rendering them through `innerHTML`.
- Be careful with `localStorage` changes because customer/site information is stored locally in the browser.
- Do not introduce build requirements for production unless the deployment plan is updated too. The app should remain deployable as static files.

## Required Checks

Before proposing a merge or push, run:

```bash
npm test
```

For UI changes, also run the app and manually check:

- Desktop wizard flow from STEP 1 to result page.
- Mobile layout around navigation buttons and dynamic tables.
- Draft save/resume behavior.
- PDF/print output.
- At least one scenario with chemical pump calculation.

## Review Focus

Reviewers should prioritize:

- Incorrect hearing-sheet output or PDF output.
- Data loss during draft restore or reset.
- Calculation errors for pumps, sensors, or generated flow diagrams.
- Regressions on iOS Safari/mobile layout.
- Mismatch between README, workflows, and actual deployment behavior.
