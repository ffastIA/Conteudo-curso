## Context

Hoje `/api/search` chama `chat.completions` com `web_search_options` e, em falha retriável, cai para `gpt-4o-mini` e grava o texto como pesquisa. O texto não tem marcação de origem, então plano de ensino e PPC usam texto de memória como se fosse pesquisa.

## Goals / Non-Goals

**Goals:** nunca gravar pesquisa sem selo; fontes estruturadas e verificáveis; modelo configurável.
**Non-Goals:** pesquisa por módulo; mudar o formato do `.docx` além da lista de fontes.

## Decisions

- **D1**: `executarPesquisaWeb` é o ponto único de busca (também usado por `pesquisa-modulos` e instrumentado por `observabilidade-langfuse`).
- **D2**: estados em `sess.pesquisaMeta.status` ∈ `web | sem_web | falhou`, persistidos em `pesquisa.json`.
- **D3**: SSE ganha o evento `decisao` (ou `error` com `acoes: ['tentar_novamente','continuar_sem_pesquisa']`); a escolha volta por endpoint POST `/api/search/decisao`.
- **D4**: `pesquisa.json` ausente em projetos antigos significa `fonte: 'legado'`; o fluxo antigo segue funcionando.
- **D5**: checagem de URL (`fetch` HEAD, 5 s) é opcional via `PESQUISA_VERIFICAR_URLS=true`.

## Risks / Trade-offs

- Mais chamadas por curso → custo/tempo maiores; mitigado por limite de 3–5 consultas e estimativa em `custo-e-logs`.
- API de busca muda de novo → validação na inicialização + smoke test manual.
- Mínimo de 3 fontes/2 domínios pode falhar em tópicos de nicho → UI oferece "continuar sem pesquisa".
