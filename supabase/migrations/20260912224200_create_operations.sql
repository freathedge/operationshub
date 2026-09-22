create type operation_status as enum ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled');
create type operation_priority as enum ('low', 'medium', 'high', 'critical');

create table operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  owner_id uuid not null references profiles(id),
  department_id uuid references departments(id) on delete set null,
  status operation_status not null default 'planning',
  priority operation_priority not null default 'medium',
  start_date date,
  target_date date,
  created_at timestamptz not null default now()
);

create index operations_company_id_idx on operations(company_id);
create index operations_owner_id_idx on operations(owner_id);
create index operations_department_id_idx on operations(department_id);
