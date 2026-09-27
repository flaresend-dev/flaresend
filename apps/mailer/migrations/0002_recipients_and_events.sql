-- Phase 1: recipients, timeline, orphans, suppressions, daily counters.

-- One row per recipient. Cloudflare delivery events are per recipient, so status must be tracked here.
CREATE TABLE email_recipients (
  id            TEXT PRIMARY KEY,              -- rcpt_...
  email_id      TEXT NOT NULL REFERENCES emails(id),
  address       TEXT NOT NULL,                 -- lowercase
  kind          TEXT NOT NULL CHECK (kind IN ('to','cc','bcc')),
  status        TEXT NOT NULL,                 -- queued|sent|delivered|deferred|bounced|complained|rejected|failed|test|canceled
  provider      TEXT,                          -- "gmail", "external_smtp"...
  smtp_status   TEXT,
  smtp_response TEXT,
  delivery_ms   INTEGER,
  bounce_type   TEXT,                          -- hard|soft
  last_event_at TEXT,
  UNIQUE(email_id, address)
);
CREATE INDEX recipients_email ON email_recipients(email_id);
CREATE INDEX recipients_address ON email_recipients(address);

-- Timeline. Both our own lifecycle events and Cloudflare's delivery events go here.
CREATE TABLE email_events (
  id                   TEXT PRIMARY KEY,       -- evt_...
  email_id             TEXT NOT NULL REFERENCES emails(id),
  project_id           TEXT NOT NULL,
  recipient            TEXT,                   -- NULL for email-level events
  type                 TEXT NOT NULL,          -- email.queued|email.sent|email.retrying|email.delivered|...
  cloudflare_event_id  TEXT UNIQUE,            -- payload.eventId; dedupe on redelivery
  data                 TEXT,                   -- JSON
  created_at           TEXT NOT NULL           -- eventTimestamp from Cloudflare, or now() for ours
);
CREATE INDEX events_email ON email_events(email_id, created_at);
CREATE INDEX events_project_created ON email_events(project_id, created_at DESC);

-- Events that arrived before we knew the messageId. Retried by the consumer, then parked here.
CREATE TABLE orphan_events (
  cloudflare_event_id   TEXT PRIMARY KEY,
  cloudflare_message_id TEXT NOT NULL,
  raw                   TEXT NOT NULL,
  received_at           TEXT NOT NULL
);
CREATE INDEX orphan_message ON orphan_events(cloudflare_message_id);

-- Local mirror of addresses Cloudflare told us hard-bounced or complained.
CREATE TABLE suppressions (
  address         TEXT PRIMARY KEY,           -- lowercase
  reason          TEXT NOT NULL,              -- hard_bounce|complaint|manual
  source_email_id TEXT,
  created_at      TEXT NOT NULL
);

-- Per-project daily counters (UTC day). Used for daily_limit.
CREATE TABLE daily_counts (
  project_id TEXT NOT NULL,
  day        TEXT NOT NULL,                    -- "2026-09-25"
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, day)
);
