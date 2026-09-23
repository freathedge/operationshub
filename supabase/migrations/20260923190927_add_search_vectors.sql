alter table profiles add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(full_name, ''))) stored;
create index profiles_search_vector_idx on profiles using gin(search_vector);

alter table tasks add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
create index tasks_search_vector_idx on tasks using gin(search_vector);

alter table requests add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
create index requests_search_vector_idx on requests using gin(search_vector);

alter table assets add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(category, ''))) stored;
create index assets_search_vector_idx on assets using gin(search_vector);

alter table operations add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
create index operations_search_vector_idx on operations using gin(search_vector);

alter table workflow_templates add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(name, ''))) stored;
create index workflow_templates_search_vector_idx on workflow_templates using gin(search_vector);
