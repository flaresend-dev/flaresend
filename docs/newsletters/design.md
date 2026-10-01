# Newsletter design

Date: 1 October 2026.
Status: Partly replaced. Read [redesign-plan.md](redesign-plan.md) first. It replaces section 2 (the provider notice and the blocked email actions), the editor in section 5D, and the screen layouts. Where the two documents disagree, redesign-plan.md wins.
Companion: [Implementation plan](implementation.md).

## 1. Product decision

Add a publication workspace inside each Flaresend project.
A person can create a newsletter, collect subscribers, write a post, and publish a public article.
The same post will support email delivery after Cloudflare permits newsletter email.

Use Cloudflare only.
Do not add another email provider.
Do not treat the current broadcast limit as permission to send newsletters.
Do not release a hidden switch that overrides the provider restriction.

The user requested a design for another agent to implement.
This document specifies the complete first release and its future delivery boundary.
The wireframes define the layout at sketch fidelity.
The existing dashboard defines the visual style; a new visual exploration is unnecessary.

### The first useful result

A person creates a publication and saves a first post without an API key, HTML, or a DNS change.
The application supplies a default layout and a public URL on the configured mailer host.
An administrator must configure that host before public publication becomes available.

The setup target is five minutes, excluding a domain setup or a subscriber import.
This is a product target, not a measured result.

### Release scope

| Available in the first release | Prepared, but disabled | Later releases |
| --- | --- | --- |
| Multiple publications per project | Newsletter email delivery | Paid subscriptions |
| Guided setup and a checklist | Newsletter test email | Referral rewards |
| Visual post editor and autosave | Newsletter email schedules | An advertisement marketplace |
| Email, web, and plain text previews | A promotional welcome email | Branching automation |
| Public home, archive, and articles | Email delivery reports | A custom website builder |
| Public subscription forms and confirmation | Real provider load tests for newsletters | Publication custom domains |
| Subscriber import, export, tags, and filters | Provider activation checks | A/B experiments |
| Immediate and scheduled web publication | | Paid content and podcasts |
| Subscriber and web-publication reports | | Team roles and approval workflows |

The first release includes a fixed subscription confirmation email.
The user initiates that email through a subscription request.
It contains the confirmation link and service information only.
It must not contain a post, a promotion, or editable welcome content.
It uses the existing transactional email service and a verified sender.

## 2. Provider notice and behavior

### Exact banner

Title: **Newsletter email is not available yet**

Quote:

> Email Service is intended only for transactional emails. We plan to support marketing emails and bulk sender tooling in the future

Attribution: Cloudflare Email Service.

Explanation: **Create drafts, collect subscribers, and publish on the web. Email delivery will become available after Cloudflare supports newsletters.**

Link label: **Read the Cloudflare policy**.
Link: <https://developers.cloudflare.com/email-service/reference/faq/>.

The quotation comes from the user and the Cloudflare FAQ.
Keep its words unchanged.
Do not show an estimated release date.

### Placement

- Show the full notice below the publication header on the overview and review pages.
- Show a compact notice above the editor canvas and on the delivery settings page.
- Use the compact text: **Newsletter email is unavailable. Web publication and drafts are available.**
- Let the compact notice open the full explanation.
- Keep the notice visible while the server reports `newsletterEmail: false`.
- Do not make the notice dismissible during this period.
- Do not show the administrative provider notice inside public articles or email previews.

Use the existing warning colors, a full border, a small information icon, and readable text.
Use a normal region with an accessible label.
Do not repeatedly announce a static notice through an assertive live region.

### Availability matrix

| Action | Current behavior |
| --- | --- |
| Create or edit a publication | Available |
| Write, duplicate, preview, or save a post | Available |
| Import subscribers with consent evidence | Available |
| Request a public subscription | Available after confirmation-email setup |
| Send a fixed subscription confirmation | Available through the transactional path |
| Publish or schedule a web article | Available after public-site setup |
| Send a newsletter test | Disabled |
| Send a newsletter now | Disabled |
| Schedule a newsletter email | Disabled |
| Enable a promotional welcome email | Disabled |
| Save a preferred future email date | Excluded; do not create a false schedule |

A disabled email control has visible explanatory text.
Do not rely on a tooltip on a disabled button.
The review page defaults to **Web only** while email remains unavailable.
The user must explicitly publish the web article.
A blocked email request must never silently publish an article instead.

