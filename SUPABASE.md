# Supabase, catálogo e painel

## Arquitetura

- `index.html`, `imovel.html` e `styles.css` preservam o site público. `script.js` encaminha a execução para `src/public.js`, que busca o catálogo sem inserir texto cadastrado com `innerHTML`.
- `admin.html` e `src/admin.js` implementam login, dashboard, gestão paginada de empreendimentos e, para administradores, contatos. A proteção real é RLS no banco, não a interface.
- `src/config/supabaseClient.js` cria o cliente apenas quando solicitado e exige variáveis públicas.
- `src/services/` separa consulta pública, consulta administrativa, autenticação, envio de leads, imagens, Storage e validações.
- As migrations em `supabase/migrations/` incluem o schema inicial, o bucket privado e as regras/RPCs auxiliares da aplicação.
- `supabase/functions/submit-lead/` é o único caminho público para gravar leads. Ele verifica Turnstile, limita requisições e usa a chave administrativa apenas no servidor da Edge Function.
- Vite gera `index.html`, `imovel.html` e `admin.html` no diretório `dist`.

## Dados e segurança

| Tabela | Acesso |
| --- | --- |
| `profiles` | Um usuário pode ler seu perfil; administradores gerenciam perfis. Um usuário não pode alterar sua própria função. |
| `empreendimentos` | Público lê apenas `publicado`; somente `admin` gerencia o catálogo. |
| `empreendimento_imagens` | Visitantes assinam imagens de empreendimentos publicados; somente `admin` gerencia imagens. |
| `leads` | Só `admin` consulta e altera a situação; visitantes não têm `INSERT` direto. A Edge Function valida e insere no servidor. |
| `lead_rate_limits` | Sem acesso público ou autenticado. A função de limite só pode ser executada por `service_role`. Guarda HMAC do IP em janelas de 15 minutos, não o IP em texto claro. |

O catálogo público usa paginação de seis empreendimentos por página. O painel usa páginas de 25. Conteúdo não confiável é renderizado em nós de texto; URLs de vídeo são validadas e convertidas para `youtube-nocookie.com`.

Despublicar ou arquivar preserva o registro. Exclusão física só está disponível no painel após confirmação e tenta remover imagens do Storage antes de excluir o empreendimento. Se a remoção do Storage falhar, o registro é mantido e o painel exibe o erro.

## Configuração do projeto Supabase

O ambiente local está configurado para o projeto `yzupsiwriqhfbgbutbai`; a URL e a chave publicável ficam em `.env.local`, que não deve ser versionado. A Supabase CLI não está instalada nem há vínculo autenticado com o projeto neste ambiente. Não execute migrations sem antes verificar o schema remoto. A migration inicial cria objetos sem `IF NOT EXISTS` intencionalmente: se as tabelas já existirem, ela deve falhar em vez de esconder uma divergência.

1. No Supabase, selecione o projeto de destino e inspecione as tabelas, funções, policies e o bucket existentes. Compare o schema com todas as migrations locais; não apague ou recrie dados para contornar divergências.
2. Instale e autentique a Supabase CLI por um método aprovado. Não cole tokens, senhas ou chaves secretas no repositório nem no chat. O project ref é `yzupsiwriqhfbgbutbai`.
3. Associe o projeto somente depois de confirmar seu `project ref`:

   ```powershell
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase migration list --linked
   ```

4. Se o schema remoto for vazio e pertencer ao projeto correto, revise primeiro o plano:

   ```powershell
   supabase db push --dry-run
   ```

   Em seguida, com backup válido e após revisar a saída:

   ```powershell
   supabase db push
   ```

   Nunca use `db reset` em produção. Para um banco existente, pare e escreva migrations de transição após comparar os schemas. Não marque migrations como aplicadas sem verificar os objetos remotos.

## Criar o primeiro administrador

O painel não possui signup, usuário ou senha padrão.

1. Em **Authentication → Users**, convide/crie o usuário e confirme o e-mail. Não coloque senha no código.
2. Copie o UUID do usuário e, no SQL Editor autenticado do projeto, associe seu perfil:

   ```sql
   insert into public.profiles (id, name, email, role)
   values ('<AUTH_USER_UUID>', '<NOME>', '<EMAIL_CONFIRMADO>', 'admin');
   ```

3. Desative signup público em **Authentication → Settings**. Não conceda o papel `editor`: a migration 005 restringe o painel e as operações do catálogo a perfis `admin`.
4. Configure URLs de redirecionamento do Auth para os domínios de preview/produção utilizados.

## Formulário e proteção contra spam

O formulário só habilita envio quando `VITE_TURNSTILE_SITE_KEY` está configurada e o desafio foi resolvido. O navegador chama `submit-lead`, nunca grava diretamente na tabela. A Edge Function confere a origem permitida, verifica o token com Cloudflare Turnstile, valida novamente os campos, exige o cabeçalho de IP confiável `cf-connecting-ip`, limita a cinco envios por janela de 15 minutos/IP e associa somente empreendimentos publicados.

Configure, em **Supabase → Edge Functions → Secrets**, os seguintes segredos:

