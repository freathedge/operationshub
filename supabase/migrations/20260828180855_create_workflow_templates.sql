create table workflow_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  slug text not null,
  name text not null,
  trigger_category request_category,
  created_at timestamptz not null default now(),
  unique (company_id, slug)
);

create index workflow_templates_company_id_idx on workflow_templates(company_id);
create index workflow_templates_trigger_category_idx on workflow_templates(trigger_category);
