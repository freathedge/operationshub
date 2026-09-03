-- Task 4: Add workflow_template_steps.creates_asset column
-- Applied 2026-09-03 14:57:00 (after add_tasks_related_asset_id)
alter table workflow_template_steps add column creates_asset boolean not null default false;
