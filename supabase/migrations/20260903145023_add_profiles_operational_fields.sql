create type profile_status as enum ('active', 'inactive');

alter table profiles add column position_title text;
alter table profiles add column employee_number text;
alter table profiles add column location_id uuid references locations(id) on delete set null;
alter table profiles add column status profile_status not null default 'active';
alter table profiles add constraint profiles_employee_number_unique unique (company_id, employee_number);

create index profiles_location_id_idx on profiles(location_id);
