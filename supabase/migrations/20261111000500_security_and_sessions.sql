-- Shared PIN configuration, device sessions, and login throttling state.
-- PIN hashing and session-token hashing are performed by the trusted application server.

begin;

create table public.app_settings (
  singleton boolean primary key default true,
  pin_hash text,
  pin_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (singleton),
  constraint app_settings_pin_hash_length check (
    pin_hash is null or char_length(pin_hash) between 20 and 255
  ),
  constraint app_settings_pin_timestamp_consistent check (
    (pin_hash is null and pin_changed_at is null)
    or
    (pin_hash is not null and pin_changed_at is not null)
  )
);

insert into public.app_settings (singleton, pin_hash, pin_changed_at)
values (true, null, null);

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  device_token_hash text not null,
  session_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint device_sessions_device_hash_format check (device_token_hash ~ '^[0-9a-f]{64}$'),
  constraint device_sessions_session_hash_format check (session_token_hash ~ '^[0-9a-f]{64}$')
);

create unique index device_sessions_one_active_per_device_idx
  on public.device_sessions (device_token_hash)
  where revoked_at is null;

create index device_sessions_active_activity_idx
  on public.device_sessions (last_activity_at desc)
  where revoked_at is null;

create table public.login_attempts (
  id bigint generated always as identity primary key,
  device_token_hash text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now(),
  constraint login_attempts_device_hash_format check (device_token_hash ~ '^[0-9a-f]{64}$')
);

create index login_attempts_device_time_idx
  on public.login_attempts (device_token_hash, attempted_at desc);

create table public.login_throttle_state (
  device_token_hash text primary key,
  failed_attempts smallint not null default 0,
  lockout_level smallint not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint login_throttle_device_hash_format check (device_token_hash ~ '^[0-9a-f]{64}$'),
  constraint login_throttle_failed_attempts_range check (failed_attempts between 0 and 4),
  constraint login_throttle_lockout_level_nonnegative check (lockout_level >= 0)
);

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
alter table public.device_sessions enable row level security;
alter table public.login_attempts enable row level security;
alter table public.login_throttle_state enable row level security;

revoke all on table public.app_settings from public, anon, authenticated, service_role;
revoke all on table public.device_sessions from public, anon, authenticated, service_role;
revoke all on table public.login_attempts from public, anon, authenticated, service_role;
revoke all on table public.login_throttle_state from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.app_settings to service_role;
grant select, insert, update, delete on table public.device_sessions to service_role;
grant select, insert, update, delete on table public.login_attempts to service_role;
grant select, insert, update, delete on table public.login_throttle_state to service_role;

grant usage, select on sequence public.login_attempts_id_seq to service_role;

commit;
