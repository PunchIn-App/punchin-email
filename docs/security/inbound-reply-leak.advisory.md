<!--
  DRAFT GitHub Security Advisory — NOT yet filed.

  Why it isn't filed yet: repository security advisories 404 on PRIVATE repos
  (confirmed 2026-06-08 — even punchIn-app-bot, which has admin, gets 404 on
  GET/POST /repos/PunchIn-App/punchin-email/security-advisories). The repo is
  scheduled to go PUBLIC ~2026-06-08 (≈5h after this was drafted), at which point
  the endpoint becomes available.

  FILE IT (creates a DRAFT advisory) once the repo is public AND v1.5.0 is
  merged + deployed (don't publish while prod still leaks):

      gh api --method POST \
        /repos/PunchIn-App/punchin-email/security-advisories \
        --input docs/security/inbound-reply-leak.payload.json

  That returns a GHSA id. Then review in the Security tab, optionally request a
  CVE (which would dogfood the relay's own cve+<id>@ subaddressing), and PUBLISH
  after the fix is live. This .md is the human-readable copy; the .payload.json
  next to it is the exact request body.
-->

# Draft advisory: operator inbox (`FORWARD_TO`) disclosed to correspondents on reply

| Field | Value |
|---|---|
| **Summary** | Operator inbox (`FORWARD_TO`) disclosed to correspondents on reply — Cloudflare `forward()` drops the relay `Reply-To` |
| **Severity** | Low |
| **Ecosystem / package** | `other` / `punchin-email` |
| **Affected versions** | `< 1.5.0` |
| **Patched version** | `1.5.0` |
| **Vulnerable function** | `handleInbound` |
| **CWE** | CWE-201 (Insertion of Sensitive Information Into Sent Data), CWE-200 (Exposure of Sensitive Information) |
| **Fix** | PunchIn-App/punchin-email#66 |

## Impact

`punchin-email` is a two-way email alias relay whose core guarantee is that the
operator's personal inbox address is never exposed to correspondents. In versions
prior to **1.5.0**, the **inbound** path broke that guarantee.

`handleInbound` delivered mail addressed to an alias (e.g. `abuse@`, `contact@`,
`cve@`) by calling:

```js
message.forward(FORWARD_TO, new Headers({ 'Reply-To': `relay+<id>@RELAY_DOMAIN` }));
```

Cloudflare's `message.forward()` **silently drops** an added `Reply-To` header.
The forwarded message therefore retained the original sender's own `From` and
carried no working relay `Reply-To`. When the operator simply hit **Reply**, the
reply went **directly to the original sender, from the operator's real
`FORWARD_TO` inbox address** — disclosing the operator's personal email to any
correspondent who received a reply.

In short: anyone who emailed a relayed alias and received a reply could learn the
operator's private inbox address — the exact thing the relay exists to hide.

## Severity

Low. The disclosure is limited to the operator's *own* email address (no
third-party data, no code execution, no authentication bypass). It is rated as a
security issue because it defeats the product's primary privacy guarantee.

## Patches

Fixed in **1.5.0**. The inbound path now **sends** the message via the Email
Sending binding (the same mechanism the outbound relay already uses) instead of
`forward()`-ing it, rewritten so that **both** the `From` (the alias the sender
wrote to) and the `Reply-To` (`relay+<id>@RELAY_DOMAIN`) are relay-controlled.
The operator's reply therefore always re-enters the relay handler and is
re-masked out from the alias, so the personal address is exposed in neither
direction. Even a mail client that ignores `Reply-To` and replies to the `From`
only re-enters the relay, never the original sender.

## Workarounds

None at the configuration level — upgrading to 1.5.0 (or applying the equivalent
`forward()` → Email-Sending rewrite in `handleInbound`) is required. Operators on
affected versions should assume their `FORWARD_TO` address may have been disclosed
to anyone they replied to through the relay.

## References

- Fix: PunchIn-App/punchin-email#66
