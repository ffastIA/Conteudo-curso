## Why

`buildDocx` não gera listas numeradas, tabelas, blocos de código nem itálico, e `renderMarkdown` na UI tem o mesmo limite (achado B4); o `.docx` da pesquisa não traz as URLs das fontes; o `GAMMA_TEMPLATE_PROMPT_FIXO` carrega instruções de uma marca específica (logos) dentro do código (`server.js:1718`); modelos e o formato de contexto BNCC não estão centralizados (achado B5).

## What Changes

- `buildDocx`: listas numeradas, tabelas, blocos de código (fonte monoespaçada e sombreamento), itálico e links clicáveis para as fontes, com componentes do pacote `docx` v9 já instalado; `renderMarkdown` na UI renderiza o mesmo conjunto.
- `GAMMA_TEMPLATE_PROMPT_FIXO` movido para configuração por template (por exemplo `GAMMA_TEMPLATE_PROMPTS` por id), sem instruções de marca no código.
- Modelos centralizados em constantes configuráveis por ambiente: `OPENAI_RESEARCH_MODEL`, `OPENAI_CONTENT_MODEL`, `OPENAI_ECONOMY_MODEL` (padrão atual).
- Um único formato de contexto BNCC em todas as skills, via `pedagCtxBlock`.

## Capabilities

### New Capabilities
- `docx-rich-formatting`: formatos de saída em `.docx` e na UI.
- `model-configuration`: modelos configuráveis e contexto pedagógico único.

### Modified Capabilities
*(nenhuma)*

## Impact

- **`server.js`**: `buildDocx`, `GAMMA_TEMPLATE_PROMPT_FIXO` (~1718), constantes de modelo
- **`skills.js`**: constantes `MODEL_*`, skills com BNCC em formato próprio
- **`public/app.js`**: `renderMarkdown`
- **`.env.example`**: novas variáveis
- Sem dependência npm nova (`docx` v9 já presente).

## Non-goals

- Não trocar de biblioteca de DOCX nem adicionar editor visual.
- Não alterar o conteúdo dos prompts de Gamma além de movê-los para configuração.
- Não trocar o modelo padrão; apenas torná-lo configurável.
