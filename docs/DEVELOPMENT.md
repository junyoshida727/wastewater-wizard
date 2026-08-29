# Development Workflow

This app is a production sales tool. Development should favor predictable,
reviewable changes over fast direct edits.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production branch for GitHub Pages deployment. |
| `dev` | Integration branch for reviewed changes before production. |
| `feature/*` | New functionality. |
| `fix/*` | Bug fixes. |
| `chore/*` | Tooling, CI, dependency, or repository maintenance. |
| `docs/*` | Documentation-only updates. |
| `codex/*` | Codex-led setup or maintenance branches. |

## Standard Flow

1. Update local refs.

   ```bash
   git fetch origin --prune
   ```

2. Start from `dev` for normal work.

   ```bash
   git switch dev
   git merge --ff-only origin/dev
   git switch -c fix/example-bug
   ```

3. Make a focused change.
4. Run tests.

   ```bash
   npm test
   ```

5. Run manual smoke checks for UI changes.
6. Push the branch and open a PR into `dev`.
7. After review and smoke testing, merge `dev` into `main` for production.

## Production Safety

- Avoid direct pushes to `main`.
- Keep each PR small enough to review carefully.
- Include before/after notes for changes to calculations, result tables, flow diagrams, or PDF output.
- Add or update tests when changing shared behavior.
- Update `CHANGELOG.md` for user-visible changes.

## Manual Smoke Checklist

- STEP 1 to STEP 5 navigation works.
- Result page is generated.
- Missing-input check is accurate.
- Chemical pump count updates when chemicals or powder feeder options change.
- Sensor count updates when level sensors or "other" count change.
- Draft save and resume preserve all entered values.
- Initial reset clears dynamic sections and stored draft data.
- Print/PDF output contains the customer name, key inputs, flow diagram, and notes.
- Mobile width around 390px remains usable.
