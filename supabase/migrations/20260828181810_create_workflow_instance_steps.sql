create type workflow_instance_step_status as enum ('pending', 'in_progress', 'completed');

create table workflow_instance_steps (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references workflow_instances(id) on delete cascade,
  template_step_id uuid not null references workflow_template_steps(id),
  step_order int not null,
  status workflow_instance_step_status not null default 'pending',
  generated_task_id uuid references tasks(id),
  generated_approval_id uuid references approvals(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (instance_id, step_order)
);

create index workflow_instance_steps_instance_id_idx on workflow_instance_steps(instance_id);
create index workflow_instance_steps_generated_task_id_idx on workflow_instance_steps(generated_task_id);
create index workflow_instance_steps_generated_approval_id_idx on workflow_instance_steps(generated_approval_id);
