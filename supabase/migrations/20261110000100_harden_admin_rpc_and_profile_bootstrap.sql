-- Require an admin role inside every catalog-management RPC.
create or replace function public.set_empreendimento_cover(p_image_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_property_id uuid;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;

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

create or replace function public.reorder_empreendimento_images(
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
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;

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

-- Only a trusted SQL Editor/bootstrap context or an existing admin may assign admin.
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.role is distinct from new.role
      and (select auth.uid()) = old.id then
      raise exception 'Users cannot change their own administrative role'
        using errcode = '42501';
    end if;
  end if;

  if new.role = 'admin'
    and (select auth.uid()) is not null
    and not coalesce((select public.is_admin()), false) then
    raise exception 'Only an existing admin can assign the admin role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger profiles_prevent_self_role_change on public.profiles;
create trigger profiles_prevent_self_role_change
before update of role on public.profiles
for each row execute function public.prevent_self_role_change();

create trigger profiles_prevent_self_admin_insert
before insert on public.profiles
for each row execute function public.prevent_self_role_change();
