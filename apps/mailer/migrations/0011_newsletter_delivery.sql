-- Real newsletter delivery: per-run counts come from the emails rows, found through newsletter_run_id.
CREATE INDEX emails_newsletter_run ON emails(newsletter_run_id, status) WHERE newsletter_run_id IS NOT NULL;
CREATE INDEX newsletter_runs_post ON newsletter_email_runs(post_id, created_at DESC);
CREATE INDEX newsletter_runs_publication ON newsletter_email_runs(publication_id, created_at DESC, id DESC);
ALTER TABLE newsletter_email_runs ADD COLUMN total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_email_runs ADD COLUMN schedule_timezone TEXT;
ALTER TABLE newsletter_email_runs ADD COLUMN subject TEXT NOT NULL DEFAULT '';
-- Voice and style notes the AI reads before writing for this publication.
ALTER TABLE publications ADD COLUMN ai_instructions TEXT NOT NULL DEFAULT '';
