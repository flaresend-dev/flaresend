-- The dashboard's "All projects" view lists emails and events without a project filter. The (project_id, created_at)
-- indexes can't serve that sort, so without these D1 would sort the whole table on every page.
CREATE INDEX emails_created ON emails(created_at DESC, id DESC);
CREATE INDEX events_created ON email_events(created_at DESC, id DESC);
