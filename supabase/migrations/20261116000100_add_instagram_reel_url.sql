alter table public.empreendimentos
  add column reel_url text,
  add constraint empreendimentos_reel_url_check
    check (
      reel_url is null
      or (
        char_length(reel_url) <= 2048
        and reel_url ~ '^https://(www[.])?instagram[.]com/reel/[A-Za-z0-9_-]+/$'
      )
    );
