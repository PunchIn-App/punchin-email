# Security Policy

## Supported Versions

Only the latest release of the PunchIn Email Worker is actively supported with
security updates.

| Version | Supported |
| ------- | --------- |
| 1.6.x   | Yes       |
| < 1.6   | No        |

## Scope

The PunchIn Email Worker is the Cloudflare Email Worker that powers the
`@trackmytime.today` role aliases (`abuse@`, `cla@`, `contact@`, `cve@`, `feedback@`, `licensing@`, `privacy@`) and
the two-way reply relay. In scope are:

- The worker source (`src/index.js`, `src/lib.js`, `src/settings.js`,
  `src/access.js`, `src/admin.js`) and its routing logic.
- The thread-mapping store in the `EMAIL_THREADS` KV namespace. Entries hold the
  original sender address, the alias the mail was addressed to, and a timestamp,
  keyed by a random 64-bit thread id with a 30-day TTL. The same namespace holds
  the runtime settings record (`settings:v1`).
- The inbound forward path and the outbound relay path (header rewriting and
  Email Sending).
- The admin UI (`fetch()` handler) and its Cloudflare Access authentication,
  which fails closed and verifies the Access JWT (signature + AUD + issuer +
  expiry) on every request.

Out of scope:

- Mail once it has been delivered to the destination inbox (`FORWARD_TO`), which
  is governed by that provider's own security.
- The deliverability posture of the domain itself (SPF/DKIM/DMARC/MX records),
  except where the worker is responsible for what it (re-)sends.

> Note: this worker is itself the infrastructure that routes the `cve@` and
> `cve+<number>@` addresses described below.

## Reporting a Vulnerability

Please do **not** report security vulnerabilities through public GitHub issues.

Instead, report them privately by either:

- Emailing **[cve@trackmytime.today](mailto:cve@trackmytime.today)**, or
- Using GitHub's built-in security advisory feature: **[Report a vulnerability](https://github.com/PunchIn-App/punchin-email/security/advisories/new)**

If a CVE has already been assigned, please email the sub-addressed form
`cve+<number>@trackmytime.today` instead — for example, `cve+542161425@trackmytime.today`
for CVE-542161425 — so your report is automatically grouped by its CVE ID.

### What to include

Please include as much of the following as possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce or proof-of-concept code
- The affected version(s)
- Any suggested fix or mitigation if you have one

### What to expect

- **Acknowledgement**: We aim to acknowledge your report within 48 hours
- **Status update**: We aim to provide an assessment and estimated timeline within 7 days
- **Resolution**: We aim to patch critical vulnerabilities within 14 days

If a vulnerability is accepted, we will coordinate a fix and disclosure timeline with you. If it is declined, we will explain why.

We appreciate responsible disclosure and will credit reporters in the release notes unless you prefer to remain anonymous.
