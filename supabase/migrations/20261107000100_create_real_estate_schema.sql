-- Initial schema for the public catalog and the future administrative area.
-- Review any existing remote schema before applying this migration.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254),
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_uidx on public.profiles (lower(email));

create table public.empreendimentos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 2 and 180),
  slug text not null unique check (
    char_length(slug) between 2 and 160
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  descricao text not null check (char_length(btrim(descricao)) between 10 and 12000),
  tipo text not null check (char_length(btrim(tipo)) between 2 and 80),
  finalidade text not null check (finalidade in ('venda', 'aluguel', 'lancamento')),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'publicado', 'arquivado')),
  endereco text check (endereco is null or char_length(endereco) <= 240),
  bairro text check (bairro is null or char_length(bairro) <= 120),
  cidade text check (cidade is null or char_length(cidade) <= 120),
  estado text check (estado is null or estado ~ '^[A-Z]{2}$'),
  metragem numeric(10, 2) check (metragem is null or metragem > 0),
  quartos smallint check (quartos is null or quartos >= 0),
  banheiros smallint check (banheiros is null or banheiros >= 0),
  vagas smallint check (vagas is null or vagas >= 0),
  preco numeric(14, 2) check (preco is null or preco >= 0),
  destaque boolean not null default false,
  descricao_seo text check (descricao_seo is null or char_length(descricao_seo) <= 320),
  video_url text check (
    video_url is null
    or video_url ~ '^https://(www[.])?(youtube[.]com/(watch[?]v=[A-Za-z0-9_-]{11}(&[^[:space:]]*)?|embed/[A-Za-z0-9_-]{11}|shorts/[A-Za-z0-9_-]{11})|youtu[.]be/[A-Za-z0-9_-]{11})$'
  ),
  video_ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empreendimentos_video_ativo_url_check
    check (not video_ativo or video_url is not null)
);

create index empreendimentos_publicados_destaque_idx
  on public.empreendimentos (destaque desc, created_at desc, id)
  where status = 'publicado';
create index empreendimentos_status_created_idx
  on public.empreendimentos (status, created_at desc, id);
create index empreendimentos_localizacao_idx
  on public.empreendimentos (cidade, bairro)
  where status = 'publicado';

create table public.empreendimento_imagens (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null
    references public.empreendimentos (id) on delete cascade,
  storage_path text not null unique
    check (char_length(storage_path) between 3 and 512),
  ordem integer not null default 0 check (ordem >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint empreendimento_imagens_ordem_unique
    unique (empreendimento_id, ordem)
);

create unique index empreendimento_imagens_cover_uidx
  on public.empreendimento_imagens (empreendimento_id)
  where is_cover;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  email text check (
    email is null
    or (
      char_length(email) <= 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
  ),
  telefone text not null check (
    char_length(telefone) between 8 and 24
    and telefone ~ '^[+()0-9 .-]+$'
  ),
  mensagem text not null check (char_length(btrim(mensagem)) between 5 and 2000),
  tipo_interesse text not null
    check (tipo_interesse in ('comprar', 'investir', 'empreendimento')),
  empreendimento_id uuid
    references public.empreendimentos (id) on delete set null,
  utm_source text check (utm_source is null or char_length(utm_source) <= 200),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 200),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 200),
  utm_content text check (utm_content is null or char_length(utm_content) <= 200),
  landing_page text check (landing_page is null or char_length(landing_page) <= 2048),
  referrer text check (referrer is null or char_length(referrer) <= 2048),
  status text not null default 'novo'
    check (status in ('novo', 'contatado', 'qualificado', 'convertido', 'arquivado')),
  created_at timestamptz not null default now()
);

create index leads_status_created_idx on public.leads (status, created_at desc);
create index leads_empreendimento_created_idx
  on public.leads (empreendimento_id, created_at desc)
  where empreendimento_id is not null;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger empreendimentos_set_updated_at
before update on public.empreendimentos
for each row execute function public.set_updated_at();

-- This SECURITY DEFINER helper avoids recursive profile RLS checks.
create function public.is_admin()
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

create function public.can_manage_catalog()
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
      and role in ('admin', 'editor')
  );
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_admin() from public;
revoke all on function public.can_manage_catalog() from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.can_manage_catalog() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.empreendimentos enable row level security;
alter table public.empreendimento_imagens enable row level security;
alter table public.leads enable row level security;

grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant select on public.empreendimentos to anon, authenticated;
grant insert, update, delete on public.empreendimentos to authenticated;
grant select on public.empreendimento_imagens to anon, authenticated;
grant insert, update, delete on public.empreendimento_imagens to authenticated;
revoke all on public.leads from anon, authenticated;
grant insert (
  nome,
  email,
  telefone,
  mensagem,
  tipo_interesse,
  empreendimento_id,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  landing_page,
  referrer
) on public.leads to anon, authenticated;
grant select, update, delete on public.leads to authenticated;

create policy "Profiles are visible to their owner or admins"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins manage profiles"
  on public.profiles for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Published developments are public"
  on public.empreendimentos for select to anon, authenticated
  using (status = 'publicado' or (select public.is_admin()));

create policy "Catalog managers manage developments"
  on public.empreendimentos for all to authenticated
  using ((select public.can_manage_catalog()))
  with check ((select public.can_manage_catalog()));

create policy "Published development images are visible"
  on public.empreendimento_imagens for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.empreendimentos e
      where e.id = empreendimento_imagens.empreendimento_id
        and e.status = 'publicado'
    )
  );

create policy "Catalog managers manage development images"
  on public.empreendimento_imagens for all to authenticated
  using ((select public.can_manage_catalog()))
  with check ((select public.can_manage_catalog()));

create policy "Visitors can submit new leads for published developments"
  on public.leads for insert to anon, authenticated
  with check (
    status = 'novo'
    and (
      empreendimento_id is null
      or exists (
        select 1
        from public.empreendimentos e
        where e.id = leads.empreendimento_id
          and e.status = 'publicado'
      )
    )
  );

create policy "Admins manage leads"
  on public.leads for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
