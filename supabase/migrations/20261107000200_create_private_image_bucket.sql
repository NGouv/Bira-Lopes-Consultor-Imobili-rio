-- Private by design: the catalog issues signed URLs only for published images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empreendimento-imagens',
  'empreendimento-imagens',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
);

create policy "Published development images can be signed"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'empreendimento-imagens'
    and (
      (select public.can_manage_catalog())
      or exists (
        select 1
        from public.empreendimento_imagens ei
        join public.empreendimentos e on e.id = ei.empreendimento_id
        where ei.storage_path = storage.objects.name
          and e.status = 'publicado'
      )
    )
  );

create policy "Catalog managers upload development images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'empreendimento-imagens'
    and (select public.can_manage_catalog())
    and split_part(name, '/', 1) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.empreendimentos e
      where e.id = split_part(name, '/', 1)::uuid
    )
  );

create policy "Catalog managers update development images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'empreendimento-imagens'
    and (select public.can_manage_catalog())
  )
  with check (
    bucket_id = 'empreendimento-imagens'
    and (select public.can_manage_catalog())
  );

create policy "Catalog managers delete development images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'empreendimento-imagens'
    and (select public.can_manage_catalog())
  );
