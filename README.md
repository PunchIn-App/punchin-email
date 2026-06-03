# PunchIn Email Worker — Two-Way Alias Relay for trackmytime.today

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-1f6feb?style=flat)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/PunchIn-App/punchin-email/ci.yml?branch=main&style=flat&label=CI&color=1f6feb)](https://github.com/PunchIn-App/punchin-email/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.1.1-1f6feb?style=flat)](docs/CHANGELOG.md)

> Role-address email that replies as itself — mail to an alias forwards to your
> inbox, and your reply goes back out **from the alias**, not from you.

A [Cloudflare Email Worker](https://developers.cloudflare.com/email-routing/email-workers/)
that powers the `@trackmytime.today` role aliases and a two-way reply relay. Mail
to `cla@`, `licensing@`, `cve@`, `abuse@` (plus any `+subaddress`) is forwarded
to your Gmail. When you simply hit **Reply**, the response goes back out **from
the original alias** to the original sender — no manual "From" selection, no
leaking your personal address.

This is the infrastructure behind the contact addresses in the main
[PunchIn](https://github.com/PunchIn-App/punchin) project's governance docs:
CLA → `cla@`, security → `cve@` (with `cve+<number>@` sub-addressing), conduct →
`abuse@`.

## Why

Public projects need role addresses, but you don't want to expose a personal
inbox or fiddle with "Send as" identities for every reply. This worker keeps the
alias as the public face of every conversation while you read and reply from one
ordinary inbox.

## How It Works

```
                  ┌─────────────────────────── inbound ───────────────────────────┐
  partner@corp.com ──► cla@trackmytime.today ──► [Worker] ──► forwards to your Gmail
                                                    │                 (Reply-To:
                                                    │            relay+<id>@trackmytime.today)
                                          stores {originalSender,
                                          aliasEmail} in KV under <id>

                  ┌──────────────────────────── relay ────────────────────────────┐
  you hit Reply ──► relay+<id>@trackmytime.today ──► [Worker] ──► sends FROM cla@
                                                    │            TO partner@corp.com
                                          looks up <id> in KV,
                                          rewrites From/To headers
```

1. **Inbound** (`handleInbound`): an email to an allowed alias generates a random
   16-char thread id, stores `{ originalSender, aliasEmail, timestamp }` in the
   `EMAIL_THREADS` KV namespace (30-day TTL), and forwards the message to
   `FORWARD_TO` with `Reply-To: relay+<id>@<RELAY_DOMAIN>`.
2. **Relay** (`handleRelay`): your reply lands on `relay+<id>@…`. The worker
   verifies the sender, looks up the thread, rewrites the `From`/`To` headers
   (preserving `Subject`, `Message-ID`, `In-Reply-To`, `References` so threading
   survives), and sends it out via the `EMAIL_SENDING` binding.

The worker's `email()` entrypoint routes by recipient: anything starting with
`relay+` goes to the relay handler, everything else to the inbound handler.

## Robustness & Safety Guards

| Guard | Where | Why |
| --- | --- | --- |
| **Alias allowlist** (`ALLOWED_ALIASES`) | inbound | A catch-all route sends *every* address to the worker. Only the configured base local-parts are forwarded; everything else is rejected, so the worker can't be abused as an open forwarder for the whole domain. |
| **Relay sender verification** | relay | Only mail whose `From` matches `FORWARD_TO` is relayed. Without this, anyone who learned a thread id could send mail *from* your alias to the original sender. |
| **Auto-submitted detection** | relay | Vacation responders / bounces (`Auto-Submitted`, `Precedence: bulk/list`, `X-Autoreply`, …) are not relayed, preventing mail loops. |
| **Sender-header stripping** | relay rewrite | `Reply-To`, `Return-Path`, `Sender`, and the now-invalid `DKIM-Signature` are removed before re-sending; Cloudflare re-signs the outbound message for the domain. |
| **Graceful expiry** | relay | Replies to threads older than 30 days are rejected with a clear reason rather than silently dropped. |

## Tech Stack & Project Structure

- **Cloudflare Email Workers** (`email()` handler) — inbound routing + relay
- **Workers KV** (`EMAIL_THREADS`) — thread mappings, 30-day TTL
- **Cloudflare Email Sending** (`EMAIL_SENDING`) — outbound relay
- **Vitest** — unit + handler tests
- **Wrangler** — local dev, dry-run, deploy

```
src/
  index.js   email() entrypoint + handleInbound / handleRelay
  lib.js     pure, runtime-agnostic helpers (unit-tested directly)
test/
  lib.test.js        helper unit tests
  handlers.test.js   handler tests with mocked message / KV / send bindings
  helpers.js         test doubles (KV, message, env)
  mocks/             stub for the `cloudflare:email` module
docs/
  CHANGELOG.md       Keep a Changelog history
wrangler.toml        worker config + bindings
CLAUDE.md            architecture guide
```

## Configuration

Non-secret `wrangler.toml` vars:

| Var | Meaning |
| --- | --- |
| `RELAY_DOMAIN` | Domain used in the generated `relay+<id>@…` Reply-To. |
| `ALLOWED_ALIASES` | Comma-separated base local-parts that may forward (e.g. `cla,licensing,cve,abuse`). |
| `CONTACT_URL` | Optional. URL shown in the bounce when mail hits an unrecognized address. Defaults to `https://<RELAY_DOMAIN>` if unset. |

Secret (set with `wrangler secret put`, never committed):

| Secret | Meaning |
| --- | --- |
| `FORWARD_TO` | Your real destination inbox. Inbound mail is forwarded here, and it is the only address allowed to drive the relay. Kept out of version control because it is personal data. |

```bash
wrangler secret put FORWARD_TO   # paste your inbox address when prompted
```

Bindings:

- `EMAIL_THREADS` — KV namespace storing thread mappings.
- `EMAIL_SENDING` — Email Sending binding (`unrestricted`, so the relay can send
  to arbitrary original senders).

> Never put `FORWARD_TO` (or any personal address / secret) in `[vars]` — that
> block is committed to the repo.

## Email Routing Setup

This worker expects **both** the role aliases and the `relay+*` replies to be
delivered to it. The simplest configuration is a **catch-all → this worker**
route, because the worker already enforces the alias allowlist itself:

1. **Email** → **Email Routing** → enable it and let Cloudflare add the `MX`/`TXT`
   (SPF) records for `trackmytime.today`.
2. **Routing rules** → **Catch-all address** → action **Send to a Worker** →
   `punchin-email`. (Alternatively, create individual `Send to a Worker` rules
   for `cla`, `licensing`, `cve`, `abuse`, **and** `relay` — but catch-all is
   less error-prone.)
3. **Destination addresses** → verify `FORWARD_TO`. Inbound forwarding will not
   work until this address shows **Verified**.
4. Ensure the domain's DKIM for Email Sending is configured so relayed mail is
   signed for `trackmytime.today`.

> **Subaddressing (the Cloudflare setting) is optional with catch-all.** Catch-all
> delivers the full recipient — including `cla+foo@`, `cve+123@`, and the
> `relay+<id>@` replies — to the worker with the `+tag` intact, and the worker
> strips the subaddress itself (`baseLocalPart`). You'd only need to enable
> Cloudflare's Subaddressing toggle if you switched from catch-all to individual
> per-address rules and wanted `+tag` variants to match them.

> If you use individual rules instead of catch-all, the `relay+*` replies need a
> rule too. Without it, your replies bounce. Catch-all avoids that footgun.

## Development

```bash
npm install
npm test          # run the suite once
npm run test:watch
npm run check     # wrangler deploy --dry-run (bundles, no upload)
npm run dev       # wrangler dev (local worker)
```

## Deploy

```bash
npm run deploy    # wrangler deploy
```

## Contributing

Contributions are welcome. See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)
for the workflow, versioning, documentation, and testing requirements. There's no
CLA — contributions are accepted under the project's Apache-2.0 license. This
project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please do not file public issues for vulnerabilities. Email
[cve@trackmytime.today](mailto:cve@trackmytime.today) (or `cve+<number>@…` if a
CVE is assigned) — see [SECURITY.md](SECURITY.md) for the full policy.

## License

[Apache License 2.0](LICENSE) — free to use, modify, host, and redistribute
(including commercially) with attribution. Includes an explicit patent grant.
