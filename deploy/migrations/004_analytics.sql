-- 004 — First-party, cookieless analytics (Wikigai).
-- No cookies, no IP addresses, no emails. A visitor is a salted hash of
-- (IP + browser) whose salt changes every day, so a person cannot be followed
-- from one day to the next and the hash cannot be reversed.
-- Rows older than ANALYTICS_RETENTION_DAYS (default 395) are deleted daily.
CREATE TABLE IF NOT EXISTS analytics_events (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  day          DATE        NOT NULL DEFAULT CURRENT_DATE,
  visitor      TEXT        NOT NULL,            -- daily-rotating anonymous id
  type         TEXT        NOT NULL,            -- 'pageview' | 'event'
  name         TEXT,                            -- event name (null for pageviews)
  path         TEXT,                            -- page path, no query string
  ref_host     TEXT,                            -- external referrer host only
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  lang         TEXT,                            -- interface language at the time
  country      TEXT,                            -- from the browser's language region (e.g. es-ES → ES)
  device       TEXT,                            -- mobile | tablet | desktop
  browser      TEXT,
  os           TEXT,
  signed_in    BOOLEAN     NOT NULL DEFAULT false,
  props        JSONB       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_analytics_day        ON analytics_events (day);
CREATE INDEX IF NOT EXISTS idx_analytics_type_day   ON analytics_events (type, day);
CREATE INDEX IF NOT EXISTS idx_analytics_name_day   ON analytics_events (name, day) WHERE type = 'event';
CREATE INDEX IF NOT EXISTS idx_analytics_visitor    ON analytics_events (day, visitor);
