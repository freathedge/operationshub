-- Task 5: Add workflow_instances.related_employee_id column
-- Applied 2026-09-03 14:58:00 (after add_workflow_template_steps_creates_asset)
alter table workflow_instances add column related_employee_id uuid references profiles(id);

create index workflow_instances_related_employee_id_idx on workflow_instances(related_employee_id);
