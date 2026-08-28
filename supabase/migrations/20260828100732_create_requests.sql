create type request_category as enum (
  'equipment',
  'software',
  'access',
  'maintenance',
  'purchase',
  'hr',
  'general',
  'other'
);

create type request_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'in_progress',
  'completed'
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  category request_category not null,
  status request_status not null default 'draft',
  created_by uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index requests_company_id_idx on requests(company_id);
create index requests_status_idx on requests(status);
create index requests_created_by_idx on requests(created_by);
create index requests_department_id_idx on requests(department_id);
