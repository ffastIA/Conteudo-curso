## Context

O pipeline hoje tem 10 etapas (0–9). A Etapa 9 gera um roteiro de vídeo em
blocos (cena/holograma/fala) calibrado por "140 caracteres por bloco" — um
proxy de tamanho de texto, não uma duração real em segundos — e sua proposta
original registra explicitamente que a produção do vídeo é externa ao
sistema. Não existe hoje nenhuma integração com serviços de vídeo/avatar
(confirmado por grep no repositório) nem qualquer noção de duração-alvo de
fala em nenhuma camada (skill, template, config, sessão).

Duas integrações externas já estabelecem o padrão a seguir: OpenAI (SDK
oficial, streaming SSE) e Gamma (REST direto via `fetch`, sem SDK, padrão
create→poll com timeout→download, implementado em
`criarGeracaoGamma`/`aguardarGeracaoGamma`/`persistGammaSlidesStage`,
`server.js:908-969`). O padrão de "menu escolhido uma vez por curso, com
rádio + confirmar, persistido em `sess`/`projeto.json` e restaurado em
`POST /api/carregar-projeto`" já existe para o `estiloVisual` da Etapa 8
(`GET/POST /api/estilos-visuais*`).

Decisões de escopo já validadas com o usuário antes deste design:
1. O roteiro desta etapa é um artefato **novo e independente**
   (`roteiroAvatar{NN}`), não reaproveita nem estende o roteiro em blocos da
   Etapa 9.
2. Avatar, voz e os controles avançados do HeyGen (`expressiveness`,
   `motion_prompt`) são escolhidos **uma única vez por curso**, não por aula.
3. O avanço entre aulas **não é automático** nesta etapa — diferente de
   Slides/Roteiro (que avançam via `proximoIndex` no evento `done`), o
   usuário escolhe manualmente qual aula trabalhar a cada rodada.

## Goals / Non-Goals

**Goals:**
- Gerar, para cada aula, um roteiro de fala corrida calibrado para uma
  duração-alvo em segundos definida pelo usuário (só inteiros).
- Manter o padrão de revisão humana já usado no restante do pipeline:
  gerar → `.docx` → baixar/editar → reenviar → confirmar.
- Enviar o roteiro confirmado ao HeyGen (API v3) para gerar um vídeo de
  avatar narrando o texto, com avatar/voz/estilo escolhidos uma vez por
  curso.
- Baixar o `.mp4` pronto para `videos/aula{NN}_video.mp4` dentro da pasta do
  projeto, criando a subpasta sob demanda.
- Reaproveitar ao máximo a infraestrutura genérica já existente (import
  genérico de `.docx`, `persistStage`-like, `saveProject`,
  `courseRootDir`), evitando duplicar padrões.

**Non-Goals:**
- Criar, editar ou clonar avatares/vozes via API — só consome o que já
  existe no workspace HeyGen do usuário.
- Selecionar avatar/voz/expressividade/motion_prompt por aula.
- Aprovação "in-app" do vídeo (botão de aprovar/rejeitar) — a revisão
  continua sendo o humano abrir o `.mp4` na pasta, mesmo padrão do
  `.pptx`/`.docx` das demais etapas.
- Usar `callback_url`/webhook do HeyGen nesta primeira versão — polling
  simples, mesmo padrão do Gamma.
- Suporte a múltiplas contas/workspaces do HeyGen (paralelo ao caso já
  registrado do usuário ter 2 assinaturas do Gamma — mesmo tipo de
  necessidade, adiada da mesma forma, fora de escopo aqui).
- Migrar a Etapa 9 existente para este novo padrão de duração — ela
  continua servindo seu propósito original (roteiro para produção externa).

## Decisions

**D1 — API v3 do HeyGen, não v1/v2.**
A documentação de migração oficial do HeyGen registra que os endpoints
v1/v2 seguem operantes apenas até 2026-10-31. Como a implementação começa
em 2026-07-29, construir sobre v2 significaria retrabalho em ~3 meses.
Alternativa considerada (v2, endpoint `POST /v2/video/generate`): descartada
por essa razão, apesar de ter documentação um pouco mais madura no momento
da pesquisa.

**D2 — Sem SDK oficial, `fetch` nativo + header `x-api-key`.**
Mesmo padrão já usado para o Gamma (`GAMMA_API_KEY`/`GAMMA_API_BASE`,
`server.js:27-36`). Evita nova dependência npm (regra do projeto: nenhuma
dependência nova sem aprovação explícita) e mantém consistência de estilo
entre as duas integrações externas de mídia do projeto.

**D3 — Roteiro de fala como artefato novo (`roteiroAvatar{NN}`), não extensão da Etapa 9.**
O template da Etapa 9 (`PromptRoteiro.docx`) foi desenhado para produção
externa, com marcações de câmera/holograma que não fazem sentido para
consumo direto pelo HeyGen, e sua única noção de "tamanho" é um limite de
caracteres por bloco, não uma duração real. Criar uma skill nova
(`roteiroAvatarSkill`) com heurística de palavras-por-segundo é mais simples
e mais correto do que adaptar um template pensado para outro público
(revisor humano/editor de vídeo) para um consumidor automático (API de
texto-para-vídeo). Decisão validada explicitamente com o usuário.

