## Summary
<!-- Describe what this pull request changes and why. -->

## Related Issue
<!-- Closes #<issue-number> -->

## Change Type
- [ ] Bug fix (`fix`)
- [ ] New feature (`feat`)
- [ ] Security hardening (`security`)
- [ ] Documentation / Governance (`docs`)
- [ ] Tooling / Dependencies (`chore`)

## Verification Checklist
- [ ] `npm run lint` (`tsc --noEmit`) passes with zero errors
- [ ] `npx tsx --test src/utils/*.test.ts src/services/*.test.ts src/worker.test.ts` passes
- [ ] `npm run build` (`vite build`) succeeds
- [ ] No secrets, tokens, or private credentials added to code or `VITE_*` env vars
- [ ] Protected `/api/*` routes enforce `requireVerifiedAuth` and strict input validation
- [ ] `firestore.rules` remains aligned with `firebase-blueprint.json` and `security_spec.md` (if data model changed)
- [ ] Mobile-first responsive layout checked (if UI changed)

## Contributor Agreement
By submitting this PR, I confirm compliance with [CONTRIBUTING.md](../CONTRIBUTING.md) and the proprietary terms in [LICENSE](../LICENSE) (Copyright Kpormegbe Gideon / PRIGID-WEB-CLOUD).
