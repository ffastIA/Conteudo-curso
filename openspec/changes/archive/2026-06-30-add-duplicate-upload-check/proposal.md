## Why

O usuário pode carregar por engano o mesmo relatório de revisão duas vezes e executar o ciclo de melhorias em duplicata — consumindo créditos de API, sobrescrevendo `conteudo.docx` com conteúdo praticamente idêntico e gerando um `ciclo_{NNN}/` desnecessário. Não há nenhuma proteção atual contra essa situação. O sistema já armazena as observações do último upload em `observacoes_pendentes.json` e já possui `textSimilarity()` — a verificação pré-execução é viável sem custo de LLM.

## What Changes

- **Check de duplicata no upload** (`POST /api/aplicar-melhorias`): antes de sobrescrever `observacoes_pendentes.json`, ler o arquivo existente e calcular a similaridade Jaccard entre as observações do novo upload e as anteriores; se similaridade > 0.85 e ambas as partes tiverem conteúdo, incluir `aviso: 'possivel_duplicata'` na resposta com o percentual e a data do último upload
- **Constante de threshold** `DUPLICATE_OBS_THRESHOLD = 0.85` configurada no topo do handler para facilitar ajuste futuro
- **Banner de alerta no frontend** (`app.js`): se a resposta trouxer `aviso: 'possivel_duplicata'`, exibir banner com percentual e data, bloquear o botão "Aplicar Melhorias" e apresentar dois botões: "Cancelar" e "Aplicar mesmo assim"
- **Endpoint `confirmar` sem alteração**: o check é pré-execução; se o usuário confirmar, o fluxo existente é chamado normalmente

## Capabilities

### New Capabilities

_(nenhuma — proteção sobre fluxo existente, sem nova tela ou endpoint)_

### Modified Capabilities

- `improvement-application-cycle`: upload SHALL verificar similaridade com observações anteriores antes de permitir execução; aviso SHALL ser exibido ao usuário quando limiar for excedido

## Impact

- **`server.js`**: `POST /api/aplicar-melhorias` — leitura de `observacoes_pendentes.json` antes do save, cálculo de similaridade, enriquecimento da resposta
- **`public/app.js`**: handler da resposta do upload — tratar `aviso: 'possivel_duplicata'` com banner + botões de confirmação
- **`public/index.html`**: possível adição de elemento de banner de alerta de duplicata (se não reutilizar elemento existente)
- **Endpoint `/api/aplicar-melhorias/confirmar`**, `skills.js`, estrutura de disco: sem alteração
