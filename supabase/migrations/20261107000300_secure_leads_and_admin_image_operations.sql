-- Public lead submissions must pass Turnstile and server-side rate limiting.
drop policy "Visitors can submit new leads for published developments"
  on public.leads;
revoke insert, update, delete on public.leads from anon, authenticated;
grant update (status) on public.leads to authenticated;

create table public.lead_rate_limits (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  attempts integer not null default 0 check (attempts > 0),
  primary key (ip_hash, window_start)
);

alter table public.lead_rate_limits enable row level security;
revoke all on public.lead_rate_limits from public, anon, authenticated;

create function public.consume_public_lead_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_attempts integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit key';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from statement_timestamp()) / 900) * 900
  );

  insert into public.lead_rate_limits (ip_hash, window_start, attempts)
  values (p_ip_hash, v_window_start, 1)
  on conflict (ip_hash, window_start)
  do update set attempts = public.lead_rate_limits.attempts + 1
  returning attempts into v_attempts;

  delete from public.lead_rate_limits
  where window_start < v_window_start - interval '24 hours';

  return v_attempts <= 5;
end;
$$;

revoke all on function public.consume_public_lead_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_public_lead_rate_limit(text) to service_role;

create function public.set_empreendimento_cover(p_image_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_property_id uuid;
begin
  select empreendimento_id into v_property_id
  from public.empreendimento_imagens
  where id = p_image_id
  for update;

  if v_property_id is null then
    raise exception 'Image not found';
  end if;

  perform 1
  from public.empreendimentos
  where id = v_property_id
  for update;

  update public.empreendimento_imagens
  set is_cover = false
  where empreendimento_id = v_property_id
    and is_cover;

  update public.empreendimento_imagens
  set is_cover = true
  where id = p_image_id
    and empreendimento_id = v_property_id;
end;
$$;

create function public.reorder_empreendimento_images(
  p_empreendimento_id uuid,
  p_image_ids uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_image_count integer;
  v_selected_count integer;
  v_distinct_count integer;
  v_offset integer;
begin
  if p_image_ids is null or cardinality(p_image_ids) = 0 then
    raise exception 'Image order cannot be empty';
  end if;

  perform 1
  from public.empreendimentos
  where id = p_empreendimento_id
  for update;

  if not found then
    raise exception 'Development not found';
  end if;

  select count(*), coalesce(max(ordem), 0)
  into v_image_count, v_offset
  from public.empreendimento_imagens
  where empreendimento_id = p_empreendimento_id;

  select count(*), count(distinct image_id)
  into v_selected_count, v_distinct_count
  from unnest(p_image_ids) as selected(image_id)
  join public.empreendimento_imagens image
    on image.id = selected.image_id
   and image.empreendimento_id = p_empreendimento_id;

  if cardinality(p_image_ids) <> v_image_count
    or v_selected_count <> v_image_count
    or v_distinct_count <> v_image_count then
    raise exception 'Image order must contain every image exactly once';
  end if;

  v_offset := v_offset + v_image_count + 1;
  update public.empreendimento_imagens
  set ordem = ordem + v_offset
  where empreendimento_id = p_empreendimento_id;

  update public.empreendimento_imagens image
  set ordem = selected.ordinality - 1
  from unnest(p_image_ids) with ordinality as selected(image_id, ordinality)
  where image.id = selected.image_id
    and image.empreendimento_id = p_empreendimento_id;
end;
$$;

revoke all on function public.set_empreendimento_cover(uuid) from public, anon;
revoke all on function public.reorder_empreendimento_images(uuid, uuid[]) from public, anon;
grant execute on function public.set_empreendimento_cover(uuid) to authenticated;
grant execute on function public.reorder_empreendimento_images(uuid, uuid[]) to authenticated;

create function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role is distinct from new.role and (select auth.uid()) = old.id then
    raise exception 'Users cannot change their own administrative role';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_self_role_change() from public, anon, authenticated;
create trigger profiles_prevent_self_role_change
before update of role on public.profiles
for each row execute function public.prevent_self_role_change();
