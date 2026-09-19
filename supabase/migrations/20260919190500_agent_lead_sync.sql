create or replace function public.submit_agent_lead(p_lead jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_agent_id text;
  v_leads jsonb;
  v_lead_id text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select data into v_state
  from public.platform_state
  where id = 'shared'
  for update;

  if v_state is null then
    raise exception 'Shared Admin records are unavailable.';
  end if;

  select agent->>'id' into v_agent_id
  from jsonb_array_elements(coalesce(v_state->'agents', '[]'::jsonb)) agent
  where agent->>'accountId' = auth.uid()::text
    and coalesce(agent->>'status', '') <> 'suspended'
  limit 1;

  if v_agent_id is null then
    raise exception 'This login is not linked to an active Field Agent in Admin.';
  end if;

  v_lead_id := p_lead->>'id';
  if coalesce(v_lead_id, '') = '' then
    raise exception 'The lead reference is missing.';
  end if;

  v_leads := coalesce(v_state->'leads', '[]'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_leads) lead where lead->>'id' = v_lead_id) then
    v_leads := jsonb_build_array(
      jsonb_build_object(
        'id', v_lead_id,
        'school', coalesce(p_lead->>'school', ''),
        'contactName', coalesce(p_lead->>'contactName', ''),
        'phone', coalesce(p_lead->>'phone', ''),
        'stage', coalesce(p_lead->>'stage', 'contacted'),
        'agentId', v_agent_id,
        'createdAt', coalesce((p_lead->>'createdAt')::bigint, (extract(epoch from now()) * 1000)::bigint),
        'notes', '[]'::jsonb,
        'queued', false
      )
    ) || v_leads;

    update public.platform_state
    set data = jsonb_set(v_state, '{leads}', v_leads, true), updated_at = now()
    where id = 'shared';
  end if;

  return jsonb_build_object('ok', true, 'agentId', v_agent_id);
end;
$$;

revoke all on function public.submit_agent_lead(jsonb) from public;
grant execute on function public.submit_agent_lead(jsonb) to authenticated;
