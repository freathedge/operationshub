alter table tasks add column related_request_id uuid references requests(id);

create index tasks_related_request_id_idx on tasks(related_request_id);