- `TURNSTILE_SECRET_KEY`: segredo do widget Turnstile criado no painel Cloudflare.
- `LEAD_RATE_LIMIT_SECRET`: segredo aleatório forte usado para gerar HMAC dos IPs.
- `LEAD_ALLOWED_ORIGINS`: origens completas separadas por vírgula, sem barra final, por exemplo `https://bira-lopes-consultor.vercel.app,https://<preview>.vercel.app`.

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são segredos de sistema disponíveis à Edge Function Supabase. Se forem definidos manualmente no seu ambiente, devem permanecer em secrets server-side. **Nunca** use `service_role` em variável `VITE_*`, frontend, commit ou conversa.

Depois de comparar e aplicar as migrations:

```powershell
supabase functions deploy submit-lead
```

Confirme no painel Cloudflare que os domínios publicados estão autorizados no widget. Se o ambiente Edge não fornecer o cabeçalho confiável `cf-connecting-ip`, a função responde `503` sem inserir o lead; não substitua por um IP recebido livremente do cliente.

## Storage de imagens

`empreendimento-imagens` é privado, aceita JPEG, PNG, WebP e AVIF, com limite de 10 MiB por arquivo. O caminho começa pelo UUID do empreendimento. A tabela guarda somente o caminho; o catálogo e o painel geram URLs assinadas de curta duração.

O painel envia arquivos sequencialmente e remove o arquivo do Storage se a criação dos metadados falhar. Definição de capa e ordenação são operações transacionais via RPC. Backups e retenção do banco/Storage devem ser habilitados e testados de acordo com o plano e a política operacional do projeto.

## Aplicação local

1. `.env.local` já está configurado localmente para o projeto indicado. Se precisar recriá-lo em outra máquina, copie `.env.example` para `.env.local` e preencha as chaves públicas no painel Supabase:

   ```dotenv
   VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
   VITE_SUPABASE_ANON_KEY=<PUBLIC_ANON_OR_PUBLISHABLE_KEY>
   VITE_TURNSTILE_SITE_KEY=<PUBLIC_TURNSTILE_SITE_KEY>
   ```

   A chave publicável/anon é apropriada ao frontend apenas porque o banco restringe operações por grants e RLS. Não configure segredos em variáveis `VITE_*`.

2. Instale dependências e execute:

   ```powershell
   npm install
   npm run dev
   ```

3. Verifique testes, build e prévia:

   ```powershell
   npm test
   npm run build
   npm run preview
   ```

As páginas públicas mostram estado de erro sem configuração; o painel informa que o Supabase precisa ser configurado. Nenhum dado imobiliário de demonstração é criado ou utilizado como oferta.

## Vercel

1. Em **Project Settings → Environment Variables**, configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_TURNSTILE_SITE_KEY` em cada ambiente de destino.
2. Defina `npm run build` e `dist` como comando de build e diretório de saída. As três entradas HTML estão na raiz.
3. Depois de aplicar migrations e publicar/deploy da Edge Function, inclua a origem real do site em `LEAD_ALLOWED_ORIGINS`.
4. Teste o deploy preview antes de produção. O painel é protegido por Auth e RLS; não trate `noindex` ou a URL `admin.html` como controle de acesso.

## Checklist de validação após configurar o projeto

1. No projeto `yzupsiwriqhfbgbutbai`, confira o histórico e o schema remoto antes de aplicar migrations. Se o schema estiver vazio, revise `supabase db push --dry-run`, faça backup e aplique apenas após autorização. Se houver divergência, não force nem apague objetos: prepare uma migration de transição.
2. No **Storage**, confirme que o bucket `empreendimento-imagens` existe como privado, com limite de 10 MiB e tipos JPEG, PNG, WebP e AVIF. Confirme as policies criadas pela migration 002.
3. Crie o primeiro usuário em **Authentication → Users**, insira seu perfil `admin` pelo SQL Editor (passos acima) e entre em `admin.html`. Verifique que um usuário sem perfil autorizado é recusado e que não há cadastro público pelo painel.
4. No painel, cadastre um empreendimento como rascunho, edite os campos, envie imagens, defina capa e ordene a galeria. Confirme que o visitante não o encontra enquanto estiver em rascunho.
5. Publique o empreendimento e confirme que aparece no catálogo e em `imovel.html?slug=<slug>`, com imagens assinadas e vídeo apenas quando habilitado. Edite-o, despublique-o e confirme que deixa de aparecer; arquive-o e confirme que continua preservado no painel.
6. Configure o widget Turnstile, seus domínios permitidos e os secrets server-side documentados; implante `submit-lead` apenas após revisar a função e as origens. Envie um contato de teste não pessoal pelo formulário, confira a confirmação, e verifique no painel os dados de origem, UTMs e empreendimento.
7. Como administrador, abra os detalhes do lead, atualize sua situação e teste o link de WhatsApp. Como visitante/anon, confirme que a consulta direta à tabela `leads` é negada. Um usuário com perfil `editor` deve ser recusado no painel e não pode gerenciar catálogo, leads ou perfis.

## Verificação desta implementação

Testes locais cobrem validação de dados, URLs de vídeo, slugs, formatos/tamanho de imagem e rejeição de entradas inválidas. O build foi gerado com a configuração local. A API REST do projeto respondeu, mas a consulta de `empreendimentos` retornou `PGRST205`, indicando que a tabela não está exposta no schema PostgREST. A CLI não está instalada e nenhuma migration foi aplicada; autenticação, policies remotas, upload, envio de lead e operações SQL ainda precisam ser validados após configurar o schema.
