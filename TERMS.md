<!--
  ⚠️ DRAFT — FOR HUMAN / LEGAL REVIEW BEFORE PUBLISHING.
  These Terms were assembled from how the PunchIn app and its supporting services
  actually work, as implemented in the punchin, punchin-email, and punchin-feedback
  repositories. They are NOT legal advice. Terms of service — especially the
  warranty disclaimer, limitation of liability, and governing-law/dispute clauses —
  are jurisdiction-specific and can be unenforceable if wrong. Have these reviewed by
  qualified counsel and resolve every reviewer note (see the checklist at the bottom)
  before publishing or relying on them. Delete this comment and the "Notes for the
  reviewer" section once review is complete.
-->

# PunchIn Terms of Service

> **Status: Draft — pending legal review. Not yet in effect.** Drafted 8 June 2026.
<!-- > See the [notes for the reviewer](#notes-for-the-reviewer) at the end.

**Effective date:** 8 June 2026 _(takes effect on publication)_ -->

These Terms of Service ("**Terms**") are an agreement between you and **PunchIn-App**,
an independent software project operated by an individual developer ("**PunchIn**",
"**we**", "**us**", or "**our**"). They govern your use of the PunchIn product and its
services. Please read them together with our
[Privacy Policy](https://github.com/PunchIn-App/punchin/blob/main/PRIVACY.md), which is
incorporated into these Terms by reference.

**By using the Services, you agree to these Terms.** If you do not agree, please do not
use the Services.

---

## 1. What these Terms cover ("the Services")

"**Services**" means, collectively:

- the **PunchIn web app** at [trackmytime.today](https://trackmytime.today) (a
  local-first, installable Progressive Web App for time tracking);
- the **feedback service** at `feedback.trackmytime.today`, which lets you file bug
  reports and feature requests; and
- the **`@trackmytime.today` email aliases** and relay you can use to contact us.

These Terms govern your use of the hosted Services we operate. The PunchIn **source
code** is separately available under open-source licences — see
[Software licences](#7-software-licences-and-open-source).

---

## 2. Eligibility

The Services are intended for working professionals and are **not directed to
children**. You must be at least 13 years old (and at least 16 if you are in the
EU/EEA/UK) to use the Services. If you are using the Services on behalf of a business
or other organisation, you represent that you are authorised to accept these Terms on
its behalf — but note that **organisational use of the app software is separately
licensed** (see [Section 7](#7-software-licences-and-open-source)).

---

## 3. The Services are free, account-free, and provided "as is"

- **No accounts, no fee.** PunchIn requires no sign-up and charges nothing to use. We
  may offer optional ways to support the project (such as a "Buy Me a Coffee" link), but
  these are voluntary and are not a condition of use.
- **Local-first.** The app stores your data on your own device by default. We do not
  operate a backend database of your records, and we cannot recover data you lose.
- **No guarantee of availability.** The Services are provided on an "as is" and "as
  available" basis. We may change, suspend, or discontinue any part of the Services at
  any time, with or without notice. Because the app runs on your device, it will keep
  working locally even if we discontinue the hosted Services.

---

## 4. Your data and privacy

- **Your data is yours.** You retain all rights to the content you create in PunchIn
  (your jobs, time entries, notes, billing profile, and so on). We claim no ownership
  of it.
- **You are responsible for your own backups.** Because your data lives on your device,
  clearing your browser storage, losing your device, or a factory reset can erase it.
  Use the app's export and optional sync features to keep backups.
- **Optional features are opt-in.** Cloud sync writes to *your own* third-party storage
  account; device-to-device transfer is peer-to-peer; sending feedback is voluntary.
  How each feature handles data is described in the
  [Privacy Policy](https://github.com/PunchIn-App/punchin/blob/main/PRIVACY.md).

---

## 5. Acceptable use

When using the Services, you agree **not** to:

- use the Services for any unlawful purpose, or in violation of any applicable law or
  regulation;
- submit content that is illegal, infringing, defamatory, or that contains other
  people's personal or confidential information without authorisation;
- attempt to gain unauthorised access to, disrupt, overload, or impair the Services or
  the infrastructure they run on (including circumventing rate limits or the feedback
  form's anti-abuse measures);
- attempt to identify, de-anonymise, or uncover the operator's personal contact details
  through the email relay, or use the relay or feedback service to send spam, malware, or
  harassing content;
- misrepresent your identity or your affiliation in a way intended to deceive; or
- use the Services to build a competing dataset by automated scraping in a manner that
  burdens the infrastructure.

We may rate-limit, reject, remove, or decline to act on submissions, and may suspend
access, to protect the Services and other users.

---

## 6. Feedback submissions

If you use the feedback form or file an issue, the following applies **in addition to**
the acceptable-use rules above:

- **Your submission becomes public.** Feedback you submit is filed as a **public GitHub
  issue** at [github.com/PunchIn-App/punchin](https://github.com/PunchIn-App/punchin/issues),
  including any text and screenshots you provide and the coarse device/browser
  information the form collects. **Do not submit anything you would not want to be
  public**, including your time-tracking data, client information, credentials, or other
  people's personal information. (Your email address, if you provide one, is kept private
  and is not posted — see the Privacy Policy.)
- **Licence to your feedback.** You grant us a perpetual, worldwide, royalty-free,
  irrevocable, non-exclusive licence to use, reproduce, modify, publish, and incorporate
  your feedback (including any suggestions or ideas) into PunchIn or any other product,
  without obligation or compensation to you. You confirm you have the right to grant this
  and that your submission does not violate anyone else's rights.
- **No obligation.** We are under no obligation to respond to, act on, keep, or implement
  any feedback, and may close or delete issues at our discretion.

---

## 7. Software licences and open source

PunchIn's source code is open and published at
[github.com/PunchIn-App](https://github.com/PunchIn-App). Your rights to the **software
itself** (as opposed to the hosted Services) are governed by each repository's licence,
not by these Terms:

- **The PunchIn app** ([`punchin`](https://github.com/PunchIn-App/punchin)) is licensed
  under the **Business Source License 1.1 (BUSL-1.1)**. In short: **any individual may
  use the app to track their own time at no charge** (including for billable work);
  **organisational/commercial deployment** (for example, a company running it for its
  workforce) requires a separate commercial licence. The licence converts to
  **GNU AGPL-3.0** on the Change Date, **2 June 2030**. The full terms and the
  controlling Additional Use Grant are in the
  [LICENSE](https://github.com/PunchIn-App/punchin/blob/main/LICENSE) file. For a
  commercial licence, contact `licensing@trackmytime.today`.
- **The email relay** ([`punchin-email`](https://github.com/PunchIn-App/punchin-email))
  and **the feedback service**
  ([`punchin-feedback`](https://github.com/PunchIn-App/punchin-feedback)) are likewise
  licensed under the **Business Source License 1.1 (BUSL-1.1)**. In short: **any
  individual may self-host them at no charge** — the email relay for a domain they
  personally control, and the feedback service for a project or repository they
  personally control; **organisational deployment** (as part of a company's internal
  tooling, mail or support infrastructure, or operations) requires a separate
  commercial licence. Both convert to **GNU AGPL-3.0** on the same Change Date,
  **2 June 2030**. The controlling Additional Use Grants are in each repository's
  `LICENSE` file
  ([email relay](https://github.com/PunchIn-App/punchin-email/blob/main/LICENSE),
  [feedback service](https://github.com/PunchIn-App/punchin-feedback/blob/main/LICENSE));
  for a commercial licence, contact `licensing@trackmytime.today`.

If anything in these Terms appears to conflict with an applicable open-source licence as
to your use of the *source code*, the open-source licence governs the code.

---

## 8. Third-party services

The Services interact with third parties — Cloudflare (hosting, storage, email), GitHub
(public issues and optional sync), and, if you enable cloud sync, Google or Microsoft.
Your use of those services is governed by **their** terms and privacy policies. We are
not responsible for third-party services, and your dealings with them are between you and
them.

---

## 9. Intellectual property and trademarks

The PunchIn name, logo, brand mark, and wordmark are ours. The open-source licences above
grant you rights to the code; they **do not** grant you a right to use our name or branding
in a way that suggests endorsement of, or affiliation with, a fork or derivative product.
Please don't imply that a modified version is the official PunchIn.

---

## 10. Disclaimer of warranties

THE SERVICES ARE PROVIDED "**AS IS**" AND "**AS AVAILABLE**", WITHOUT WARRANTIES OF ANY
KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING (WITHOUT LIMITATION) THE IMPLIED
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, SECURE, OR
ERROR-FREE, THAT DATA WILL NOT BE LOST, OR THAT THE SERVICES WILL MEET YOUR REQUIREMENTS.
PunchIn is a time-tracking aid; **you are responsible for verifying the accuracy of any
time, totals, or invoices** you rely on. Some jurisdictions do not allow the exclusion of
certain warranties, so some of the above may not apply to you.

---

## 11. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL PunchIn-App OR ITS OPERATOR BE
LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR
ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATING TO YOUR USE OF
(OR INABILITY TO USE) THE SERVICES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR
TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICES WILL NOT EXCEED THE
GREATER OF (A) THE AMOUNT YOU PAID US TO USE THE SERVICES IN THE 12 MONTHS BEFORE THE CLAIM
(WHICH, FOR THE FREE SERVICES, IS ZERO) OR (B) USD $50. Some jurisdictions do not allow the
limitation of certain damages, so some of the above may not apply to you.

---

## 12. Indemnification

To the extent permitted by law, you agree to indemnify and hold harmless PunchIn-App and
its operator from any claims, damages, liabilities, and reasonable expenses arising out of
your misuse of the Services, your violation of these Terms, or your violation of any law or
the rights of a third party (including content you submit to the feedback service).

---

## 13. Changes to the Services and to these Terms

We may update these Terms from time to time. When we do, we will revise the "Effective
date" above and, for material changes, note them in the app's changelog. Changes take
effect when posted; **your continued use of the Services after a change means you accept the
revised Terms.** We may also change, suspend, or discontinue the Services as described in
[Section 3](#3-the-services-are-free-account-free-and-provided-as-is).

---

## 14. Termination

You may stop using the Services at any time. We may suspend or terminate your access to the
hosted Services at any time if you violate these Terms or to protect the Services. Because
the app is local-first, terminating the hosted Services does not delete the data on your
device. Sections that by their nature should survive termination (including
[6](#6-feedback-submissions), [9](#9-intellectual-property-and-trademarks),
[10](#10-disclaimer-of-warranties), [11](#11-limitation-of-liability),
[12](#12-indemnification), and [15](#15-governing-law-and-disputes)) will survive.

---

## 15. Governing law and disputes

These Terms are governed by the laws of the **Commonwealth of Massachusetts, United
States**, without regard to its conflict-of-laws rules. You and we agree that the state and
federal courts located in **Massachusetts** will have exclusive jurisdiction over any
dispute arising out of or relating to these Terms or the Services, and you consent to the
personal jurisdiction of those courts — except where applicable law gives you the right to
bring proceedings in your local courts (for example, certain consumer protections in the
EU/UK), which these Terms do not override.

---

## 16. Miscellaneous

- **Entire agreement.** These Terms and the Privacy Policy are the entire agreement between
  you and us regarding the Services, and supersede any prior agreements on that subject.
- **Severability.** If any provision is held unenforceable, the rest remains in effect, and
  the unenforceable provision will be limited to the minimum extent necessary.
- **No waiver.** Our failure to enforce a provision is not a waiver of it.
- **Assignment.** You may not assign these Terms without our consent; we may assign them in
  connection with a transfer of the project.
- **No partnership.** Nothing in these Terms creates an agency, partnership, or employment
  relationship between you and us.

---

## 17. Contact

Questions about these Terms: `contact@trackmytime.today`
Commercial licensing of the app: `licensing@trackmytime.today`
Privacy questions: [privacy@trackmytime.today](mailto:privacy@trackmytime.today)
Security reports: see the
[Security Policy](https://github.com/PunchIn-App/punchin/blob/main/SECURITY.md).

---

<!-- ============================================================
     DELETE EVERYTHING BELOW THIS LINE BEFORE PUBLISHING.
     These are open items for the human reviewer to resolve.
     ============================================================ 

## Notes for the reviewer

This section is **not part of the published Terms** — remove it once the items below are
resolved and the Terms have been reviewed by qualified counsel.

- [ ] **Have it reviewed by a lawyer.** This draft reflects how the Services work, but it is
      not legal advice. The warranty disclaimer, limitation of liability, indemnity, and
      governing-law clauses are jurisdiction-specific and must be checked for enforceability
      (especially against consumer-protection law in the EU/UK and in Massachusetts).
- [ ] **Entity vs individual.** This draft names "PunchIn-App" as an individual-operated
      project. If you form an entity, update the parties, the liability clauses, and the
      contact details.
- [ ] **Dispute resolution.** No mandatory arbitration or class-action waiver is included —
      these are powerful but easy to get wrong and are restricted/unenforceable in some
      places. Decide with counsel whether to add one; if so, it needs its own carefully
      drafted, conspicuous clause and an opt-out.
- [ ] **Liability cap.** The "$0 / USD $50" cap is a placeholder appropriate for a free
      service — confirm it's the figure you want and that it's enforceable in your
      jurisdiction.
- [ ] **Consumer law.** Confirm the mandatory consumer protections (and any required
      statutory language) for the markets you serve; the "as is" and liability sections may
      need carve-outs.
- [ ] **App-store terms.** If PunchIn is distributed via any app store, reconcile these Terms
      with that store's required terms (e.g. an EULA addendum, the store as a third-party
      beneficiary).
- [ ] **BUSL specifics.** Confirm the commercial-licence contact and process, and that the
      summary of the Additional Use Grant matches the controlling
      [LICENSE](https://github.com/PunchIn-App/punchin/blob/main/LICENSE) text exactly.
- [ ] **Effective date & banner.** Set the effective date on publish and remove the draft
      banner and this section.
- [ ] **Where it lives.** Committed in all three repositories; linked in-app from
      Settings → About. Keep copies in sync (or redirect to one canonical URL).
-->
