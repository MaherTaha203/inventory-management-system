-- Reclaim abandoned device sessions before enforcing the three-device limit.
-- The same 10-minute inactivity threshold is used by validate_device_session.

begin;

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
    where revoked_at is null
      and last_activity_at < now() - interval '10 minutes';

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

revoke all on function public.create_device_session(text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_device_session(text, text) to service_role;

commit;
