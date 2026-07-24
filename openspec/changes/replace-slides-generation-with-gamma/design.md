## Context

A Etapa 8 (Slides) hoje é a única etapa do pipeline que gera um artefato binário
estruturado (`.pptx`) montado localmente (`buildPptx` via `pptxgenjs`), a partir de
duas chamadas OpenAI por aula: `slidesSkill` (estrutura 6-10 slides em JSON) e
`gerarImagemSlide` (uma chamada `images.generate` por slide ilustrado). O fluxo
atual é um loop automático único (`GET /api/slides`, SSE) que percorre todas as
aulas do curso numa só conexão, sem pausa.

Esta mudança substitui o motor de geração pela API do Gamma (gamma.app v1.0), que
resolve estrutura de conteúdo + imagem + montagem do `.pptx` em uma única chamada
por aula. Como efeito colateral desejado, a troca também introduz dois controles
que o usuário pediu explicitamente: quantidade de slides por aula (1-5, hoje é
6-10 decidido pela IA sem controle) e observações complementares por aula — ambos
exigem que o fluxo pare para revisão humana antes de cada aula, então o loop
automático de hoje deixa de fazer sentido e é substituído pelo mesmo padrão de
"pausa por aula" já usado e validado na Etapa 9 (Roteiros, ver
`openspec/changes/archive/2026-07-23-add-video-script-generation/`).

## Goals / Non-Goals

**Goals:**
- Trocar o motor de geração de slides de OpenAI para a API do Gamma,
  exclusivamente na Etapa 8 — nenhuma outra etapa do pipeline muda.
- Usuário escolhe a quantidade de slides (1-5) e pode ajustar observações
  complementares antes de cada aula, com valores "sticky" (reaplicados por
  padrão à aula seguinte, editáveis a qualquer momento).
- Cada aula gerada grava, no `projeto.json`, exatamente qual quantidade e
  observação foram usadas nela (persistência por aula, não só um valor global).
- Manter o contrato externo dos arquivos gerados idêntico: mesmo nome
  (`aula{NN}_slides.pptx`), mesmo local (`courseRootDir(sess)`), mesma entrada
  em `projeto.json.stages` — zero mudança para quem consome esses arquivos hoje
  (reload de projeto, listagem de arquivos, badges na UI).
- Reaproveitar o seletor de "estilo visual" já existente (ainda via OpenAI, só
  para propor o menu) — a escolha alimenta `imageOptions.style` do Gamma.

**Non-Goals:**
- Não altera nenhuma outra etapa do pipeline (todas continuam 100% em OpenAI).
- Não implementa retry automático em falha do Gamma — mesmo padrão "sem retry
  automático" já aceito no resto do projeto (gap G05, genérico, não resolvido
  por esta mudança).
- Não adiciona criptografia real para a chave do Gamma nem para a da OpenAI —
  mantém o padrão já em uso (`.env` gitignored, `.env.example` documentando em
  branco, sem valor commitado — confirmado que não existe criptografia
  real hoje em nenhuma chave do projeto).
- Não tenta forçar `numCards` como teto rígido — é um "alvo" para a API do
  Gamma, documentado como limitação conhecida.
- Não expõe `exportUrl` ao cliente nem o registra em log — o download do
  `.pptx` acontece inteiramente no servidor.

## Decisions

### 1. Engine trocado ponta a ponta (conteúdo + imagem + montagem), não só a imagem
Cogitou-se manter `slidesSkill` (estrutura OpenAI) e só trocar a geração de
imagem pelo Gamma — rejeitado porque o Gamma já resolve estrutura+imagem+
montagem numa única chamada, e manter `slidesSkill` só para estruturar
conteúdo que o próprio Gamma também estrutura (com `inputText`/`textMode:
condense`) duplicaria trabalho e uma chamada OpenAI desnecessária. O pedido
original também é claro em "trocar a API da OpenAI pela API do Gamma" para
esta funcionalidade — a leitura mais direta é a geração de conteúdo como um
todo, não só a etapa de imagem.

### 2. Manter o seletor de "estilo visual" (ainda via OpenAI)
Decisão validada com o usuário. `estiloVisualSkill`/`GET /api/estilos-visuais`/
`POST /api/estilos-visuais/selecionar` continuam intactos — é uma chamada
OpenAI leve (proposta de menu, não geração de conteúdo educacional) e o
`housePrompt` resultante mapeia diretamente para `imageOptions.style` do
Gamma, preservando a UX já testada de escolher um estilo coerente com o curso
uma vez e reaplicá-lo a todas as aulas.

### 3. Pausa por aula, replicando o padrão já construído em Roteiros
Como a quantidade de slides e as observações precisam de confirmação humana
por aula, o loop automático de `GET /api/slides` (uma conexão SSE para o curso
inteiro) é substituído pelo mesmo desenho de 3 endpoints já usado e testado em
Roteiros: `GET .../parametros` (metadados + valores sticky, sem IA) → `POST
.../parametros` (aprova os valores da aula) → `GET .../gerar` (SSE, chama o
Gamma, persiste, calcula `proximoIndex`). O cliente dirige o avanço aula a
aula; não há mais um loop `for` no servidor.

