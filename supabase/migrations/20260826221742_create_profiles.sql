create type user_role as enum (
  'employee',
  'manager',
  'operations_manager',
  'it',
  'hr',
  'admin'
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  department_id uuid references departments(id) on delete set null,
  manager_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index profiles_company_id_idx on profiles(company_id);
create index profiles_department_id_idx on profiles(department_id);