The server returns `409 newsletter_email_unavailable` for a prohibited action.
It creates no delivery run, recipient row, email payload, or queue message for that action.

## 3. Product model and navigation

| User term | Meaning | Relationship |
| --- | --- | --- |
| Project | The existing ownership and API boundary | Contains publications and contacts |
| Newsletter | A named publication with a brand, subscribers, and posts | Belongs to one project |
| Post | One article or newsletter edition | Belongs to one publication |
| Subscriber | A contact with a subscription to this publication | Has publication-specific consent and status |
| Contact | The existing email address record | Can subscribe to several publications |
| Audience | The existing contact group | Can narrow a future recipient selection |
| Delivery | One immutable email run for a post | Contains a fixed recipient set |

Use **Newsletter** in navigation and **publication** in the internal model.
Use **Post** in the editor and article list.
Avoid separate records for an email edition and its matching web article.

Add **Newsletters** directly after **Broadcasts** in the existing sidebar.
Keep the existing project switcher, command palette, and mobile navigation.
Do not rename or remove the existing Broadcasts, Audiences, or Contacts pages.

The newsletter route contains these tabs:

1. Overview.
2. Posts.
3. Subscribers.
4. Website.
5. Reports.
6. Settings.

| Route | Purpose |
| --- | --- |
| `/{project}/newsletters` | Publication list |
| `/{project}/newsletters/new` | Setup flow |
| `/{project}/newsletters/{publicationId}` | Overview |
| `/{project}/newsletters/{publicationId}/posts` | Post list |
| `/{project}/newsletters/{publicationId}/posts/{postId}` | Editor |
| `/{project}/newsletters/{publicationId}/posts/{postId}/review` | Publication and delivery review |
| `/{project}/newsletters/{publicationId}/subscribers` | Subscriber table and filters |
| `/{project}/newsletters/{publicationId}/subscribers/{subscriptionId}` | Subscriber details |
| `/{project}/newsletters/{publicationId}/website` | Public layout and subscription form |
| `/{project}/newsletters/{publicationId}/reports` | Publication reports |
| `/{project}/newsletters/{publicationId}/settings` | Identity, sender, and data controls |
| `/all/newsletters/{project}` | Project selection within the All projects view |

Treat Newsletters as a per-project section in the All projects view.
Do not create a combined subscriber list across projects.
Preserve the current `link()` and `p()` navigation conventions.

## 4. Setup flow

Use a full page with three steps and a preview column.
Save each completed step.
An incomplete setup remains accessible from the publication list.
The Back action preserves the entered values.

### Step 1: Name your newsletter

Required: a name, a short description, and a public slug.
Optional: a logo.
Default: the project timezone, or the browser timezone if the project has none.
Show the selected IANA timezone beside the field.

- Name: 1–100 characters.
- Description: at most 300 characters.
- Slug: 1–63 lowercase letters, digits, or hyphens; start with a letter or digit.
- Public address: `{PUBLIC_BASE_URL}/n/{projectSlug}/{publicationSlug}`.
- Check the slug on the server within the project.
- Return an inline conflict if another publication claims the slug.

Primary action: **Continue**.
Do not require a sender or a subscriber list here.

### Step 2: Choose a layout

Offer three fixed layouts: **Letter**, **Digest**, and **Announcement**.
Use Letter as the default.
Each layout shows a real sample post with a sample title and body.
All layouts use the same supported content blocks.

Allow a logo, an accent color, a body font preset, and a footer name.
Use a small set of email-safe font stacks.
Do not introduce a freeform layout canvas or arbitrary CSS.
Check the contrast of button labels and links after an accent change.

Primary action: **Create newsletter**.
This action creates a draft publication with the selected defaults.

### Step 3: Prepare your first post

Show three actions: **Write a post**, **Import subscribers**, and **Set up subscriptions**.
Make Write a post the primary action.
The user can complete the other actions later from the overview checklist.

The checklist contains:

- Create the newsletter identity.
- Write the first post.
- Set up the public website.
- Set up the confirmation sender.
- Share a subscription form or import subscribers.

Show **Email delivery: unavailable from Cloudflare** outside the checklist.
Do not present an external provider restriction as an incomplete user task.

## 5. Screen specifications

### A. Publication list

Use a table after the first publication exists.
Columns: name, status, active subscribers, latest post, and last update.
Each row opens the overview.
Place **New newsletter** beside the page title.

The empty state says **Create your first newsletter**.
The explanation says **Set up a publication, write a post, and collect subscribers.**
Show one primary action, **Create newsletter**.
Place the provider notice below this explanation.

