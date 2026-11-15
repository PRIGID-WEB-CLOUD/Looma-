# Contributing to Looma

**Repository:** https://github.com/PRIGID-WEB-CLOUD/Looma-
**Repository Owner & Code Owner:** Kpormegbe Gideon (`PRIGID-WEB-CLOUD`)

Thank you for your interest in contributing to **Looma**. Please read all governance,
contribution, and security rules carefully before opening an issue or pull request.

---

## Contribution Eligibility
- Only authorized collaborators and approved contributors invited or accepted by **Kpormegbe Gideon** (`PRIGID-WEB-CLOUD`) may submit code changes.
- Because Looma is proprietary software (**All Rights Reserved — NOT FOR SALE**), unsolicited forks or commercial derivative distributions are not permitted under [LICENSE](./LICENSE).

## Contributor Agreement
By submitting a pull request, patch, documentation edit, or asset to this repository, you agree that:
1. Your submission is your original work and does not infringe third-party intellectual property.
2. All accepted contributions become the sole proprietary property of **Kpormegbe Gideon** / **PRIGID-WEB-CLOUD** governed by [LICENSE](./LICENSE).
3. You will never include private credentials, API keys, service accounts, or customer data in commits or pull requests.

---

## Development Rules & Coding Standards
- **Language & Types**: Strict TypeScript (`tsc --noEmit` must pass with zero errors). Avoid `any` unless strongly justified and guarded.
- **Styling**: Tailwind CSS utility classes only (`@import "tailwindcss";` in `src/index.css`). Maintain mobile-first responsive layouts.
- **Backend Compatibility**: All backend routes in `src/worker.ts` must remain 100% compatible with the **Cloudflare Workers** runtime (no unsupported Node-only runtime modules in `src/worker.ts`).
- **Security**:
  - Every protected `/api/*` endpoint must use verified Firebase ID-token authentication (`requireVerifiedAuth`).
  - Never expose server tokens (`CLOUDFLARE_CALLS_APP_TOKEN`, `R2_SECRET_ACCESS_KEY`, `CALLS_STATE_SECRET`, `GEMINI_API_KEY`) to `VITE_*` variables or frontend bundles.
  - Keep `firestore.rules` aligned with `firebase-blueprint.json` and `security_spec.md`.

---

## Branch Protection & Version Control Policy
- **Never commit directly to `main`.**
- Create a dedicated feature or fix branch from `main` (e.g. `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `security/<topic>`).
- Protected branches require:
  - Passing CI checks (`npm run lint`, unit & Worker tests, `npm run build`).
  - Code Owner approval from **Kpormegbe Gideon** (`CODEOWNERS`).
  - Linear, clean commit history and zero secret-scanning alerts.

## Commit Message Standards
Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: ...` — New feature
- `fix: ...` — Bug fix
- `security: ...` — Security hardening or rules fix
- `docs: ...` — Documentation updates
- `chore: ...` — Tooling, lockfile, or config maintenance
- `test: ...` — Unit, integration, or rule tests

---

## Pull Request Guidelines
1. Keep PRs scoped to a single feature, fix, or documentation update.
2. Fill out `.github/PULL_REQUEST_TEMPLATE.md` completely.
3. Run locally before pushing:
   ```bash
   npm run lint
   npx tsx --test src/utils/*.test.ts src/services/*.test.ts src/worker.test.ts
   npm run build
   ```
4. Attach screenshots or screen recordings for any UI/UX changes.

## Code Review Policy
- All PRs require at least one approval from the Code Owner (**Kpormegbe Gideon**) before merging.
- Security-sensitive changes (`src/worker.ts`, `firestore.rules`, `wrangler.jsonc`, auth/calls/storage logic) require explicit verification notes in the PR description.

## Issue Reporting Guidelines
- Use the provided GitHub Issue Templates (`Bug Report` or `Feature Request`).
- Never post private keys, ID tokens, user emails, or raw production credentials in public issues.
- For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Contributor Recognition
Verified contributors recognized by **Kpormegbe Gideon** are credited in [AUTHORS.md](./AUTHORS.md) and release notes in [CHANGELOG.md](./CHANGELOG.md) while retaining proprietary ownership under [LICENSE](./LICENSE).
