create or replace function public.can_manage_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.can_manage_catalog() from public;
grant execute on function public.can_manage_catalog() to anon, authenticated;