**D4 — Heurística de duração: 2,5 palavras/segundo (~150 palavras/minuto), tolerância ±15%.**
Cadência de fala natural e pausada em narração PT-BR fica nessa faixa.
`palavrasAlvo = Math.round(segundos * 2.5)` é passado como instrução ao
prompt (não como corte determinístico no código) — o modelo ajusta o nível
de detalhe conforme o orçamento de palavras, igual ao padrão de outras
skills do projeto que já orientam por instrução textual em vez de
truncamento pós-geração.

**D5 — Avatar/voz/controles avançados escolhidos uma vez por curso, mesmo padrão do `estiloVisual`.**
Reaproveita o padrão já testado e validado (rádio → confirmar → persistir
em `sess`/`projeto.json` → restaurar em `carregar-projeto`) em vez de
inventar um novo paradigma de configuração. Diferença: aqui são duas listas
(avatares e vozes) buscadas diretamente da API do HeyGen (`GET
/v3/avatars/looks`, `GET /v3/voices`), não geradas por IA como o menu de
`estiloVisual` — são opções reais do workspace do usuário, não sugestões.

**D6 — Sem avanço automático entre aulas nesta etapa.**
Diferente de Slides e Roteiro (Etapa 8/9), que avançam sozinhas via
`proximoIndex` no evento `done` do SSE. Aqui o ciclo por aula é mais longo
(gerar roteiro → revisar fora do app → reenviar → confirmar → gerar vídeo →
revisar o `.mp4` fora do app) e cada etapa desse ciclo pode levar minutos ou
horas de trabalho humano fora do sistema — auto-avançar geraria confusão
sobre qual aula está "em andamento". Um `<select>` de aula, trocável a
qualquer momento, é mais simples e reflete o uso real esperado.

**D7 — Reaproveitar o import genérico (`/api/importar` + `/api/importar/confirmar`) via extensão de `detectStage`.**
Em vez de criar uma rota de upload dedicada, basta ensinar `detectStage`
(`server.js:2340-2365`) a reconhecer o padrão `roteiroAvatar\d{2}`, igual ao
já existente para `roteiro\d{2}`. Gap identificado durante a exploração: a
Etapa 9 tem esse suporte no backend mas nunca expôs o botão "Importar versão
editada" na UI — este design corrige isso para a nova etapa (não repete o
gap), adicionando o botão explicitamente.

## Risks / Trade-offs

- **[Risco] Geração de vídeo pelo HeyGen pode demorar vários minutos** →
  Mitigação: timeout de polling mais alto que o do Gamma
  (`HEYGEN_POLL_TIMEOUT_MS` default 10 min vs. 5 min do Gamma), com
  `progress` SSE informando o usuário durante a espera; falha por timeout
  não deve deixar `sess`/`projeto.json` em estado inconsistente (nenhum
  registro em `videosAvatarGerados`/`projeto.stages` até o download
  completar).
- **[Risco] Heurística de palavras/segundo é aproximada — o roteiro gerado
  pode não caber exatamente na duração pedida** → Mitigação: é
  responsabilidade do fluxo de revisão humana (baixar/editar/reenviar)
  ajustar o texto antes de confirmar o envio ao HeyGen; o sistema não tenta
  validar duração real de forma determinística (isso exigiria estimar TTS,
  fora de escopo).
- **[Risco] Workspace do HeyGen sem avatares/vozes cadastrados** →
  Mitigação: `GET /api/heygen/avatares`/`vozes` retornam lista vazia sem
  erro; a UI deve comunicar claramente que é preciso criar avatar/voz no
  próprio HeyGen antes de configurar esta etapa (mesmo tipo de dependência
  externa já documentado para os temas do Gamma).
- **[Trade-off] Sem avanço automático entre aulas** — mais cliques manuais
  que Slides/Roteiro, mas evita ambiguidade num fluxo com etapas de revisão
  humana mais longas (ver D6).
- **[Risco] `HEYGEN_API_KEY` ausente/inválida** → Mitigação: mesmo padrão de
  erro 500 com mensagem clara já usado para `GAMMA_API_KEY` — não crashar o
  servidor, falhar apenas a chamada específica.

## Migration Plan

Feature aditiva — nenhuma migração de dados existente é necessária:
- Novos campos de sessão/`projeto.json` (`heygenConfig`,
  `roteiroAvatarPendente`, `roteirosAvatarGerados`, `duracaoAvatarDefault`,
  `videosAvatarGerados`) são `null`/vazios por padrão em projetos existentes
  — `saveProject`/restauração usam `|| null`/`|| []`, mesmo padrão dos
  campos análogos já existentes.
- Nova subpasta `videos/` é criada sob demanda no primeiro download de
  vídeo — não afeta projetos que nunca usarem a Etapa 10.
- Rollback: reverter o commit desta feature não deixa dado órfão relevante
  além dos arquivos `roteiroAvatar*.txt/.docx` e `videos/*.mp4` já gerados
  em disco (inofensivos, o usuário decide se mantém).

## Open Questions

- Suporte a múltiplas contas/workspaces do HeyGen (paralelo ao caso do
  Gamma) — adiado, sem decisão de formato de configuração ainda.
- Se a heurística de 2,5 palavras/segundo se mostrar imprecisa na prática
  (ex: para conteúdo muito técnico com termos longos), pode ser necessário
  um fator de ajuste configurável — não implementado nesta primeira versão,
  fica como possível iteração futura.
