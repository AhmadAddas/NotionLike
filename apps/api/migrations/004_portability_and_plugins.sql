CREATE TABLE workspace_plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plugin_key text NOT NULL, name text NOT NULL, version text NOT NULL, manifest jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true, installed_by uuid NOT NULL REFERENCES users(id), installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, plugin_key)
);
CREATE TABLE page_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, icon text, content jsonb NOT NULL DEFAULT '{}', created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
