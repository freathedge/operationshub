-- Task 3: Add tasks.related_asset_id column
-- Applied 2026-09-03 14:54:00 (after create_assets)
alter table tasks add column related_asset_id uuid references assets(id);

create index tasks_related_asset_id_idx on tasks(related_asset_id);
