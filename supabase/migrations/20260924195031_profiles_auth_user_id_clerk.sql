alter table profiles drop constraint profiles_auth_user_id_fkey;
alter table profiles alter column auth_user_id type text using auth_user_id::text;
alter table profiles alter column auth_user_id drop not null;
