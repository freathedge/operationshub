create type task_status as enum (
  'todo',
  'in_progress',
  'blocked',
  'completed',
  'cancelled'
);

create type task_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  assignee_id uuid references profiles(id) on delete set null,
  creator_id uuid not null references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  related_employee_id uuid references profiles(id) on delete set null,
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index tasks_company_id_idx on tasks(company_id);
create index tasks_assignee_id_idx on tasks(assignee_id);
create index tasks_department_id_idx on tasks(department_id);
create index tasks_status_idx on tasks(status);
