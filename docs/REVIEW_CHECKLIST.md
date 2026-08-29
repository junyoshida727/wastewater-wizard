# Review Checklist

Use this checklist for PR reviews by humans, Codex, or Claude Code.

## Correctness

- Does the generated hearing sheet match the selected inputs?
- Are pump counts, sensor counts, and flow diagram nodes recalculated after every relevant input change?
- Does draft restore preserve dynamic fields such as wastewater type, chemicals, sensors, dehydrator details, and extra pumps?
- Does reset clear both visible UI and stored state?

## Field Use

- Could this change cause a salesperson to present incorrect equipment, quantities, or notes?
- Are required-field warnings aligned with what sales needs for a rough estimate?
- Does the app remain usable without a backend or build step?

## UI And Output

- Desktop wizard flow is intact.
- Mobile layout is usable.
- Result page is readable.
- Print/PDF output fits and contains the important information.

## Repository Hygiene

- Branch name follows the repository convention.
- PR targets `dev` unless this is a production promotion.
- `npm test` passes.
- README, workflows, and CHANGELOG are consistent with the change.
