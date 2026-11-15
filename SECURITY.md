# Security Policy

## Ownership & Security Authority
- **Repository:** https://github.com/PRIGID-WEB-CLOUD/Looma-
- **Security Contact & Maintainer:** **Kpormegbe Gideon** (`prigidholdings@gmail.com`)

---

## Supported Versions

| Version | Supported | Deployment Target |
| :--- | :--- | :--- |
| `1.0.x` (current `main`) | Yes | Cloudflare Workers (`https://looma.prigidcollection.workers.dev/`) |
| `< 1.0.0` | No | Upgrade immediately |

---

## Security Vulnerability Reporting
**Do NOT report security vulnerabilities via public GitHub Issues or Pull Requests.**

If you discover a vulnerability involving authentication, Firestore security rules,
Cloudflare R2 storage access, Cloudflare Realtime SFU signaling, secret exposure,
or XSS/CSRF:

1. Email **prigidholdings@gmail.com** with subject `[SECURITY] Looma Vulnerability Report`, or open a **Private Security Advisory** under the repository's **Security** tab on GitHub.
2. Include:
   - Affected endpoint, file, or Firestore collection.
   - Reproduction steps or minimal proof-of-concept (without accessing other users' private data).
   - Expected vs. actual security impact.
3. Allow reasonable time for triage, verification, and remediation before any public disclosure.

---

## Security, Privacy & Data Protection Rules
- **Cryptographic Auth Verification**: All protected `/api/*` routes verify Firebase ID tokens cryptographically (`RS256` JWKS verification + issuer/audience/expiry + `email_verified` enforcement).
- **Zero Secret Exposure**: Server credentials (`CLOUDFLARE_CALLS_APP_TOKEN`, `CALLS_STATE_SECRET`, `R2_SECRET_ACCESS_KEY`, `GEMINI_API_KEY`, `TURN_CREDENTIAL`) must live exclusively in Cloudflare Worker Secrets or local `.env` (gitignored) — never in source code or `VITE_*` client variables.
- **PII Isolation**: User emails, push flags, and private settings reside under `/users/{uid}/private/{docId}` and are strictly owner-readable in `firestore.rules`.
- **Media Validation**: R2 uploads validate MIME types, file size caps, magic-byte signatures, and object-key ownership (`uploads/{uid}/...`).
- **Secret Scanning**: GitHub Secret Scanning and Push Protection must remain enabled on the repository.
