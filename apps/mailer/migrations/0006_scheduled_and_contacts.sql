-- Phase 3: scheduled sends, contacts, audiences, broadcasts.
ALTER TABLE emails ADD COLUMN enqueued_at TEXT;
CREATE INDEX emails_scheduled ON emails(status, scheduled_at) WHERE status = 'scheduled';
ALTER TABLE projects ADD COLUMN broadcasts_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE contacts (
  id           TEXT PRIMARY KEY,              -- ct_...
  project_id   TEXT NOT NULL REFERENCES projects(id),
  email        TEXT NOT NULL,
  first_name   TEXT,
  last_name    TEXT,
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  data         TEXT,                          -- JSON
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE(project_id, email)
);
CREATE TABLE audiences (
  id         TEXT PRIMARY KEY,                -- aud_...
  project_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, name)
);
CREATE TABLE audience_contacts (
  audience_id TEXT NOT NULL,
  contact_id  TEXT NOT NULL,
  PRIMARY KEY (audience_id, contact_id)
);
CREATE TABLE broadcasts (
  id           TEXT PRIMARY KEY,              -- bc_...
  project_id   TEXT NOT NULL,
  audience_id  TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name    TEXT,
  subject      TEXT NOT NULL,
  html         TEXT NOT NULL,
  text         TEXT,
  status       TEXT NOT NULL,                 -- draft|scheduled|sending|sent|canceled
  scheduled_at TEXT,
  started_at   TEXT,
  completed_at TEXT,
  cursor       TEXT,                          -- last contact id processed (resume point)
  total        INTEGER NOT NULL DEFAULT 0,
  sent         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX broadcasts_project ON broadcasts(project_id, created_at DESC);
CREATE INDEX broadcasts_status ON broadcasts(status);