### B. Overview

Use the existing shell and its 1120px content limit.
Lead with the newsletter name, public-site link, and **Write a post** action.
Show the provider notice next.
Show the setup checklist until the available setup tasks are complete.

Below the checklist, show an active-subscriber count and a published-post count in one compact row.
Then show the latest draft, the next web publication, and a short recent-post table.
Do not create empty metric cards for unavailable email results.

```text
Existing sidebar | Field Notes                    [View site] [Write a post]
                 | Overview  Posts  Subscribers  Website  Reports  Settings
                 | [Newsletter email is not available yet ... Policy]
                 |
                 | Finish setup                           3 of 5 complete
                 | [Done] Identity     [Done] First draft
                 | [Open] Public site  [Open] Confirmation sender
                 |
                 | 128 active subscribers       4 published posts
                 |
                 | Continue your draft: A better release process   [Open]
                 | Next on the web: 8 Oct 2026, 09:00 SAST
                 |
                 | Recent posts                         [View all posts]
                 | Title              Web status       Email status
```

### C. Post list

Use tabs for All, Drafts, Scheduled, and Published.
These tabs refer to the web state or a saved draft; they do not merge email and web status.
Show separate **Web** and **Email** columns.
Email displays **Unavailable** when there is no run and the provider blocks delivery.

Columns: title, web state, email state, last update, and a row menu.
Actions: open, duplicate, archive, and delete draft.
Only a draft with no web schedule and no delivery history supports deletion.
A duplicate receives a new post ID, a new slug, and no publication or delivery state.

### D. Post editor

The editor has a quiet document canvas and a compact toolbar.
It must not expose raw HTML as the normal workflow.
Use the existing shell; allow the editor body to use the full content width.

The header contains breadcrumbs, the save state, **Preview**, and **Review**.
The document starts with the title and an optional subtitle.
The email subject defaults to the title until the user explicitly changes it.
The preview text is a separate optional field.
The email options remain editable while delivery is unavailable.

```text
Newsletters / Field Notes / New post     Saved 10:42   [Preview] [Review]
[Newsletter email is unavailable. Web publication and drafts are available.]

Write              Email details              Web details
-----------------------------------------------------------------------
 [Paragraph v] [B] [I] [Link] [List] [Image] [Button] [+ Add block]

                    A better release process
                    Optional subtitle

                    Hello {{first_name | default: "there"}},

                    Start your article here.
                    [+ Add block]

                    [Newsletter footer: managed by Flaresend]
```

The document syntax above is illustrative.
Store personalization as a typed node, not as user-authored template code.

Supported blocks: paragraph, H2, H3, ordered list, bullet list, quote, image, divider, and button.
Supported inline marks: bold, italic, link, and a personalization node.
Support undo, redo, paste cleanup, keyboard shortcuts, and accessible block movement.
Do not require a drag gesture to change the block order.

Image controls require an asset, alternative text, and optional caption and link.
A decorative image uses an explicit decorative option with empty alternative text.
Button controls require a label and an HTTPS URL.
Links can use HTTPS, HTTP, or mailto; reject script and data URLs.

Personalization supports first name and last name, each with a required fallback.
The public article always uses the fallback.
The first release excludes arbitrary contact fields and conditional content.
The managed footer supplies the publication name, postal address, and unsubscribe link in email output.
The editor cannot remove that footer from an email edition.
The public article footer contains the publication identity and subscription link instead.

Autosave starts 800ms after the last edit.
Show **Unsaved changes**, **Save in progress**, **Saved at 10:42**, or **Could not save. Retry.**
Use a revision number for every write.
A conflict offers **Reload saved version** and **Download my draft**; it never silently overwrites another edit.
Keep the unsaved document in memory after a failure.
Warn before navigation while unsaved changes exist.
Do not promise recovery after a browser crash in the first release.

### E. Preview

Open a full-height sheet with Email, Web, and Plain text tabs.
Email offers desktop and mobile widths, at 600px and 375px.
Web uses the same renderer as the public article.
The preview uses sample values by default.
An optional subscriber selector uses server-side authorization and never changes the draft.

A sandboxed iframe displays the email preview without scripts or forms.
Preview links do not record opens, clicks, or unsubscribe actions.
Use a harmless placeholder for the unsubscribe control.
Show **Send test email** as disabled with the provider explanation.

### F. Review and publish

