## Why

A documentação está desatualizada em relação ao código: `PROJECT.md` cita cookie `sid` (o real é `sessionId`), "30 endpoints" (cerca de 41 handlers), "240 testes" (são 317); o README só cobre até a Etapa 8; `openspec/config.yaml` cita `specs.yaml` e gaps antigos; `plans/README.md` marca os planos 001–005 como TODO (achados A5, B8).

## What Changes

- `PROJECT.md`: número de testes, cookie `sessionId`, contagem real de endpoints (recontada), modelos, novos modelos de dados (`pesquisa.json`, `pesquisa_modulos.json`, estados de aula, `geracao_log.json`) e novos gaps (G11 avaliação sobre texto truncado, G12 pesquisa sem verificação de fonte, G13 observabilidade de LLM).
- `README.md`: Etapas 9 e 10 e lista atual de endpoints.
- `openspec/config.yaml`: remover `specs.yaml`, atualizar modelos e gaps.
- `plans/README.md`: status dos planos 001 a 005.
- `openspec validate --all` ao final de cada change.

## Capabilities

### New Capabilities
*(nenhuma)*

### Modified Capabilities
- `project-documentation`: novos requisitos de sincronia da documentação (adicionados, sem alterar os existentes).

## Impact

- **`PROJECT.md`**, **`README.md`**, **`openspec/config.yaml`**, **`plans/README.md`**, **`CLAUDE.md`** (se citar números)
- Sem mudança de código.

## Non-goals

- Não reescrever a documentação inteira; apenas corrigir divergências e acrescentar o que as outras changes introduzem.
- Não gerar documentação automática de API.
