# Repository Governance, Rules & Legal Protection

**Project:** Looma
**Owner & Authority:** Kpormegbe Gideon (`PRIGID-WEB-CLOUD`)
**Repository:** https://github.com/PRIGID-WEB-CLOUD/Looma-

---

## 1. Repository Rules & Policies
- **Branch Rulesets**: `main` is protected. Direct pushes are prohibited. All changes enter via reviewed pull requests from feature/fix branches with passing CI checks (`lint`, tests, `build`) and Code Owner approval.
- **Dependency Management Rules**: Weekly automated security/version checks via `.github/dependabot.yml`. Lockfile (`bun.lock`) must always stay synchronized with `package.json`.
- **Release Management Rules**: Semantic Versioning (`vMAJOR.MINOR.PATCH`) via annotated Git Release Tags, accompanied by updates to `CHANGELOG.md` and `CITATION.cff`.
- **Privacy & Data Protection Rules**: Public profiles contain zero PII; private data is isolated in `/users/{uid}/private/*`; verified Firebase authentication is enforced across Firestore and `/api/*`.
- **Secret Scanning & Advisories**: GitHub Secret Scanning, Push Protection, and Private Security Advisories remain enabled. No credentials or service accounts may ever be committed.

## 2. GitHub Repository Features
- **Issue & PR Templates**: Configured under `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md`.
- **Discussion Guidelines**: Keep GitHub Discussions focused on architecture, troubleshooting, and approved roadmap proposals; uphold [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).
- **Recommended Repository Topics**: `looma`, `social-media`, `cloudflare-workers`, `cloudflare-r2`, `cloudflare-realtime`, `webrtc`, `firebase`, `firestore`, `react`, `typescript`, `tailwindcss`, `hono`, `pwa`.

## 3. Legal & Intellectual Property Protection
- **Source Code & IP Ownership**: 100% owned by **Kpormegbe Gideon** / **PRIGID-WEB-CLOUD**.
- **NOT FOR SALE**: Looma is strictly proprietary and not for sale.
- **Prohibitions**: Unauthorized copying, distribution, commercial use, modification, reverse engineering, or derivative works are prohibited without prior written consent from Kpormegbe Gideon. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE) for full warranty disclaimers and liability limitations.
