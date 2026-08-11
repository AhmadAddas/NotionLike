ALTER TABLE database_automations ADD COLUMN last_run_at timestamptz;
ALTER TABLE database_automations ADD COLUMN next_run_at timestamptz;
ALTER TABLE database_automations ADD COLUMN run_count integer NOT NULL DEFAULT 0;
CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES database_automations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
  affected_rows integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX automation_runs_automation_started ON automation_runs(automation_id,started_at DESC);
