create table activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create index activity_log_entity_idx on activity_log(entity_type, entity_id);
