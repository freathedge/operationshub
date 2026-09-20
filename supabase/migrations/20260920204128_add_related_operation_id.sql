alter table tasks add column related_operation_id uuid references operations(id) on delete set null;
alter table requests add column related_operation_id uuid references operations(id) on delete set null;
alter table assets add column related_operation_id uuid references operations(id) on delete set null;
alter table profiles add column related_operation_id uuid references operations(id) on delete set null;

create index tasks_related_operation_id_idx on tasks(related_operation_id);
create index requests_related_operation_id_idx on requests(related_operation_id);
create index assets_related_operation_id_idx on assets(related_operation_id);
create index profiles_related_operation_id_idx on profiles(related_operation_id);
