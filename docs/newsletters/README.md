# Newsletter implementation handoff

> **Current state: [redesign-plan.md](redesign-plan.md)** is implemented. Newsletter email sends for real, the Cloudflare note is one line on the Review and send page, the editor is BlockNote with Workers AI help, and every screen follows [redesign/mockups.html](redesign/mockups.html).
> Read [the operation guide](operations.md) for how it works today. The text below describes the first build and is out of date where it says email stays disabled.

The user selected a Cloudflare-only newsletter feature with a provider notice.
This package contains the design and implementation contracts for a GPT Sol agent.
The repository now contains the application code and its tests.
Read [the operation guide](operations.md) for setup and the API examples.

## Read order

1. Read [the product and interface design](design.md).
2. Read [the architecture and implementation plan](implementation.md).
3. Read [the operation guide](operations.md) for the implemented behavior and setup.

## Main decisions

- Add Newsletters within the existing project dashboard.
- Give each newsletter its own identity, posts, subscribers, and public archive.
- Use a visual editor with email, web, and plain text previews.
- Support subscriber forms, confirmation, CSV imports, tags, exports, and consent records.
- Support web publication and web schedules now.
- Keep newsletter email, test email, and email schedules disabled on the server.
- Keep Cloudflare as the only email provider.
- Preserve the exact provider quotation in the administrative notice.
- Prepare the future delivery engine with a test-only provider.
- Activate real newsletter delivery only through a later verified release.

## Agent prompt

Use this original prompt as a reference for a later implementation change:

> Implement the Flaresend newsletter feature from `docs/newsletters/design.md` and `docs/newsletters/implementation.md`.
> Read both documents before code changes.
> Complete stages S0–S7 with their acceptance tests.
> Preserve the current dashboard style and transactional API behavior.
> Use Cloudflare only.
> Show the exact provider notice from the design.
> Keep all real newsletter sends, newsletter test sends, and newsletter email schedules blocked on the server.
> Support real web publication and subscriber collection with fixed transactional confirmation emails.
> Test the future email engine with an isolated fake provider.
> Do not deploy or send live newsletter email.
> Report completed stages, verification results, and unresolved defects.

## Delivery boundary

The notice is not the only restriction.
The API, RPC, scheduler, queue consumer, and provider boundary must enforce the same capability.
The application must not automatically send saved content when the provider restriction ends.
The administrator must review each future delivery explicitly.

## Document verification

The design references the current repository structure and its existing email behavior.
The Cloudflare policy and relevant provider documentation were checked on 1 October 2026.
The mailer, dashboard, client, and shared contract tests passed.
The local browser test covered setup, the editor, previews, publication, CSV import, consent records, and reports.
The overview passed mobile, tablet, and desktop checks in the light and dark themes.
The dashboard production build and the Worker package build passed.
No remote migration, deployment, or newsletter delivery occurred.
