-- Phase 3: open and click tracking.
ALTER TABLE emails ADD COLUMN track_opens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN track_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN open_token TEXT;
ALTER TABLE emails ADD COLUMN opened_at TEXT;
ALTER TABLE emails ADD COLUMN first_clicked_at TEXT;
CREATE UNIQUE INDEX emails_open_token ON emails(open_token) WHERE open_token IS NOT NULL;
ALTER TABLE projects ADD COLUMN track_opens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN track_clicks INTEGER NOT NULL DEFAULT 0;
CREATE TABLE email_links (
  id       TEXT PRIMARY KEY,                  -- short token, 16 base62
  email_id TEXT NOT NULL REFERENCES emails(id),
  url      TEXT NOT NULL,
  clicks   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX links_email ON email_links(email_id);
