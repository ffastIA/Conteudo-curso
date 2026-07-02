## Why

Ao submeter a Etapa 1 ("Configurar Curso") com campos pedagógicos inalterados — por exemplo, apenas para atualizar o campo "Pasta do projeto" (`pastaProjeto`) — o sistema regenerava a ementa consumindo tokens da OpenAI e potencialmente sobrescrevendo uma ementa já revisada. Isso bloqueava o fluxo de reconfiguração de caminho sem reprocessamento, forçando o usuário a reimportar a ementa manualmente.

## What Changes

- `POST /api/config` (`server.js`): antes de atualizar `sess.config`, compara os campos pedagógicos do novo request com os da sessão atual. Se nenhum campo de conteúdo mudou (`nome`, `publico`, `carga`, `duracao`, `nivel`, `objetivos`) e uma ementa já existe em sessão, a geração da ementa é pulada — apenas a configuração é atualizada.

## Capabilities

### New Capabilities

Nenhuma nova capability.

### Modified Capabilities

- `course-config`: o endpoint de configuração do curso passa a preservar a ementa existente quando apenas campos operacionais (como `pastaProjeto`, `modalidade`, `proporcaoTeoricoPratico`, `preRequisitos`) são alterados.

## Impact

- **`server.js`**: handler `POST /api/config` — adição de comparação de campos antes da geração da ementa
- **Sem mudanças no frontend ou em outras etapas**
- **Sem novos endpoints ou dependências**
- **Redução de consumo de tokens** em reconfigurações que não alteram o conteúdo do curso

## Non-goals

- Não detecta mudanças semânticas nos campos pedagógicos além de comparação de string simples
- Não expõe endpoint dedicado para atualizar apenas `pastaProjeto`
- Não migra arquivos entre o caminho antigo e o novo quando `pastaProjeto` é alterado
