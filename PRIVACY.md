<!--
  ⚠️ DRAFT — FOR HUMAN / LEGAL REVIEW BEFORE PUBLISHING.
  This policy was assembled from PunchIn's actual data practices as implemented in
  the punchin, punchin-email, and punchin-feedback repositories. It is accurate to
  the code as of the drafting date, but a privacy policy is a binding legal
  commitment: have it reviewed by qualified counsel and resolve every reviewer note
  (see the checklist at the bottom) before you treat it as final or rely on it.
  Delete this comment and the "Notes for the reviewer" section once review is complete.
-->

# PunchIn Privacy Policy

> **Status: Draft — pending legal review. Not yet in effect.** Drafted 8 June 2026
> from the current data practices of the PunchIn app and its supporting services.
<!-- > See the [notes for the reviewer](#notes-for-the-reviewer) at the end.

**Effective date:** 8 June 2026 _(takes effect on publication)_ -->

PunchIn is a time-tracking app for freelancers and independent contractors. It is
built to be **private by design**: your data is stored on your own device, and
nothing you enter is sent anywhere unless you deliberately turn on an optional
feature. This policy explains, in plain terms, what that means — what stays on your
device, the few things that involve a server, the optional features that send data
somewhere only when you choose to use them, and what happens to the information you
send us when you ask for help or send feedback.

---

## The short version

- **Your time-tracking data stays on your device.** Jobs, time entries, labour
  types, notes, and your billing profile live in your browser's local storage
  (IndexedDB). By default they are never transmitted to us or anyone else.
- **We have no accounts and no backend database.** There is nothing to sign up for,
  and we do not operate a server that holds your records.
- **No analytics, no advertising, no tracking, no cookies.** PunchIn loads no
  third-party trackers and sets no cookies.
- **Optional features are opt-in.** Cloud sync, device-to-device transfer, and
  sending feedback each send specific data only when *you* start them.
- **Feedback you submit becomes public.** If you use our feedback form, your report
  is filed as a **public GitHub issue**. Your email address, if you provide one, is
  kept private and is never shown on the issue. See
  [Sending feedback](#sending-feedback-optional).
- **We do not sell or share your personal information**, and we never have.

---

## Who we are

PunchIn ("PunchIn", "we", "us", or "our") is published by **PunchIn-App**, an
independent software project operated by an individual developer. PunchIn-App is the
data controller for the limited processing described in this policy. Because PunchIn
is run by an individual rather than a registered company, we identify ourselves and
take requests **by email** rather than at a postal address.

- **App:** [trackmytime.today](https://trackmytime.today)
- **Source code:** [github.com/PunchIn-App](https://github.com/PunchIn-App)
- **Privacy contact:** [privacy@trackmytime.today](mailto:privacy@trackmytime.today)

---

## What this policy covers

This policy covers the PunchIn product as a whole:

- the **PunchIn web app** at `trackmytime.today` and the Cloudflare Worker that
  serves it (including the GitHub sign-in step used for optional sync);
- the **feedback service** at `feedback.trackmytime.today`, which turns bug reports
  and feature requests into GitHub issues; and
- the **`@trackmytime.today` email aliases** (such as `privacy@`, `contact@`, and
  `abuse@`) you can write to, and the relay that delivers and answers that mail.

It does **not** cover third-party services you may choose to connect or visit — such
as GitHub, Google, or Microsoft for cloud sync, GitHub itself when you browse an
issue, or external links like our "Support the App" page. Those services are
governed by their own privacy policies, linked under
[Third-party services](#third-party-services).

---

## Data PunchIn stores on your device

Everything you create in PunchIn is stored locally in your browser and, by default,
never leaves your device:

| Where it's stored | What it contains |
|---|---|
| **IndexedDB** (`PunchInDB`) | Your jobs and clients, time entries (including any notes and start/stop times), labour types, deletion records, and all app settings — including your **billing profile** (name, business name, email, phone, address, logo) used to generate invoices. |
| **Local storage** | A few small preferences and a randomly generated **device identifier** (`pi.deviceId`). The device identifier is an 8-character random value created on your device; it is used to keep cloud-sync data from different devices separate, and it persists across a factory reset. Other local-storage values include UI state such as how many times you've opened the app (used to time the "add to home screen" prompt) and which prompts you've dismissed. |
| **Encrypted credential store** | If — and only if — you connect cloud sync, your sync access token is stored encrypted at rest using a non-extractable key held by your browser. It is never stored in plain text. |

You are always in control of this data: you can export a full backup (JSON or CSV),
import data, delete individual entries, clear all data, or perform a factory reset
from within the app's Settings.

> **A note on local storage:** Data in your browser is stored in plain text (except
> the encrypted sync token described above). Anyone with access to your unlocked
> device could read it. Protect your device with a passcode or biometric lock, and
> use your operating system's account separation if you share the device.

---

## Information processed when you use the app

PunchIn has no analytics and sets no cookies, but a few unavoidable technical
interactions occur simply because PunchIn is a website:

- **Hosting and delivery.** PunchIn is served by **Cloudflare Workers**. Each time
  you open or reload the app — and when the app checks for an update — your browser
  makes standard web requests to Cloudflare. As with any website, our hosting
  provider may process technical request data such as your IP address, browser
  user-agent, and the time of the request for the purposes of delivering the app,
  security, and abuse prevention. We do not maintain our own analytics logs of this
  activity.
- **App (home-screen) icons.** If you choose a custom accent colour, your browser
  requests a matching app icon from our server. That request contains only the
  colour value (a hex code) — no personal data.
- **Service-worker updates.** PunchIn is an installable Progressive Web App. To
  deliver updates, your browser periodically asks our server whether a newer version
  is available. This is a standard web request and carries no PunchIn-specific
  personal data.

No content you enter into PunchIn (your jobs, entries, notes, or billing profile) is
transmitted during any of the above.

---

## Optional features that send data off your device

The following features are **off by default**. Each one sends only the data
described, and only after you start it.

### Cloud sync (optional)

If you connect cloud sync, PunchIn backs up and synchronises your data to **your
own** cloud-storage account with a provider you choose:

- **What is sent:** a snapshot of your PunchIn data — your jobs, time entries, labour
  types, deletion records, and settings (which include your billing profile). This is
  written to **your own account** (a private GitHub Gist, a file in your Google Drive
  app-data folder, or a file in your Microsoft OneDrive app folder). We do not
  receive a copy and do not operate the storage.
- **What is *not* sent:** your encrypted sync access token is kept on your device and
  is not included in the synced snapshot.
- **Sign-in:** connecting a provider uses that provider's standard OAuth sign-in. For
  **GitHub**, the authorization code is exchanged for an access token by our
  Cloudflare Worker (which holds the GitHub client secret); the token is passed back
  to the app and is **not stored or logged by the Worker**. **Google** and
  **Microsoft** sign-in happen entirely in your browser and do not involve our
  Worker.
- **Provider access:** to find or create PunchIn's sync file, the app may need to read
  your account's file list from the provider (for example, GitHub sync reads the list
  of your existing Gists to locate PunchIn's). This happens within your authorised
  connection to that provider. The scopes requested are deliberately narrow — app-only
  storage for Google (`drive.appdata`) and OneDrive (`Files.ReadWrite.AppFolder`), and
  gist access for GitHub (`gist`).
- **Third parties:** the provider you choose (GitHub, Google, or Microsoft) processes
  this data under its own privacy policy. You can disconnect sync at any time in
  Settings, which removes PunchIn's sync file from your account.

### Device-to-device transfer (optional)

You can move your data to another device by generating a transfer link or QR code.
The data is encoded directly into the link (in the URL fragment) or the QR image and
shared by you — **peer-to-peer**. URL fragments are not transmitted to web servers,
so this transfer does not send your data to us or our host. You control who you share
the link or code with; treat it like the data itself.

### Sending feedback (optional)

If you choose to report a bug or suggest a feature, you can use our account-free
feedback form at **`feedback.trackmytime.today`** (you can also file directly on
GitHub if you have an account — see below). Feedback is entirely voluntary, but please
read this section carefully, because **what you submit becomes public.**

- **Your report becomes a public GitHub issue.** When you submit the form, we file it
  as an issue in our public repository,
  [github.com/PunchIn-App/punchin](https://github.com/PunchIn-App/punchin/issues).
  **Anyone on the internet can read it.** That includes everything you type (the
  title, description, steps, and any context you add) and a small amount of **coarse
  environment information** the form collects to help us reproduce issues: the app
  version, whether the app is installed or running in a browser tab, your browser
  family and major version (e.g. "Chrome 124"), your operating system, and your
  device model or screen size. **Do not include anything you would not want to be
  public** — including your time-tracking data, client names, passwords, or other
  people's personal information.
- **Screenshots are public too.** Any screenshots you attach (up to five images) are
  stored in our private Cloudflare R2 storage, served from `feedback.trackmytime.today`,
  and **embedded in the public issue** — so anyone who can see the issue can see them.
  They are deleted **one year after upload** (reset if the issue is reopened) or
  **30 days after the issue is closed**, whichever comes first.
- **Your email address is optional and kept private.** You only need to provide an
  email if you want to be notified about your report (a copy on submission, or alerts
  when it is closed, reopened, or commented on). If you provide one, it is **never
  written to the public issue.** It is stored only in our Cloudflare KV store, solely
  to send the notifications you asked for, and is purged about **three months (90 days)
  after the issue is closed** (reopening restarts that window), after about **one year**
  if the issue never closes, or **immediately when you unsubscribe** (every
  notification email includes an unsubscribe link).
- **Replying by email.** If you opt in to comment notifications, you can reply to a
  notification email to add a comment back to the issue. We match your reply to your
  report using the email address you provided; that reply is then posted publicly on
  the issue, attributed to "the reporter".
- **Abuse prevention.** To stop spam and abuse, the form is protected by Cloudflare
  Turnstile (a privacy-friendly bot check) and by rate limiting. For rate limiting we
  take your IP address, immediately **hash it (SHA-256)**, and keep only that hash as
  a short-lived counter for **about 10 minutes**. We do not store your raw IP address,
  and the hash is never linked to your report, your email, or the issue.
- **Filing directly on GitHub.** Alternatively you can file a report on GitHub
  yourself, which requires a GitHub account and is governed by
  [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement).
  Anything you post to a public issue is public.

### Supporting the app (optional)

The Settings screen includes a link to an external "Buy Me a Coffee" page. PunchIn
embeds no payment or tracking scripts; if you follow that link, you leave PunchIn and
are subject to that service's own privacy policy.

---

## When you email us

You can write to us at our `@trackmytime.today` aliases — for example
[privacy@trackmytime.today](mailto:privacy@trackmytime.today),
`contact@trackmytime.today`, or `abuse@trackmytime.today`. These addresses are served
by a privacy-preserving email relay (our `punchin-email` service):

- **What it does.** Mail you send to an alias is forwarded to the operator's personal
  inbox so we can read and answer it. When we reply, the relay sends our answer back to
  you **from the alias**, so our personal inbox address is never exposed to you, and
  yours is never exposed beyond the operator.
- **What it stores.** To connect our reply to your original message, the relay stores a
  small **thread record** — your email address, the alias you wrote to, and a timestamp —
  in Cloudflare KV for **30 days** (refreshed while a conversation is active). **The
  content of your email is not stored** by the relay; it is forwarded and discarded.
- **What it logs.** Operational logs record only a delivery verdict and error types —
  **no email addresses and no message content.**
- **What you send us.** Naturally, anything you choose to put in an email to us (your
  message, and whatever personal details you include) reaches the operator's inbox and
  is retained there as ordinary correspondence for as long as needed to deal with your
  request.

---

## Cookies and similar technologies

**PunchIn does not use cookies.** It uses your browser's IndexedDB and local storage,
as described under [Data PunchIn stores on your device](#data-punchin-stores-on-your-device),
solely to make the app work — not to track you across sites or sessions. There are no
advertising or analytics technologies of any kind.

---

## How we use information, and our legal bases

Because PunchIn collects so little, our uses are narrow:

| Purpose | Data involved | Legal basis (GDPR) |
|---|---|---|
| Provide the app's core function (track your time, on your device) | Data stored locally on your device | Performance of our service to you / legitimate interests |
| Deliver and update the app | Standard web-request data processed by our host | Legitimate interests (operating and securing the service) |
| Sync your data to your own cloud account | Your data snapshot, sent to your chosen provider | Your consent (you enable sync) |
| Receive, triage, and act on your feedback | What you submit, plus the public coarse environment info and any screenshots | Your consent (you choose to send it) |
| Send the feedback notifications you ask for | Your email address and notification preferences | Your consent (you opt in; withdraw any time via unsubscribe) |
| Prevent spam and abuse of the feedback form | A short-lived hashed (SHA-256) IP counter and a bot-check | Legitimate interests (protecting the service) |
| Receive and answer email you send us | Your email address, the alias, and your message | Legitimate interests (responding to you) |

We do not use your information for profiling, automated decision-making, or
advertising.

---

## Sharing and disclosure

**We do not sell your personal information, and we do not share it for cross-context
behavioural advertising** (as those terms are used under the California Consumer
Privacy Act, as amended by the CPRA). We have no advertising relationships.

We do not disclose your information to third parties except:

- **Service providers we rely on to run the product** — principally **Cloudflare**
  (app hosting and delivery; the feedback service's compute, storage, and email; and
  the email relay) and, for the feedback service, **GitHub** (which hosts the public
  issues your feedback becomes). These providers process data on our behalf to operate
  the service.
- **Providers you choose to connect** — if you enable cloud sync, your chosen provider
  (GitHub, Google, or Microsoft) receives the data you sync, under your account and
  their policy.
- **The public** — content you submit through the feedback form is, by design, posted
  publicly on GitHub (your email address excepted). See
  [Sending feedback](#sending-feedback-optional).
- **Legal requirements** — if required by law, regulation, or valid legal process.
  Note that because we do not hold your time-tracking data on a server, there is
  generally nothing of that kind for us to produce.

---

## Data retention

- **On your device:** your data is retained until *you* delete it — by removing
  entries, clearing data, or performing a factory reset. Deleting an entry records a
  small deletion marker so the deletion propagates if you use sync; that marker
  contains no time-tracking content.
- **On our servers:** we do not maintain a database of your records. The GitHub
  sign-in exchange is transient and not stored.
- **In your synced cloud account:** data you sync persists in your own account until
  you disconnect sync (which deletes PunchIn's sync file) or delete it yourself.
- **Feedback you send:**
  - *The public issue* (your report text and coarse environment info) persists on
    GitHub until we or you delete it, subject to GitHub's retention.
  - *Screenshots:* deleted one year after upload (reset on reopen) or 30 days after the
    issue is closed, whichever is first.
  - *Your email address and notification preferences:* purged about three months
    (90 days) after the issue is closed, after about one year if it never closes, or
    immediately on unsubscribe.
  - *Anti-abuse IP hash:* about 10 minutes.
- **Email you send us:** the relay's thread record (your address + alias + timestamp,
  no message content) is kept for 30 days; the message itself is retained in the
  operator's inbox as ordinary correspondence for as long as needed to handle your
  request.

---

## Your privacy rights

Because your data lives on your device, **you already have direct, complete control**
over it — you can view, export, correct, and delete it at any time from within the app,
without asking anyone.

In addition, depending on where you live, you may have the following rights.

### If you are in the EU, EEA, or UK (GDPR / UK GDPR)

You have the right to **access**, **rectify (correct)**, **erase**, **restrict** or
**object to** the processing of your personal data, the right to **data portability**,
and the right to **withdraw consent** at any time (for example, by disabling sync,
unsubscribing from feedback notifications, or not sending feedback). You also have the
right to lodge a complaint with your local supervisory authority.

### If you are in California (CCPA / CPRA)

You have the right to **know** what personal information is collected and how it is
used, the right to **delete** it, the right to **correct** it, and the right to
**non-discrimination** for exercising your rights. We **do not sell or share** personal
information and do not use sensitive personal information for any purpose beyond
providing the service, so there is no "Do Not Sell or Share" action needed.

### How to exercise your rights

For data on your device or in your synced account, the fastest route is the app's own
controls (export, edit, delete, factory reset, disconnect sync). To unsubscribe from
feedback notifications, use the link in any notification email. For anything else, or to
ask a question about this policy, contact
[privacy@trackmytime.today](mailto:privacy@trackmytime.today). We may need to verify
your request, and we will respond within the timeframe required by applicable law.

---

## Children's privacy

PunchIn is a tool for working professionals and is **not directed to children**. We do
not knowingly collect personal information from children under 13 (or under 16 in the
EU/EEA/UK). If you believe a child has provided information through an optional feature
such as feedback, contact us and we will delete it.

---

## International users and data transfers

PunchIn is delivered through Cloudflare's global edge network, so the app may be served
from a location near you regardless of where you are. If you enable cloud sync, your
data is stored with the provider you choose (GitHub, Google, or Microsoft), which may
process it in other countries under its own safeguards. Feedback you submit is hosted on
GitHub (a US-based service). By using these optional features, you understand that the
relevant provider may transfer and process data internationally in accordance with its
policy.

---

## Security

- PunchIn has **no central database of your records**, which sharply limits the risk of
  a server-side breach exposing your data.
- The app is served only over **HTTPS**, with HTTP Strict Transport Security and a
  strict **Content-Security-Policy** that blocks third-party scripts and limits network
  connections to the specific services described here.
- Your cloud-sync access token, if you connect sync, is **encrypted at rest** on your
  device with a non-extractable key.
- The feedback service hashes IP addresses for rate limiting, keeps reporter emails out
  of public issues, and stores screenshots under unguessable keys.
- The email relay strips identifying headers and never exposes the operator's personal
  inbox address to correspondents.
- Your on-device data is otherwise stored in plain text by design (see the note above).
  Your device's own security is an important part of keeping it private.

No method of storage or transmission is perfectly secure, but PunchIn's local-first
design means most of your data never travels at all.

---

## Third-party services

These third parties may process data **only** in the situations described above:

- **Cloudflare** — app hosting and delivery; feedback-service compute, storage (KV, R2),
  email sending, and bot protection (Turnstile); and the email relay —
  [Privacy Policy](https://www.cloudflare.com/privacypolicy/)
- **GitHub** — hosts the public issues created by the feedback service, and optional
  cloud sync to a private Gist —
  [Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement)
- **Google** — optional cloud sync to your Google Drive —
  [Privacy Policy](https://policies.google.com/privacy)
- **Microsoft** — optional cloud sync to your OneDrive —
  [Privacy Statement](https://privacy.microsoft.com/privacystatement)
- **Buy Me a Coffee** — optional support link —
  [Privacy Policy](https://www.buymeacoffee.com/privacy-policy)

---

## Changes to this policy

If we change how PunchIn handles data, we will update this policy and revise the
"Effective date" above. Material changes will also be noted in the app's changelog. Your
continued use of PunchIn after an update means you accept the revised policy.

---

## Contact us

Questions, requests, or concerns about privacy:
[privacy@trackmytime.today](mailto:privacy@trackmytime.today)

To report a security vulnerability, please follow our
[Security Policy](https://github.com/PunchIn-App/punchin/blob/main/SECURITY.md) instead
(it has a dedicated reporting channel).

---

<!-- ============================================================
     DELETE EVERYTHING BELOW THIS LINE BEFORE PUBLISHING.
     These are open items for the human reviewer to resolve.
     ============================================================ 

## Notes for the reviewer

This section is **not part of the published policy** — remove it once the items below
are resolved and the policy has been reviewed by qualified counsel.

- [ ] **Have it reviewed by a lawyer.** This draft reflects the product's *technical*
      practices accurately, but it is not legal advice and has not been reviewed by
      counsel for your jurisdiction(s) and distribution channels (e.g. app stores).
- [ ] **Controller identity.** This draft names "PunchIn-App" as an individual-operated
      project with an email contact and no postal address. If you later form an entity,
      or if a jurisdiction you serve requires a postal address or an EU/UK
      representative (GDPR Art. 13/27), add those details.
- [ ] **Mailboxes.** Confirm `privacy@trackmytime.today` (and the other aliases) are
      live and monitored before publishing these addresses.
- [ ] **Effective date.** Set/confirm the effective date on publish, and remove the
      "Draft — pending legal review" banner and the HTML comment above the title.
- [ ] **Retention precision.** The feedback email retention is "~3 months (90 days)
      after close / ~1 year if open"; screenshots "1 year / 30 days after close". These
      match the code today — re-confirm if the service's TTLs change.
- [ ] **Hosting log retention.** Decide whether to state Cloudflare's request-log
      retention/configuration specifically.
- [ ] **Distribution channels.** If PunchIn is listed in any app store (e.g. the
      Microsoft Store), make sure this policy's disclosures match the store's
      privacy/data-safety label.
- [ ] **Where it lives.** This file is committed in the `punchin`, `punchin-email`, and
      `punchin-feedback` repositories and linked in-app from Settings → About. If you
      later host it at `trackmytime.today/privacy`, keep the copies in sync (or redirect
      to one canonical URL).
- [ ] **Keep it in sync with the code.** Re-check this policy whenever a change adds a
      new data flow, network call, third-party service, or stored field across any of the
      three repositories.
-->
