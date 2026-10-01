# Flaresend product context

## Register

product

## Users

Developers deploy Flaresend in their own Cloudflare accounts.
Project administrators manage email through the dashboard.
The newsletter extension will let a small team manage a publication without HTML knowledge.

## Product purpose

Flaresend provides an email API and an administration interface.
The service uses Cloudflare Workers, D1, R2, and Queues.
The newsletter extension adds publication setup, posts, subscribers, and a public archive.

## Brand personality

Direct, familiar, precise.
The current dashboard provides the visual reference.
Beehiiv provides a reference for the publication workflow.

## Anti-references

- A separate dashboard with a different visual system.
- A code editor as the default newsletter editor.
- Hand-built text editing controls where a well-known editor library exists.
- A warning banner repeated on every page.
- A large set of controls before the first useful result.
- A success message that implies delivery before the provider accepts the email.

## Design principles

- Keep the project as the ownership boundary.
- Make the next useful action clear.
- Preserve a draft when a service fails.
- Show the difference between a website publication and an email delivery.
- Do not police how a person sends. Block an action only for a technical reason, and say the reason.
- AI writes suggestions. A person keeps or discards each one.

## Accessibility and inclusion

The proposed newsletter interface targets WCAG 2.2 AA.
It supports a keyboard, reduced motion, and the existing light and dark themes.
The current implementation does not establish full conformance.

## Newsletter decision

The user selected Cloudflare as the email provider on 1 October 2026.
Later the same day the user decided that Flaresend does not block newsletter email. Users are free to send how they please.
The interface shows one short line about Cloudflare's transactional-email policy, with a link to the Cloudflare docs, only where a person sends: the newsletter Review and send page and the broadcast composer.
Broadcasts follow the same rule (decided 1 October 2026): no on/off switch and no recipient cap by default.
The post editor uses a well-known editor library, not hand-built controls, and Workers AI helps draft posts.
See `docs/newsletters/redesign-plan.md` for the current plan and `docs/newsletters/redesign/mockups.html` for the screens.
