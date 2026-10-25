## Why

Ao abrir uma pasta de projeto existente cujo `scr/projeto.json` não é JSON válido, `POST /api/carregar-projeto` aborta logo no `catch` do `JSON.parse` e devolve `etapasCarregadas: []`, sem nunca ler os `.txt` que continuam na pasta. O frontend ignora o `aviso`, então o usuário vê "nada carregado" e nenhuma explicação. Dois projetos reais estão assim (`TesteIdis`, com texto estranho de origem externa; `Curso_de_Node.js`, com JSON sobreposto — sinal de escrita não-atômica). Relacionado ao gap G04 (resiliência de estado do projeto).

## What Changes

- `POST /api/carregar-projeto`: um `projeto.json` inválido passa a ser tratado como ausente — o arquivo é preservado como `projeto.json.corrompido-<timestamp>.bak`, o fluxo segue pelo caminho legado (lê `.txt`, reconstrói `sess.aulas` a partir de `aula{NN}_conteudo.txt`, lista os arquivos reais) e a resposta inclui `aviso` (contendo "corrompido") e `backup`.
- `public/app.js` (`carregarProjetoPorPasta`): exibe o `aviso` ao usuário.
- `saveProject`: grava `projeto.json` de forma atômica (arquivo temporário + `rename`), reduzindo a chance de novas corrupções por escrita sobreposta.

## Non-goals

- Impedir sobrescritas externas ao app (outra ferramenta, sincronização do OneDrive) — só tolerá-las.
- Reconstruir BNCC, metodologia, `config` ou `stages` a partir dos `.txt` (continuam em `camposFaltantes`).
- Locks entre processos, migração/reparo em massa de projetos antigos, novas dependências npm.

## Capabilities

### New Capabilities
<!-- nenhuma -->

### Modified Capabilities
- `project-load`: tolerância a `projeto.json` corrompido no carregamento e gravação atômica do `projeto.json`.

## Impact

- `server.js`: `POST /api/carregar-projeto`, `saveProject`.
- `public/app.js`: `carregarProjetoPorPasta`.
- `tests/integration/api.test.js` (ajuste do teste de corrupção existente) e novos testes em `tests/integration/`.
- `openspec/specs/project-load` (delta). Sem novas dependências; sem operação assíncrona nova (SSE não se aplica).
