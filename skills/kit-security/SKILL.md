---
name: kit-security
description: "Use for changes touching authentication, permissions, payments, personal data, uploads, database or dependencies, for security reviews, and before deployment. Arabic triggers: الأمان، فحص أمني، ثغرات."
---

# Security check

Scope to the change; before a first release or on request, cover the whole project.

## Checklist
- **Secrets:** none in code, history, logs, client bundles or error messages. `.env` ignored; example file has placeholders only. Run `sh .ai-kit/scan-secrets.sh --all`.
- **Authentication:** trusted library; secure sessions/cookies; password hashing by the library; reset and verification flows expire.
- **Authorization:** every endpoint and query checks that this user may access this object (test with a second user). Database row-level rules where supported. Admin paths protected on the server.
- **Input:** server-side validation; parameterized queries; output encoding against XSS; CSRF protection; safe file uploads (type, size, storage location); no user-controlled URLs fetched without allow-listing.
- **Abuse:** rate limits on login, signup, reset, costly APIs; spending caps on paid services.
- **Data:** collect only what is needed; encrypted in transit; backups; no personal data in logs.
- **Configuration:** security headers, strict CORS, debug off in production, least-privilege keys.
- **Dependencies:** run the ecosystem's audit tool; check new packages for exact name, maintenance and license.
- **AI features:** treat model output and retrieved content as untrusted; limit what tools the model can trigger.

## Rules
- Test only the user's own project, locally or in a test environment. Never attack live or third-party systems.
- Use test data. Do not read or change real data without approval.
- Never turn off a security control to make something work.

## Report
By severity (Critical, High, Medium, Low): location, what could happen, fix. Then what was **not** checked. Critical or High findings block push to a shared branch and deployment until fixed or the user accepts them explicitly. This is a checklist review, not a guarantee; recommend a specialist for high-risk systems.
