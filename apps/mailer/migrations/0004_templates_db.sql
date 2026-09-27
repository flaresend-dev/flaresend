-- Phase 3: D1-stored templates with version history.
CREATE TABLE templates (
  id          TEXT PRIMARY KEY,               -- tmpl_...
  project_id  TEXT NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,                  -- slug used in send(): "order-shipped"
  subject     TEXT NOT NULL,                  -- may contain {{vars}}
  html        TEXT NOT NULL,
  text        TEXT,
  variables   TEXT,                           -- JSON array of {name, required, example}
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(project_id, name)
);
CREATE TABLE template_versions (             -- append-only history
  template_id TEXT NOT NULL,
  version     INTEGER NOT NULL,
  subject     TEXT NOT NULL,
  html        TEXT NOT NULL,
  text        TEXT,
  variables   TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (template_id, version)
);
ALTER TABLE emails ADD COLUMN template_version INTEGER;
