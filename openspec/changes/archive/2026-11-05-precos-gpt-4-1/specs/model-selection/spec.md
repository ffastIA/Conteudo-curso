## MODIFIED Requirements

### Requirement: Lista de modelos permitidos
O sistema SHALL oferecer, para cada papel, somente modelos que tenham preço em `config/precos-modelos.json` e capacidades em `config/modelos-capacidades.json` e que cumpram as exigências do papel naquela tabela (o papel `pesquisa` exige `busca_web`). A lista SHALL ser calculada a cada consulta, de modo que editar os dois arquivos a amplie sem alterar o código. O servidor SHALL recusar com HTTP 400 e uma mensagem qualquer papel desconhecido ou modelo fora da lista, sem alterar nada, e SHALL NOT aceitar nome de modelo livre.

#### Scenario: Lista da pesquisa
- **WHEN** a interface consulta `GET /api/orcamento` e as tabelas trazem `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` e `gpt-4.1-mini` com `busca_web`
- **THEN** `modelosDisponiveis.pesquisa` contém exatamente esses quatro modelos

#### Scenario: Modelo sem preço
- **WHEN** um modelo está em `modelos-capacidades.json` mas não em `precos-modelos.json`
- **THEN** ele não aparece em nenhum papel

#### Scenario: Modelo fora da lista
- **WHEN** a interface envia `POST /api/orcamento` com `{ "modelos": { "redacao": "gpt-9-fantasia" } }`
- **THEN** a resposta é HTTP 400 com a mensagem do erro e `uso.modelosEscolhidos` não muda

#### Scenario: Papel desconhecido
- **WHEN** a interface envia `{ "modelos": { "traducao": "gpt-4o" } }`
- **THEN** a resposta é HTTP 400 e nada é alterado

#### Scenario: Escolha que deixou de ser permitida
- **WHEN** o `uso.json` guarda um modelo que foi removido da tabela de preços
- **THEN** a chamada ignora a escolha, usa a resolução do perfil, o log registra um aviso e o painel indica que a escolha é inválida
