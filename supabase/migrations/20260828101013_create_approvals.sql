create type approval_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  approver_id uuid references profiles(id) on delete set null,
  status approval_status not null default 'pending',
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now()
);

create index approvals_request_id_idx on approvals(request_id);
create index approvals_approver_id_idx on approvals(approver_id);
