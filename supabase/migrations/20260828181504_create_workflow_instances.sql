create type workflow_instance_status as enum ('in_progress', 'completed');

create table workflow_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  template_id uuid not null references workflow_templates(id),
  related_request_id uuid references requests(id) on delete cascade,
  status workflow_instance_status not null default 'in_progress',
  created_at timestamptz not null default now()
);

create index workflow_instances_company_id_idx on workflow_instances(company_id);
create index workflow_instances_related_request_id_idx on workflow_instances(related_request_id);
