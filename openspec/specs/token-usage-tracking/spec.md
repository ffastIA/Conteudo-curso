## Purpose

Acumular e consultar o consumo de tokens das chamadas OpenAI de cada projeto,
persistido em disco e sobrevivendo a restarts do servidor.

## Requirements

### Requirement: Histórico de uso de tokens persistido por projeto
O sistema SHALL acumular o consumo de tokens de todas as chamadas OpenAI do projeto em `scr/token_usage.json`, com o formato `{ total: { prompt, completion, total }, porDia: { "YYYY-MM-DD": { prompt, completion, total } }, atualizadoEm }`. A acumulação SHALL ocorrer no ponto único `addUsage(usage, sess)` e SHALL ser tolerante a arquivo ausente ou corrompido (recomeça zerado, sem interromper a geração). A persistência SHALL ocorrer somente quando houver projeto identificável na sessão.

#### Scenario: Consumo acumulado através de restarts
- **WHEN** o usuário gera etapas, reinicia o servidor e gera novas etapas no mesmo projeto
- **THEN** `token_usage.json` contém o total acumulado de ambas as sessões e a quebra por dia

#### Scenario: Arquivo corrompido não interrompe a geração
- **WHEN** `token_usage.json` contém JSON inválido ou estrutura inesperada
- **THEN** a contagem recomeça zerada e a geração em curso prossegue normalmente

#### Scenario: Sem projeto configurado, nada é gravado
- **WHEN** chamadas OpenAI ocorrem antes de a Etapa 1 definir nome/pasta do projeto
- **THEN** apenas o contador global em memória é atualizado, sem criar pastas ou arquivos

---

### Requirement: Consulta do histórico de tokens do projeto
`GET /api/tokens` SHALL retornar, além do contador global da sessão, o campo `projeto` com o conteúdo de `token_usage.json` quando houver projeto identificável; o contador da interface SHALL exibir o acumulado do projeto ao lado do total da sessão.

#### Scenario: Contador da UI com acumulado do projeto
- **WHEN** um projeto está carregado e `token_usage.json` registra 150.000 tokens totais
- **THEN** a resposta de `GET /api/tokens` inclui `projeto.total.total = 150000` e o contador exibe o valor formatado ao lado do total da sessão
