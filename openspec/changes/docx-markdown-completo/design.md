## Context

`buildDocx(config, label, content, sites)` converte um subconjunto de Markdown. Os `sites` são listados sem URL clicável. `GAMMA_TEMPLATE_PROMPT_FIXO` é concatenado ao prompt dos slides (`server.js:1828`).

## Goals / Non-Goals

**Goals:** paridade entre `.docx` e UI para os elementos Markdown usados nas aulas; configuração de template sem código de marca.
**Non-Goals:** suporte total a CommonMark; imagens embutidas.

## Decisions

- **D1**: parser de blocos próprio e pequeno (títulos, listas, tabelas GFM, cercas de código) compartilhado entre servidor e cliente apenas por contrato de testes (não por módulo comum, pois o frontend é vanilla JS).
- **D2**: usa `Table`, `TableRow`, `TableCell`, `ExternalHyperlink` e `numbering` do `docx` v9.
- **D3**: `GAMMA_TEMPLATE_PROMPTS` é um JSON `{ "<templateId>": "instrução" }`; ausência de entrada = sem instrução fixa.
- **D4**: `config/modelos.js` centraliza `MODEL_RESEARCH`, `MODEL_CONTENT`, `MODEL_ECONOMY` lendo `process.env` com padrão atual.

## Risks / Trade-offs

- Divergência entre render do `.docx` e da UI → testes de contrato com amostras de Markdown.
- Quem depende do prompt fixo do Gamma perde o comportamento → migrar o valor atual para o `.env` do usuário e documentar.
