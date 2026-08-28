create type workflow_step_type as enum ('task', 'approval');

create table workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references workflow_templates(id) on delete cascade,
  step_order int not null,
  step_type workflow_step_type not null,
  title text not null,
  description text,
  responsible_role user_role,
  responsible_department_name text,
  unique (template_id, step_order)
);

create index workflow_template_steps_template_id_idx on workflow_template_steps(template_id);