### 4. `fetch` nativo do Node para a API REST do Gamma, sem SDK/dependência nova
O Gamma não tem um SDK oficial Node conhecido no ecossistema deste projeto, e
o Node 22 (versão em uso) já tem `fetch` global estável. É o primeiro uso de
`fetch`/`https` manual no `server.js` (confirmado que não há precedente hoje —
toda chamada externa até agora passa pelo SDK `openai`), mas é a opção que
evita adicionar `axios`/`node-fetch` ao `package.json`, consistente com a
regra do projeto de não introduzir dependência nova sem justificativa.

### 5. Download do `.pptx` acontece no servidor, nunca no cliente
`exportUrl` é um link de download simples (não exige a chave de API), válido
por ~1 semana, mas sem controle de acesso — tratado como segredo efêmero:
baixado imediatamente pelo servidor via `fetch` e persistido em disco; nunca
enviado ao cliente, nunca logado. Mantém o padrão já existente do projeto de
nunca expor artefatos gerados via link externo — sempre salvos diretamente na
pasta do projeto.

### 6. Falha do Gamma não avança para a próxima aula
Diferente do tratamento de falha isolada de imagem no fluxo antigo (uma
imagem falha, o slide cai pra layout sem imagem, o curso continua), uma falha
do Gamma agora afeta a aula inteira (é uma única chamada que gera tudo). Por
isso, ao falhar, o servidor emite `error` via SSE e o `proximoIndex` não é
calculado — o cliente permanece na mesma aula para o usuário revisar/reenviar,
sem perder o progresso das aulas já geradas anteriormente nesse ciclo.

### 7. `nivel` do curso incorporado ao contexto de tom/público enviado ao Gamma
O requisito antigo "Slides adequados ao nível declarado" (`slidesSkill`
recebia `nivel` para ajustar densidade/vocabulário) é substituído por um novo
requisito que envia `sess.config.nivel` junto com `sess.config.publico` no
`textOptions.audience`/`tone` do Gamma — a mesma preocupação (adequar
densidade e vocabulário ao nível do curso) persiste, só muda o mecanismo de
como esse contexto chega até o motor de geração.

## Risks / Trade-offs

- **[Risco] `numCards` é alvo, não teto garantido** → Mitigação: nenhuma —
  documentado como limitação conhecida da API do Gamma; se a divergência se
  mostrar frequente na prática, pode virar um follow-up (não bloqueia esta
  mudança).
- **[Risco] Custo real em créditos por geração** (diferente do custo já
  orçado de tokens OpenAI) → Mitigação: trade-off aceito explicitamente pelo
  usuário nesta mudança; nenhum controle de orçamento/limite é adicionado
  agora (fora de escopo).
- **[Risco] Código do idioma exato do Gamma para português não confirmado
  pela documentação pública** (aposta: `pt-br`) → Mitigação: validado no
  primeiro teste real de ponta a ponta com a chave fornecida pelo usuário,
  antes de considerar a implementação concluída; se o código errado for
  rejeitado pela API (HTTP 400), o erro aparece imediato e claro no primeiro
  teste manual, fácil de corrigir.
- **[Risco] Falha de rede/timeout durante o polling** (até 5 min) → Mitigação:
  mesmo padrão de `client.disconnected`/abort signal já usado em todo o
  projeto; timeout total gera um evento `error` como qualquer outra falha.
- **[Trade-off] Perda de controle fino de layout** (fonte/tamanho/posição
  fixos que o `buildPptx` local garantia) — o Gamma decide o layout via seu
  próprio sistema de temas. Aceito como parte da troca de motor; requisitos de
  padronização visual local (`Padronização visual dos slides`, `Layout de
  slide com imagem`) são removidos nesta mudança, não substituídos.

## Migration Plan

Troca direta, sem período de transição com os dois motores coexistindo (o
pedido é substituir, não adicionar uma alternativa). Passos:
1. Implementar os endpoints/helpers novos e a UI nova, com o código antigo
   (`GET /api/slides`, `gerarImagemSlide`, `buildPptx`, `persistPptxStage`,
   `slidesSkill`) ainda presente.
2. Validar com testes automatizados (mock de `fetch`) e depois com uma
   geração real usando a chave do Gamma fornecida pelo usuário.
3. Remover o código antigo (backend, skill, constantes exclusivas) e os
   testes que cobriam `GET /api/slides`.
4. Sem rollback automatizado — reverter via `git revert` do commit da mudança,
   caso necessário (mesmo padrão de qualquer outra mudança neste projeto, que
   não tem infraestrutura de deploy/rollback formal).

## Open Questions

- Nenhuma pendente. As três ambiguidades identificadas durante o planejamento
  (manter ou remover o seletor de estilo visual; frequência da pausa de
  observações/quantidade; disponibilidade de uma chave real do Gamma para
  teste) já foram resolvidas com o usuário e estão refletidas nas Decisions
  acima.
