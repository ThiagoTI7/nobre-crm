# CRM Nobre Brindes — case técnico (Full Stack Pleno)

Primeira versão de um CRM interno para o time comercial da Nobre Brindes: funil Kanban de oportunidades, API com regras de negócio validadas no backend e uma automação que aponta, todo dia, **quais negociações estão sendo esquecidas**.

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| API | Node.js 22, TypeScript, Fastify 5, Zod, `pg` (SQL puro, sem ORM) |
| Banco | PostgreSQL 16 |
| Testes | Vitest (unitários + integração com PostgreSQL real) |

## Sumário

1. [Como executar](#1-como-executar)
2. [Estrutura do repositório](#2-estrutura-do-repositório)
3. [Produto e UX](#3-produto-e-ux)
4. [Engenharia: regras do funil](#4-engenharia-regras-do-funil)
5. [Modelo de dados e consistência](#5-modelo-de-dados-e-consistência)
6. [API](#6-api)
7. [Segurança](#7-segurança)
8. [Automação implementada: follow-up esquecido](#8-automação-implementada-follow-up-esquecido-problema-4)
9. [Os outros três problemas: como eu resolveria](#9-os-outros-três-problemas-como-eu-resolveria)
10. [Dados do case: campos em branco e inconsistências](#10-dados-do-case-campos-em-branco-e-inconsistências)
11. [Testes](#11-testes)
12. [Limitações e próximos passos](#12-limitações-e-próximos-passos)
13. [Uso de IA](#13-uso-de-ia)

---

## 1. Como executar

Pré-requisitos: **Node.js 20+** (desenvolvido em 22) e **Docker** (ou um PostgreSQL 14+ qualquer).

```bash
# 1. Dependências
npm run install:all

# 2. Banco (PostgreSQL em Docker; cria também o banco de testes)
npm run db:up

# 3. Variáveis de ambiente
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local     # opcional: o padrão já aponta para localhost:3333

# 4. Tabelas + carga inicial (os 7 registros do case)
npm run db:setup

# 5. Subir tudo (dois terminais)
npm run dev:api     # http://localhost:3333
npm run dev:web     # http://localhost:3000
```

Abra **http://localhost:3000**.

> **Data de referência.** O `.env.example` define `REFERENCE_DATE=2026-10-15`, a data do enunciado, para que os alertas reproduzam exatamente o cenário do case. Apague a linha (ou deixe vazia) para usar a data real (fuso America/Sao_Paulo). Quando a variável existe, o sistema inteiro trata essa data como "hoje".

Sem Docker: crie dois bancos (`nobre_crm` e `nobre_crm_test`) e ajuste `DATABASE_URL` / `TEST_DATABASE_URL` em `apps/api/.env`.

### Outros comandos

```bash
npm test                                   # testes (os de integração exigem TEST_DATABASE_URL)
npm run typecheck                          # API + web
npm run build                              # build de produção de API e web
npm run digest                             # resumo de follow-ups por vendedor (automação)
npm run digest -- --seller Ana             # só uma pessoa
npm run digest -- --json                   # saída estruturada
npm run digest -- --send                   # envia para DIGEST_WEBHOOK_URL (Slack/Teams)
npm --prefix apps/api run seed -- --reset  # volta o banco para os 7 registros originais
```

---

## 2. Estrutura do repositório

```
apps/
  api/
    migrations/001_init.sql      schema + constraints
    src/
      domain/funnel.ts           regras do funil (puro, sem I/O)
      domain/attention.ts        automação de follow-up (puro) + digest
      domain/dates.ts            datas de negócio (YYYY-MM-DD, fuso de São Paulo)
      repo.ts                    acesso a dados e transações
      app.ts                     rotas, validação (Zod), tratamento de erros
      db/                        pool, migrate, seed
      cli/digest.ts              job da automação
    test/                        funnel, attention (unitários) e api (integração)
  web/
    src/components/              board (Kanban), card, drawer, list-view, toolbar, ...
    src/lib/                     api client, hook de dados, formatação
infra/init-test-db.sql           cria o banco de testes no Docker
docker-compose.yml               PostgreSQL local
```

**Organização do código.** As regras de negócio (`domain/`) são funções puras: recebem dados, devolvem decisão. Não conhecem HTTP nem banco, por isso são testadas sem infraestrutura e podem ser reaproveitadas (API, job de digest, testes). `repo.ts` cuida de transações; `app.ts` só traduz HTTP ⇄ domínio.

---

## 3. Produto e UX

A pergunta que a tela responde é: **"qual negociação eu preciso trabalhar hoje?"**

- **Faixa "Hoje"** no topo: *"3 negociações pedem ação hoje"*, com as mais urgentes e o motivo de cada uma, a um clique do detalhe. Se não houver nada, a tela diz isso explicitamente.
- **Kanban** com uma coluna por etapa (5 etapas + Perdida). Cada coluna mostra a quantidade e o valor somado. Dentro da coluna, os cards mais urgentes vêm primeiro.
- **Card**: empresa, brinde e quantidade, valor, vendedor, tempo desde o último contato, evento do cliente e **o principal motivo de atenção em texto**. A urgência usa borda colorida **e** selo escrito ("Urgente" / "Atenção"), nunca só cor.
- **Arrastar e soltar** entre colunas, com atualização otimista que é desfeita se o servidor recusar. As colunas de destino válidas se destacam. Quem não usa mouse tem o mesmo caminho no painel de detalhe, em **"Mover para"**.
- **Lista** (alternativa ao Kanban) com ordenação por atenção, empresa, valor, último contato e evento, e filtro por etapa.
- **Busca** (empresa, brinde ou código) com *debounce*, **filtro por vendedor** e **"Só com atenção"**.
- **Painel de detalhe**: alertas, dados, brindes, ações (registrar contato hoje, editar, mover) e histórico de etapas.
- **Estados**: carregamento (esqueleto com a forma do quadro), erro com "Tentar de novo", ausência de resultados com "Limpar filtros" e coluna vazia. Mensagens de recusa vêm do backend e dizem o que fazer; quando faltam dados, o aviso oferece **"Completar dados"**, que abre o formulário.
- **Perdida** abre uma janela pedindo o motivo, com sugestões de um clique.
- Acessibilidade básica: foco visível, `aria-pressed` nos filtros, `aria-sort` na tabela, diálogos com `Esc`, região `aria-live` para avisos, respeito a `prefers-reduced-motion`.

A tela **não duplica regras**: etapas, transições válidas e requisitos vêm de `GET /api/meta`.

---

## 4. Engenharia: regras do funil

Toda a validação está em `apps/api/src/domain/funnel.ts` e é executada no backend dentro da transação da mudança de etapa. A tela só consome o resultado.

### Regras dadas

| Regra | Implementação |
|---|---|
| Só avança para **Apresentação de Orçamento** com valor estimado e ao menos um item | `REQUIREMENTS_NOT_MET` (422) listando o que falta. Valor precisa ser > 0; item precisa de nome e quantidade > 0 |
| **Fechamento** só a partir de **Forecast** | Qualquer outra origem → `TRANSITION_NOT_ALLOWED` (409) |
| **Perdida** de qualquer etapa não final, com motivo | `LOSS_REASON_REQUIRED` (422) se o motivo estiver ausente ou em branco |
| **Fechamento** e **Perdida** são finais | `FINAL_STAGE` (409). Também não aceitam edição nem novos contatos |

### Decisões minhas (e por quê)

**Avanços: sempre uma etapa por vez.** Pular etapas esconde proposta não enviada ou negociação sem follow-up, e distorce a análise do funil. A saída "de emergência" para negócios que morrem é Perdida, permitida de qualquer lugar.

**Retornos permitidos** (o processo comercial real tem idas e vindas):

| Retorno | Por quê |
|---|---|
| Follow-up → Apresentação de Orçamento | O cliente pede revisão da proposta (exemplo do enunciado) |
| Forecast → Follow-up | A previsão caiu: voltou a ser negociação aberta |
| Forecast → Apresentação de Orçamento | Escopo ou preço mudou e há uma nova proposta |

**Retornos proibidos:**

| Retorno | Por quê |
|---|---|
| Qualquer volta a **Primeiro Contato** | O lead já foi atendido. "Desfazer" o contato falsearia o SLA de atendimento. Se o lead sumiu, o caminho é Perdida |
| Sair de **Fechamento** ou **Perdida** | Estados finais. Reabrir = criar nova oportunidade, o que preserva histórico e métricas de conversão |

**Requisitos adicionais por etapa** (além da regra dada):

| Para estar em… | É obrigatório ter |
|---|---|
| Apresentação de Orçamento | valor estimado, item de brinde *(regra dada)* |
| Follow-up | + validade da proposta (não há follow-up de uma proposta que não foi enviada) |
| Forecast e Fechamento | + data do evento do cliente (sem ela não há previsão de entrega) |

Esses requisitos valem também **na edição**: não é possível apagar o valor de algo que está em Follow-up (`PATCH` devolve 422). A oportunidade nunca fica num estado incompatível com a etapa.

**Observação opcional** em qualquer movimento (ex.: "Cliente pediu nova cotação"); em Perdida, o motivo vira a observação do histórico.

**Concorrência.** A mudança de etapa trava a linha (`SELECT … FOR UPDATE`), valida, atualiza e grava o histórico na mesma transação. O cliente pode mandar `expectedStage`: se o quadro estiver desatualizado, a API responde `STALE_STAGE` (409) em vez de mover algo que outra pessoa já moveu. Há teste com três movimentos simultâneos: um vence, dois são recusados, o histórico não duplica.

**Códigos de resposta:** 422 = faltam dados (a pessoa pode corrigir); 409 = conflito de estado (a ação não cabe no estado atual); 400 = requisição malformada.

---

## 5. Modelo de dados e consistência

```
opportunities     code (PK, "OPP-2001"), company, seller, estimated_value, stage,
                  last_contact_at, proposal_valid_until, event_date, loss_reason,
                  created_at, updated_at
opportunity_items id, opportunity_code (FK), name, quantity
stage_history     id, opportunity_code (FK), from_stage (NULL = criação), to_stage, note, changed_at
```

- Datas de negócio são `date` (sem fuso) e trafegam como `YYYY-MM-DD`, evitando o bug de "um dia a menos".
- Valores em `numeric(12,2)`.
- **Segunda linha de defesa no banco** (`CHECK`): etapa válida; valor > 0 depois do primeiro contato; motivo obrigatório em Perdida e proibido fora dela; nome do brinde não vazio e quantidade > 0. Os testes tentam violar essas regras via SQL direto. *(Um desses testes pegou um bug real: em `CHECK`, `NULL` "passa", então a regra do valor usa `COALESCE`.)*
- Histórico: toda mudança grava de onde, para onde, quando e a observação. A carga inicial registra uma entrada "Carga inicial".
- SQL parametrizado em toda parte; o `LIKE` da busca escapa `%`, `_` e `\`.

---

## 6. API

Base: `http://localhost:3333`. Erros sempre no formato `{ "error": { "code", "message", "details?" } }`.

| Método e rota | Função |
|---|---|
| `GET /health` | Verifica API e banco |
| `GET /api/meta` | Data de hoje, etapas, transições válidas, requisitos, vendedores |
| `GET /api/opportunities?q=&stage=&seller=&attention=true` | Lista com atenção calculada, mais urgentes primeiro |
| `GET /api/opportunities/:code` | Detalhe com itens e histórico |
| `POST /api/opportunities` | Cria (sempre em Primeiro Contato) |
| `PATCH /api/opportunities/:code` | Edita dados (respeitando requisitos da etapa) |
| `POST /api/opportunities/:code/transitions` | `{ to, lossReason?, note?, expectedStage? }` |
| `POST /api/opportunities/:code/contacts` | Registra contato (`{ date? }`, padrão: hoje) |
| `GET /api/attention` | Só o que precisa de atenção, com resumo |
| `GET /api/digest?format=json\|markdown&seller=` | Resumo por vendedor |

---

## 7. Segurança

**O que está implementado**

- Nenhuma credencial no código: tudo via variáveis de ambiente; `.env` está no `.gitignore` e há `.env.example` sem segredos. As credenciais do `docker-compose.yml` são de uso local.
- Validação de toda entrada com Zod (tipos, tamanhos, datas reais, enums).
- SQL parametrizado; mensagens de erro de banco/servidor não vazam (resposta genérica + log).
- `helmet` (cabeçalhos), CORS por lista de origens, *rate limit* (300 req/min por IP), limite de tamanho de corpo.
- O navegador só fala com o Next (mesma origem); a URL da API fica no servidor (`API_URL`).

**Como eu protegeria em produção** (autenticação completa não foi pedida):

1. **Autenticação**: SSO corporativo (OIDC com Google Workspace/Entra ID); a API valida JWT (assinatura, `iss`, `aud`, expiração). Nada de sessão em `localStorage`; cookie `HttpOnly` + `SameSite` no BFF do Next.
2. **Autorização** (RBAC): vendedor vê e move as próprias oportunidades; gestor vê todas e edita qualquer uma. Hoje `seller` é um texto; passaria a ser `owner_id` ligado a um usuário.
3. **Transporte**: TLS no gateway/ingress, HSTS, API em rede privada atrás do BFF ou de um API gateway/WAF.
4. **Segredos**: Secret Manager (nunca em imagem ou repositório), rotação periódica; usuário do banco com privilégio mínimo (sem DDL) e conexão com TLS.
5. **Auditoria**: `stage_history` ganha `changed_by`; log estruturado sem PII (mascarar empresa/valores quando possível), com correlação por `request-id`.
6. **Rate limit e proteção**: limites por usuário (não só por IP), *backoff* em falhas de login, alerta em picos de 4xx/5xx.
7. **Supply chain e operação**: `npm audit`/Dependabot no CI, imagens enxutas e fixadas por digest, backups com teste de restauração, migrations versionadas aplicadas por pipeline.
8. **LGPD**: dados de contato de pessoas físicas só quando necessários, base legal e retenção definidas, exportação/exclusão sob demanda.

---

## 8. Automação implementada: follow-up esquecido (problema 4)

> *"Com alto volume de atendimentos, é fácil esquecer de dar retorno a um lead. Como ajudar o vendedor a se organizar?"*

**Por que este.** É o que mais conversa com o resto do sistema: usa os dados que o funil já tem (último contato, validade da proposta, evento do cliente) e alimenta diretamente a pergunta central da tela ("o que trabalho hoje?"). Os dados do case também trazem armadilhas deliberadas que esse problema exercita.

**Como funciona.** `domain/attention.ts` avalia cada oportunidade ativa contra a data de referência e devolve `level` (`high` / `medium` / `none`), uma pontuação para ordenar e a lista de motivos em português. A mesma função alimenta:

1. **A tela**: faixa "Hoje", selos nos cards, ordenação e filtro "Só com atenção".
2. **A API**: `/api/attention` e `/api/digest`.
3. **O job** `npm run digest`: resumo por vendedor em Markdown (ou JSON), com `--send` para webhook Slack/Teams. Pensado para rodar via agendador (cron, GitHub Actions, Cloud Scheduler) toda manhã útil, às 8h.

**Regras** (todas configuráveis em `DEFAULT_ATTENTION_CONFIG`):

| Situação | Gravidade |
|---|---|
| Nenhum contato registrado (**campo em branco é alerta**, não "ok") | Alta |
| Dias sem contato acima do limite da etapa (Primeiro Contato 2, Apresentação 3, Follow-up 4, Forecast 7) | Média; **alta** com o dobro do limite |
| Proposta vencida | Alta |
| Proposta vence em até 3 dias | Média |
| Evento em até 10 dias (prazo de produção) e ainda **antes de Forecast** | Alta |
| Evento em até 10 dias, já em Forecast | Média |
| Evento já passou com a negociação aberta | Alta |
| Dica: validade posterior ao evento; sem data do evento; sem validade na Apresentação | Informativa (não eleva o nível) |

Fechamento e Perdida nunca geram alerta. Registrar um contato (`Registrar contato hoje`) zera o alerta de retorno atrasado na hora.

**Resultado nos dados do case (15/10/2026)**

| Oportunidade | Resultado | Por quê |
|---|---|---|
| OPP-2004 Agência Pulso | Alta | 13 dias sem contato; proposta venceu há 5 dias |
| OPP-2002 Construtora Horizonte | Alta | 9 dias sem contato; proposta venceu há 2 dias; evento em 10 dias ainda em Apresentação |
| OPP-2003 Clínica Vida | Alta | Evento em 3 dias ainda em Follow-up; validade posterior ao evento |
| OPP-2001, OPP-2005 | Em dia | |
| OPP-2006, OPP-2007 | Finais | Sem alertas |

**Limitações e evoluções**: limites iguais para todos (poderiam variar por valor ou cliente); dias corridos, não úteis (o calendário comercial entraria com feriados); o digest imprime ou envia, mas não guarda o que já foi enviado, então um envio real precisaria registrar a execução para ser idempotente.

---

## 9. Os outros três problemas: como eu resolveria

### Problema 1 — Atendimento rápido do lead (SLA)

**Ideia:** tratar o primeiro contato como um relógio, não como uma etapa.

- **Entrada automática**: formulários do site, WhatsApp e anúncios chamam `POST /api/opportunities` (ela já existe e a oportunidade nasce sem contato, o que já dispara o alerta). Um webhook assinado (HMAC) recebe os leads dos canais.
- **Distribuição imediata**: atribuição automática (rodízio ponderado por carga e por turno) para ninguém ficar com lead "sem dono".
- **SLA com escalonamento**: guardar `first_contacted_at`. Um job a cada minuto procura leads sem contato; se passou X minutos úteis (ex.: 15), avisa o vendedor (Slack/WhatsApp); se passou 2X, avisa o gestor e redistribui.
- **Métrica**: tempo até o primeiro contato = `first_contacted_at − created_at`, por vendedor e canal, em painel.
- **Implementação**: fila (pg-boss, que usa o próprio PostgreSQL, ou BullMQ); calendário de horário comercial; idempotência por `(lead, nível de escalonamento)` para não notificar duas vezes. Hoje a regra de Primeiro Contato é medida em dias; o SLA em minutos exigiria trocar `date` por `timestamptz` nesse campo.

### Problema 2 — Conhecer a empresa do lead

**Ideia:** enriquecer automaticamente a partir do CNPJ e mostrar um resumo no painel.

- Ao criar o lead com CNPJ, um job assíncrono consulta fontes públicas (BrasilAPI/ReceitaWS): razão social, CNAE (segmento), porte, data de abertura, cidade; opcionalmente site e LinkedIn.
- Grava em `company_profile` (JSONB + `source` + `fetched_at`) com cache e reconsulta periódica. O painel ganha "Sobre a empresa".
- **Com IA (opcional)**: um resumo curto e sugestões de brinde por segmento e porte (ex.: construtora → kit de escritório e EPI), sempre marcado como sugestão.
- **Cuidados**: falha da fonte não bloqueia o lead (fallback manual); limite de taxa e retentativa com *backoff*; LGPD (dados de PJ são públicos, mas sócios são pessoas físicas, então minimizar e não armazenar o que não agrega).
- **Implementação**: worker consumindo a mesma fila do problema 1; adaptador por provedor com interface única para trocar a fonte.

### Problema 3 — Informações da ligação acessíveis depois

**Ideia:** transformar o roteiro em dados estruturados, não em texto solto.

- **Roteiro como formulário versionado** no painel (orçamento disponível, prazo e evento, uso do brinde, número de pessoas, decisor, concorrência, objeções). Salvo em `call_notes` (JSONB com `template_version`), então dá para filtrar ("quem tem decisor definido?") e mostrar um resumo no card.
- **Linha do tempo** de interações por oportunidade (ligações, e-mails, reuniões), com autor e data.
- **Com IA (fase 2)**: gravação + transcrição (STT) e um LLM preenche os campos do roteiro. **Revisão humana obrigatória** antes de salvar, e o texto original fica anexado como fonte.
- **Cuidados**: aviso e consentimento de gravação (LGPD), retenção definida, acesso restrito ao dono e ao gestor.
- **Implementação**: tabela `interactions` + `call_notes`; busca com `tsvector` do PostgreSQL; fila para transcrição.

---

## 10. Dados do case: campos em branco e inconsistências

Os registros estão em `apps/api/src/db/seed-data.ts`. O enunciado diz que campos em branco são "parte do problema"; não inventei dados:

- **OPP-2001** não tem validade de proposta: faz sentido, ainda está em Primeiro Contato (a validade só passa a ser exigida em Follow-up). Fica `NULL`.
- **OPP-2003**: o evento (18/10) é **anterior** à validade da proposta (20/10). Foi mantido como veio e a automação sinaliza a inconsistência (dica informativa) além do risco de prazo.
- **OPP-2007 (Perdida)** não traz motivo, mas o banco exige motivo em Perdida. Decisão: o registro legado recebe o texto **"Não informado (registro legado)"**, explícito e fácil de filtrar, em vez de relaxar a regra do banco para todos.
- **Valores**: `4.500` e `1.000` foram lidos como milhar brasileiro (R$ 4.500 e 1.000 unidades).
- **Último contato / validade / evento ausentes** na ferramenta são tratados como alerta ("sem contato registrado") ou dica, não como erro.

---

## 11. Testes

```bash
npm test
```

| Arquivo | O que cobre |
|---|---|
| `test/funnel.test.ts` | Todas as regras do enunciado e as decisões próprias: avanços, retornos permitidos e proibidos, estados finais, requisitos por etapa, motivo de perda (nulo, vazio, só espaços) |
| `test/attention.test.ts` | Motor de atenção nos 7 registros do case, limites exatos (dia do limite × dia seguinte), gravidade por etapa, campos em branco, digest e Markdown, cálculo de datas e fuso |
| `test/api.test.ts` | API + PostgreSQL reais: listagem, busca (incluindo `%`, `_` e tentativa de SQL injection), filtros, detalhe, transições, histórico, validações, tela desatualizada, **movimentos concorrentes**, edição, contatos, digest e *constraints* do banco |

Os testes de integração rodam só com `TEST_DATABASE_URL` definido e **apagam o schema desse banco**, por isso exigem "test" no nome (senão se recusam a rodar).

---

## 12. Limitações e próximos passos

- **Sem autenticação** (conforme o enunciado); `seller` é texto livre. Ver seção 7.
- **Sem paginação**: o Kanban carrega todas as oportunidades. Para milhares, paginar por coluna (cursor por etapa) e mover o cálculo de atenção para uma coluna materializada ou consulta SQL.
- **Atenção calculada na leitura**: sempre correta e sem estado, mas recalculada a cada listagem.
- **Arrastar e soltar** usa a API nativa do navegador (sem dependência extra): não funciona em telas touch. O painel de detalhe cobre esse caso; `@dnd-kit` seria o próximo passo.
- **Criação de oportunidade** existe na API, mas não há formulário na tela (não era o foco do case).
- **Sem testes automatizados de interface** (E2E, por exemplo com Playwright); a UI foi verificada com `tsc`, `next build` e chamadas pelo *proxy*.
- Dias corridos, sem calendário de feriados, nas regras de atenção.
- Sem *docker* para API e web; o `docker-compose` cobre só o banco.

---

## 13. Uso de IA

Este projeto foi desenvolvido com apoio de **IA generativa (Claude, da Anthropic, via Claude Code)**: ela escreveu a maior parte do código, dos testes e deste README a partir do enunciado. As decisões de produto, como a automação escolhida (follow-up esquecido), o escopo e as regras de retorno, foram tomadas na conversa e estão justificadas acima. O código foi executado e testado de fato (testes unitários e de integração contra PostgreSQL 16, `tsc` e `next build`); um dos testes revelou um bug real de `CHECK` no banco, corrigido durante o desenvolvimento.