Use a full page with a summary and explicit channel controls.
The page has four sections: Content, Readers, Channels, and Date.

```text
Review post                                              [Back to editor]
[Full Cloudflare notice]

Content      A better release process                    [Edit]
             Subject: A better release process
             Preview text: Three changes from this month

Readers      All active subscribers: 128                  [Change]
             6 unsubscribed; 2 suppressed; 4 pending
             This selection applies to future email delivery.

Channels     [x] Website     [ ] Email — unavailable

Date         (o) Publish now   ( ) Schedule web publication
             If scheduled: date, time, IANA timezone, UTC equivalent

Checks       [Pass] Title and body
             [Pass] Public address
             [Pass] Image descriptions

                                         [Publish on website]
```

Show only the relevant checks for the selected channel.
A missing email sender or postal address does not block web publication.
A missing public host blocks web publication with a setup link.
An empty eligible recipient set blocks email delivery after activation, but does not block web publication.

The publication button includes the chosen channel in its label.
For a scheduled article, use **Schedule on website**.
After success, show the public URL and **View article**.
State **No newsletter email was sent** while email remains unavailable.

A scheduled web post freezes its content revision.
Use **Cancel schedule and edit** to change that content.
A timezone change does not move an existing schedule.
Reject past times and nonexistent daylight-saving times.
For an ambiguous time, require the user to select the UTC offset.
Show the timezone and full date wherever a schedule appears.

After email activation, the review page supports Web only, Email only, and Web and email.
Each channel has an independent result.
A failed email delivery must not withdraw an already published article.
A failed web publication must not trigger another email run.

### G. Subscribers

Use the existing table, pagination, fields, and sheet components.
Show the count above the table and **Import CSV** as the primary action.
Offer **Copy subscription link** after the public form becomes available.

Columns: email, name, subscription status, tags, source, and subscription date.
Filters: status, tag, source, and subscription date range.
Combine different filter categories with AND.
Combine selected values within a category with OR.
Use the same filter schema for a future email recipient selector.
The first release uses ephemeral filters; saved segments can follow later.

The details page shows consent evidence and a subscription event timeline.
Actions: edit name, edit tags, unsubscribe, export, and delete personal data.
Do not offer an unrestricted **Mark subscribed** toggle.
Use a consent-backed import or a fresh confirmation request for subscription activation.

CSV flow: Upload → Map columns → Review → Import → Results.
The review shows new contacts, existing contacts, invalid rows, duplicates, and protected unsubscribe records.
The import requires a consent source and date or a documented source reference.
Existing unsubscribe records and suppressions take priority over an import.
Produce a row-level error download with CSV formula protection.

### H. Website and subscription form

Use a two-column settings page with a live preview.
Controls: title, description, logo, accent, archive visibility, and subscription form availability.
The default site stays private until the user selects **Publish website**.

The public site contains a publication header, a subscription form, and a chronological article list.
An article contains its title, subtitle, author label, publication date, body, and subscription link.
Use semantic HTML, a canonical URL, a page description, and an RSS feed of public posts.
Only published posts appear in the archive, feed, sitemap, or search metadata.

Public routes:

- `/n/{projectSlug}/{publicationSlug}`: home and archive.
- `/n/{projectSlug}/{publicationSlug}/p/{postSlug}`: article.
- `/n/{projectSlug}/{publicationSlug}/feed.xml`: RSS feed.
- `/n/{projectSlug}/{publicationSlug}/subscribe`: standalone form.
- `/n/{projectSlug}/{publicationSlug}/embed`: compact iframe form.

Provide an iframe snippet and a direct form link.
Do not expose an admin key or project API key in either.
The public form remains unavailable until the confirmation sender passes its checks.
Show **Subscriptions are not available yet** when setup remains incomplete.

The public form requires an email address and explicit consent text.
The first name is optional.
Show a generic result: **Check your inbox for a confirmation link.**
Use the same result for an existing subscriber.
The form must explain that newsletter email has not started yet.

A confirmation link opens a page with a **Confirm subscription** button.
A GET request does not activate the subscription.
This prevents link scanners from confirming subscriptions.
The POST consumes a single-use token and records consent.
After success, show **You are subscribed. Newsletter email will start when it becomes available.**

### I. Reports

Available reports: active subscribers, new subscriptions, unsubscribe count, source breakdown, and published posts.
Use a date filter with 7 days, 30 days, 90 days, and a custom range.
Use the publication timezone for daily boundaries.

