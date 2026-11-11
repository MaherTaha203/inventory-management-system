-- Atomic PIN throttling and device-session lifecycle routines.

begin;

create or replace function public.initialize_shared_pin(p_pin_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_affected integer;
begin
  if p_pin_hash !~ '^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    raise exception using errcode = '22023', message = 'PIN hash format is invalid.';
  end if;

  update public.app_settings
    set pin_hash = p_pin_hash,
        pin_changed_at = now()
    where singleton = true and pin_hash is null;

  get diagnostics v_affected = row_count;
  return v_affected = 1;
end;
$function$;

create or replace function public.record_pin_attempt(
  p_device_token_hash text,
  p_pin_valid boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_state public.login_throttle_state%rowtype;
  v_next_failures smallint;
  v_next_level smallint;
  v_blocked_until timestamptz;
begin
  if p_device_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Device token hash format is invalid.';
  end if;

  insert into public.login_throttle_state (device_token_hash)
  values (p_device_token_hash)
  on conflict (device_token_hash) do nothing;

  select *
    into v_state
    from public.login_throttle_state
    where device_token_hash = p_device_token_hash
    for update;

  if v_state.blocked_until is not null and v_state.blocked_until > now() then
    return jsonb_build_object(
      'allowed', false,
      'pin_valid', false,
      'blocked_until', v_state.blocked_until,
      'remaining_attempts', 0
    );
  end if;

  if p_pin_valid then
    insert into public.login_attempts (device_token_hash, succeeded)
    values (p_device_token_hash, true);

    update public.login_throttle_state
      set failed_attempts = 0,
          lockout_level = 0,
          blocked_until = null,
          updated_at = now()
      where device_token_hash = p_device_token_hash;

    return jsonb_build_object(
      'allowed', true,
      'pin_valid', true,
      'blocked_until', null,
      'remaining_attempts', 5
    );
  end if;

  insert into public.login_attempts (device_token_hash, succeeded)
  values (p_device_token_hash, false);

  v_next_failures := v_state.failed_attempts + 1;

  if v_next_failures >= 5 then
    v_next_level := v_state.lockout_level + 1;
    v_blocked_until := now() + case
      when v_next_level = 1 then interval '1 minute'
      when v_next_level = 2 then interval '5 minutes'
      when v_next_level = 3 then interval '15 minutes'
      else interval '30 minutes'
    end;

    update public.login_throttle_state
      set failed_attempts = 0,
          lockout_level = v_next_level,
          blocked_until = v_blocked_until,
          updated_at = now()
      where device_token_hash = p_device_token_hash;

    return jsonb_build_object(
      'allowed', false,
      'pin_valid', false,
      'blocked_until', v_blocked_until,
      'remaining_attempts', 0
    );
  end if;

  update public.login_throttle_state
    set failed_attempts = v_next_failures,
        updated_at = now()
    where device_token_hash = p_device_token_hash;

  return jsonb_build_object(
    'allowed', true,
    'pin_valid', false,
    'blocked_until', null,
    'remaining_attempts', 5 - v_next_failures
  );
end;
$function$;

create or replace function public.create_device_session(
  p_device_token_hash text,
  p_session_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session_id uuid;
  v_active_count integer;
begin
  if p_device_token_hash !~ '^[0-9a-f]{64}$'
     or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Session token hash format is invalid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20261111, 1);

  update public.device_sessions
    set revoked_at = now()
    where device_token_hash = p_device_token_hash
      and revoked_at is null;

  select count(*)::integer
    into v_active_count
    from public.device_sessions
    where revoked_at is null;

  if v_active_count >= 3 then
    return jsonb_build_object(
      'created', false,
      'reason', 'device_limit',
      'active_devices', v_active_count
    );
  end if;

  insert into public.device_sessions (
    device_token_hash,
    session_token_hash
  )
  values (
    p_device_token_hash,
    p_session_token_hash
  )
  returning id into v_session_id;

  return jsonb_build_object(
    'created', true,
    'session_id', v_session_id,
    'active_devices', v_active_count + 1
  );
end;
$function$;

create or replace function public.validate_device_session(
  p_session_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_affected integer;
begin
  if p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.device_sessions
    set last_activity_at = now()
    where session_token_hash = p_session_token_hash
      and revoked_at is null
      and last_activity_at >= now() - interval '10 minutes';

  get diagnostics v_affected = row_count;
  return v_affected = 1;
end;
$function$;

create or replace function public.revoke_device_session(
  p_session_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_affected integer;
begin
  update public.device_sessions
    set revoked_at = now()
    where session_token_hash = p_session_token_hash
      and revoked_at is null;

  get diagnostics v_affected = row_count;
  return v_affected = 1;
end;
$function$;

create or replace function public.change_shared_pin(
  p_expected_pin_hash text,
  p_new_pin_hash text,
  p_current_session_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_affected integer;
begin
  if p_new_pin_hash !~ '^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$'
     or p_current_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'PIN or session hash format is invalid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20261111, 1);

  if not exists (
    select 1
      from public.device_sessions
      where session_token_hash = p_current_session_hash
        and revoked_at is null
        and last_activity_at >= now() - interval '10 minutes'
  ) then
    return false;
  end if;

  update public.app_settings
    set pin_hash = p_new_pin_hash,
        pin_changed_at = now()
    where singleton = true
      and pin_hash = p_expected_pin_hash;

  get diagnostics v_affected = row_count;

  if v_affected <> 1 then
    return false;
  end if;

  update public.device_sessions
    set revoked_at = now()
    where revoked_at is null
      and session_token_hash <> p_current_session_hash;

  update public.device_sessions
    set last_activity_at = now()
    where session_token_hash = p_current_session_hash;

  return true;
end;
$function$;

revoke all on function public.initialize_shared_pin(text) from public, anon, authenticated, service_role;
revoke all on function public.record_pin_attempt(text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.create_device_session(text, text) from public, anon, authenticated, service_role;
revoke all on function public.validate_device_session(text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_device_session(text) from public, anon, authenticated, service_role;
revoke all on function public.change_shared_pin(text, text, text) from public, anon, authenticated, service_role;

grant execute on function public.initialize_shared_pin(text) to service_role;
grant execute on function public.record_pin_attempt(text, boolean) to service_role;
grant execute on function public.create_device_session(text, text) to service_role;
grant execute on function public.validate_device_session(text) to service_role;
grant execute on function public.revoke_device_session(text) to service_role;
grant execute on function public.change_shared_pin(text, text, text) to service_role;

commit;
