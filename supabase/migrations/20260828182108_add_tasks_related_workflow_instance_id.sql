alter table tasks add column related_workflow_instance_id uuid references workflow_instances(id);

create index tasks_related_workflow_instance_id_idx on tasks(related_workflow_instance_id);
