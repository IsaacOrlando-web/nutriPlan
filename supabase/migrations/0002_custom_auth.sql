alter table if exists app_users drop column if exists clerk_id;
alter table if exists app_users add column if not exists password_hash text;
alter table if exists app_users add column if not exists email_verified boolean not null default false;
alter table if exists app_users add column if not exists verification_token_hash text;
alter table if exists app_users add column if not exists verification_expires_at timestamptz;
delete from app_users where email is null or password_hash is null;
alter table if exists app_users alter column email set not null;
alter table if exists app_users alter column password_hash set not null;
create unique index if not exists app_users_email_lower_idx on app_users (lower(email));
