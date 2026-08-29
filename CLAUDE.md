# CLAUDE.md

This repository contains a production wastewater treatment sales wizard.
Use this file as the shared operating guide when working with Claude Code.

## Important Context

- The app is already used in real sales work.
- The main implementation is `index.html`.
- The product goal is reliability and clear sales output, not broad refactoring.
- Japanese UI text is business-facing and should be changed only intentionally.

## Workflow

1. Start from the latest `dev` branch for normal feature/fix work unless the user says otherwise.
2. Create a topic branch:
   - `feature/<short-name>` for new features.
   - `fix/<short-name>` for bug fixes.
   - `chore/<short-name>` for maintenance.
   - `docs/<short-name>` for documentation.
   - `codex/<short-name>` is reserved for Codex-led environment or maintenance work.
3. Implement the smallest useful change.
4. Run `npm test`.
5. For UI changes, run the app with `npm run dev` and verify desktop, mobile, draft restore, result generation, and print/PDF output.
6. Push the branch and open a PR for review.
7. Merge to `dev` first. Promote `dev` to `main` only after review and smoke testing.

## Guardrails

- Do not directly edit `main` for feature work.
- Do not remove existing fields from the hearing sheet without explicit approval.
- Do not change calculation behavior without documenting the scenario tested.
- Do not replace the single-file static architecture unless the user asks for a broader migration.
- Keep generated output safe by escaping user input before assigning to `innerHTML`.
- Treat `localStorage` as sensitive because it can contain customer information.

## Suggested Review Prompt

When asking an AI agent to review a branch, include:

```text
Review this branch as a production sales tool. Prioritize incorrect output,
data loss, mobile/PDF regressions, and missing tests. Do not focus on style-only
issues unless they affect maintainability or field use.
```
