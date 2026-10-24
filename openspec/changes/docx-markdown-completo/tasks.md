## 1. DOCX e UI

- [ ] 1.1 `server.js` `buildDocx`: listas numeradas, tabelas, código, itálico e `ExternalHyperlink` (docx v9)
- [ ] 1.2 `public/app.js` `renderMarkdown`: mesmo conjunto de elementos
- [ ] 1.3 Fontes com URL em `pesquisa.docx` e `.docx` de aula

## 2. Gamma e modelos

- [ ] 2.1 Mover `GAMMA_TEMPLATE_PROMPT_FIXO` (~1718) para `GAMMA_TEMPLATE_PROMPTS`; documentar em `.env.example` e README
- [ ] 2.2 `config/modelos.js` com `MODEL_RESEARCH`, `MODEL_CONTENT`, `MODEL_ECONOMY` e uso em `skills.js`
- [ ] 2.3 Skills com BNCC próprio (ementa) passam a usar `pedagCtxBlock`

## 3. Testes (última etapa)

- [ ] 3.1 `buildDocx` com tabela, código, lista numerada e link; contrato com `renderMarkdown`
- [ ] 3.2 Prompt Gamma com e sem configuração; modelos por ambiente
- [ ] 3.3 `npm test` verde e `openspec validate --all`
