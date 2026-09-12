create type asset_status as enum ('available', 'assigned', 'maintenance', 'retired', 'lost');

create table assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  asset_code text not null,
  name text not null,
  category text not null,
  status asset_status not null default 'available',
  assigned_to uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  purchase_info jsonb,
  warranty_info jsonb,
  created_at timestamptz not null default now(),

  unique (company_id, asset_code)
);

create index assets_company_id_idx on assets(company_id);
create index assets_assigned_to_idx on assets(assigned_to);
create index assets_department_id_idx on assets(department_id);
