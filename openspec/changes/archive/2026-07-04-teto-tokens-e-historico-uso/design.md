# Design: teto-tokens-e-historico-uso

## Context

Diagnóstico do truncamento relatado: as melhorias usam o ramo web-search de `streamSkillToClient` (não-streaming); em `finish_reason: length` o código retornava o parcial com mero aviso, e o endpoint persistia por cima da versão boa. Os cortes observados (~2K tokens) apontam para o servidor em execução com código antigo (`max_tokens: 2000`, elevado a 16.000 em `c28a6a0`) — **reiniciar o servidor integra a correção**. O usuário definiu teto de 10K por aula e pediu histórico persistido de tokens.

## Goals / Non-Goals

**Goals:** teto único e explícito por aula; histórico de consumo por projeto que sobreviva a restarts; nunca persistir resposta truncada por cima de conteúdo íntegro.

**Non-Goals:** orçamento/alertas de custo; painel de análise de consumo; retry além de 1 continuação.

## Decisions

1. **`MAX_TOKENS_AULA = 10_000` nos dois ramos.** O ramo streaming não tinha limite (podia gerar até o teto do modelo sem aviso); unificar torna o comportamento previsível e o corte detectável (`finish_reason` agora capturado também no streaming, com o mesmo SSE `warning`).
2. **Persistência via `addUsage(usage, sess)` retrocompatível.** Um único ponto de acumulação (a função que todos os call sites já usam) em vez de instrumentar cada endpoint. Grava `scr/token_usage.json` `{ total, porDia, atualizadoEm }` de forma síncrona (padrão `saveProject`); leitura tolerante a arquivo ausente/corrompido (recomeça zerado). Guard `sess.config.nome || pastaProjeto` evita criar pasta antes da Etapa 1. Helper puro `acumulaTokenUsage` exportado para teste.
3. **Granularidade por dia, não por chamada.** Histórico por chamada cresceria sem limite e sem valor de leitura; por dia responde "quanto o projeto consumiu e quando" com arquivo pequeno e estável.
4. **Guarda de completude = `finish_reason` + marcador estrutural.** `isRespostaMelhoriasCompleta(texto, finishReason)`: `length` → incompleta; sem `### Melhorias Aplicadas` (seção final obrigatória do prompt) → incompleta mesmo com `stop` — pega cortes que o finish_reason não revela (ex.: abort de rede parcial).
5. **Continuação encadeando a resposta parcial como mensagem `assistant`.** Uma única tentativa, mesmo modelo/skill, instrução "continue exatamente de onde parou, sem repetir" com os últimos 200 chars como âncora; tokens da continuação transmitidos ao cliente e somados ao texto. Rejeitado: regenerar a aula inteira (dobra custo e pode truncar de novo no mesmo ponto).
6. **Falha final → preservar o anterior.** `novasPorAula` recebe a aula original, nada é persistido, `similaridade: 1 (truncada: true)` exclui a aula do realinhamento automaticamente (filtro `<= 0.90` existente), aviso SSE + linha no relatório. Princípio: conteúdo íntegro antigo vale mais que melhorado incompleto.
7. **`GET /api/tokens` agrega o projeto.** Resposta ganha campo opcional `projeto` (lido do JSON persistido); `refreshTokenCounter` exibe `sessão · projeto: N` sem novo endpoint.

## Risks / Trade-offs

- [10K < 16K anterior: mais cortes em aulas muito longas] → exatamente o cenário coberto pela continuação + preservação; decisão explícita do usuário (controle de custo).
- [Escrita síncrona por chamada OpenAI] → arquivo ~1KB, dezenas de chamadas por geração; custo de I/O desprezível frente à latência das chamadas.
- [Continuação pode repetir trecho] → âncora dos últimos 200 chars + instrução explícita; caso residual é aceitável (conteúdo duplicado é visível e editável, conteúdo perdido não).
- [Concorrência de sessões no mesmo projeto] → app single-user por design (sessões in-memory, G02); last-write-wins aceitável.

## Migration Plan

Sem migração: `token_usage.json` nasce vazio no primeiro uso; projetos antigos passam a acumular a partir de agora. Rollback = revert.

## Open Questions

Nenhuma — teto (10K) e escopo do histórico definidos pelo usuário.
