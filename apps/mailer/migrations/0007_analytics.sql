-- Phase 3: daily analytics rollup. The row (project_id='_all', metric='_done') marks a day as rolled up.
CREATE TABLE analytics_daily (
  project_id TEXT NOT NULL,
  day        TEXT NOT NULL,
  metric     TEXT NOT NULL,                   -- sent|delivered|deferred|bounced|complained|rejected|failed|opened|clicked|_done
  count      INTEGER NOT NULL,
  PRIMARY KEY (project_id, day, metric)
);