Show an email-report placeholder with the provider notice.
Do not present missing email events as zero-percent performance.
The first release does not require website visitor analytics or cookies.

After activation, show accepted, delivered, bounced, failed, skipped, and unresolved recipient counts.
Also show unique opens, unique clicks, and unsubscribe counts.
Label opens as estimates; privacy tools and automated clients affect the signal.
Use accepted recipients as the denominator for open and click rates.
Show `—` when that denominator is zero.
Show the denominator and the last update time beside each rate.
Do not call provider acceptance inbox delivery.

### J. Settings

Groups: Identity, Appearance, Confirmation sender, Future email delivery, and Data.
Reuse the current domain setup flow for the sender.
Let the administrator set a from name, from address, reply-to address, and postal address.
Keep the sender domain status visible.

A publication archive action disables new subscriptions and future work.
It keeps existing public articles available unless the administrator separately unpublishes them.
Reject the archive action while a delivery has in-flight recipients after activation.
Offer cancellation first.

## 6. Visual and interaction rules

The existing Flaresend dashboard provides the primary visual reference.
Beehiiv provides the publication hierarchy and editor workflow reference.
The current Flaresend template preview provides the preview behavior reference.

The typical administrator prepares a weekly post at a desk and needs clear status information.
Preserve the chosen system, light, or dark theme.
Use restrained color, with orange for the existing brand accents.
Keep the current black or white primary button style.

Reuse Inter, JetBrains Mono, the 240px sidebar, and the existing 6px, 8px, and 12px radii.
Use 20px page titles, 15px section titles, and 13px application body text.
Use 16–18px document text inside the editor and public articles.
Use a 65–75 character measure for article paragraphs.
Do not add decorative gradients, large metric cards, or new display fonts.

At 1024px and above, show a document and optional settings column.
Below 1024px, move settings into tabs or a sheet.
Below 768px, use the existing mobile shell and full-width primary actions.
At 375px, the editor and review page must not require horizontal scrolling.
Wide subscriber tables can use the existing horizontal table container.

All controls require a visible focus state and an accessible label.
Every operation has pending, error, and success feedback.
Use skeletons for initial data fetches and inline errors for field failures.
Preserve the page and entered data after a network error.
Move focus to the first invalid field or an error summary after submission.
Use text with every status color.
Check contrast instead of assuming all current muted tokens meet the target.
Use a minimum 44px touch target for the main mobile actions.
Preserve the existing reduced-motion behavior.

### Required exceptional states

| State | Visible result | Recovery |
| --- | --- | --- |
| No publication | A short setup explanation | Create newsletter |
| No posts | A first-post prompt | Write a post |
| No subscribers | A form link and import action | Share or import |
| Provider unavailable | The persistent notice | Continue web work |
| Sender unverified | Domain status and setup link | Complete sender setup |
| Slug conflict | Field error | Enter another slug |
| Save conflict | Revision conflict message | Reload or download draft |
| Image upload failure | Failed asset state beside the block | Retry or remove |
| Invalid CSV rows | Counts and row errors | Download errors and retry |
| Schedule passed during review | Date error | Choose another time |
| Web scheduler delayed | Due time and delayed status | Retry through an idempotent action |
| A post is already published | Current public revision | Create and publish an update |
| The project is paused | Current pause notice | Resume through existing project controls |
| Confirmation expired | Neutral expiry page | Request another link |
| Unsubscribe link used twice | The same success page | No further action |
| Partial future email delivery | Per-outcome counts | Retry only known unsent recipients |

## 7. Sources and scope limits

The repository provides the implementation facts in the companion plan.
The proposed product behavior in this document is a design decision.
It is not a claim that these features already exist.

Cloudflare states that Email Service supports transactional email only.
The user selected a Cloudflare-only design with a temporary notice.
Source: [Cloudflare FAQ](https://developers.cloudflare.com/email-service/reference/faq/), checked 1 October 2026.

Beehiiv groups publication setup, newsletters, websites, subscribers, and automation in its product workflow.
This design uses that publication model as a reference.
It does not claim complete Beehiiv feature parity.
Source: [Beehiiv platform guide](https://www.beehiiv.com/support/article/14492955902359-getting-started-with-beehiiv-platform-walkthrough-tutorials-and-support-resources).

The implementation agent should use the Impeccable product, interaction, and accessibility guidance with the existing component system.
The agent must not replace this design with a general email builder or a new dashboard theme.
