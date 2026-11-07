create index empreendimentos_updated_at_idx
  on public.empreendimentos (updated_at desc, id);

create index leads_created_at_idx
  on public.leads (created_at desc, id);
