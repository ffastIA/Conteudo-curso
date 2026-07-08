# Tasks: docs-dx-claude-md-readme

> Referência detalhada (esqueleto do CLAUDE.md, tabela de rotas base, greps de
> verificação): `plans/004-dx-claude-md-env-example-readme.md`

## 1. Arquivos novos

- [x] 1.1 Criar `.env.example` na raiz com `OPENAI_API_KEY=` (placeholder vazio, comentário com URL da plataforma) e `# PORT=3000` — SEM abrir ou copiar o `.env`
- [x] 1.2 Criar `CLAUDE.md` na raiz (≤ 45 linhas) seguindo o esqueleto do plano: ponteiro para PROJECT.md, comandos (`npm test`, `npm run test:coverage`, `node server.js`), resumo das regras §8 e non-goals §10, menção ao workflow OpenSpec

## 2. README

- [x] 2.1 Regenerar a lista de rotas: `grep -nE "^app\.(get|post)\(" server.js`; comparar com a tabela do plano e usar a lista real
- [x] 2.2 Reescrever `README.md`: descrição (PROJECT.md §1), pipeline etapas 0–8, instalação via `.env.example`, estrutura de pastas real, tabela de endpoints, observações técnicas corrigidas (persistência dupla, modelos, eventos SSE) — sem mencionar `mcp-server.js`

## 3. PROJECT.md e verificação

- [x] 3.1 Em `PROJECT.md` (~linha 65): trocar "17 endpoints" pela contagem real do grep
- [x] 3.2 Verificações finais: `grep -ci "5 etapas" README.md` → 0; `grep -c "api/slides" README.md` ≥ 1; `.env.example` sem valor após `OPENAI_API_KEY=`; `npm test` verde; `git status` mostra só os 4 arquivos do escopo
