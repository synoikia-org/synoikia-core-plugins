# The spec and the design are settled before review

- `features/` and `docs/adrs/` were reviewed before the code was written. Never change a scenario
  or an ADR to answer a review comment or to make a check pass.
- A review comment that asks for different behaviour or a different design is not a fix: reply
  that it reopens the spec or the design, and leave the pull request unmerged.
- Push new commits. Never force-push or rewrite the pull request's history.
- When reviewing, apply the `security-review` skill in `.github/skills/`.
