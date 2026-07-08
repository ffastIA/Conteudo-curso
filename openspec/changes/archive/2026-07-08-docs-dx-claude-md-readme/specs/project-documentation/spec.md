# project-documentation

## ADDED Requirements

### Requirement: README fiel ao sistema real
O `README.md` SHALL descrever o pipeline com as etapas realmente implementadas (0–8, incluindo slides), listar os endpoints existentes em `server.js` e nomear os modelos de IA efetivamente usados (`gpt-4o-mini` e `gpt-4o-search-preview`).

#### Scenario: Pipeline e endpoints corretos
- **WHEN** o README é comparado com as rotas de `server.js` (grep `^app\.(get|post)\(`)
- **THEN** toda rota da tabela do README existe no código e a etapa de slides (`/api/slides`) está documentada

#### Scenario: Modelo antigo não é mais citado como gerador
- **WHEN** o README é inspecionado
- **THEN** `gpt-4o-mini` aparece como modelo de geração e nenhuma menção descreve `gpt-4o` como o gerador das etapas

### Requirement: Exemplo de configuração de ambiente sem segredos
O repositório SHALL conter `.env.example` na raiz listando as variáveis de ambiente suportadas, com `OPENAI_API_KEY` obrigatória documentada e **sem nenhum valor preenchido**.

#### Scenario: Placeholder vazio
- **WHEN** `.env.example` é lido
- **THEN** a linha `OPENAI_API_KEY=` não contém nenhum caractere após o `=`

#### Scenario: Arquivo versionável
- **WHEN** `git check-ignore .env.example` é executado
- **THEN** o comando sai com código 1 (o arquivo não é ignorado)

### Requirement: Ponto de entrada para agentes
O repositório SHALL conter `CLAUDE.md` na raiz que referencia `PROJECT.md` como guia canônico e lista os comandos de verificação do projeto (`npm test`, `npm run test:coverage`).

#### Scenario: Ponteiro para o guia canônico
- **WHEN** `CLAUDE.md` é lido
- **THEN** ele menciona `PROJECT.md` e contém os comandos `npm test` e `npm run test:coverage`
