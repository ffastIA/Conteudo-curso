## ADDED Requirements

### Requirement: Cache local de consultas de pesquisa web
O sistema SHALL guardar em disco o resultado de cada consulta de pesquisa web bem-sucedida e SHALL reutilizá-lo quando a mesma consulta for refeita com entrada idêntica, sem chamar a OpenAI. A chave SHALL ser o hash (SHA-256) de `[versão do formato, modelo, search_context_size, instruções, entrada]` da chamada, de modo que qualquer mudança em ementa, nível, público, modalidade, metodologia, consulta ou ano gere outra chave. Cada entrada SHALL guardar o texto, as citações `url_citation`, o `usage` original, o modelo e a data de geração. O cache SHALL ficar em `.cache-pesquisa/` na raiz do app (ou em `PESQUISA_CACHE_DIR`), em um arquivo JSON por chave, com gravação atômica, e a pasta SHALL ser ignorada pelo git. `PESQUISA_CACHE=false` SHALL desligar leitura e gravação.

#### Scenario: Mesma consulta, mesma entrada
- **WHEN** a consulta c1 da Etapa 2 é executada duas vezes com a mesma ementa, nível, público e modelo
- **THEN** a segunda execução não chama a OpenAI, devolve o texto e as fontes da primeira e emite um `progress` informando que o resultado veio do cache e a data original

#### Scenario: Entrada diferente
- **WHEN** a ementa muda entre duas execuções da mesma consulta
- **THEN** a chave é outra e a consulta é feita na OpenAI

#### Scenario: Modelo ou contexto de busca diferentes
- **WHEN** o perfil muda o `search_context_size` ou o modelo de pesquisa
- **THEN** a chave é outra e o resultado de um perfil não é servido a outro

#### Scenario: Cache desligado
- **WHEN** `PESQUISA_CACHE=false`
- **THEN** nenhuma leitura nem gravação do cache ocorre e o comportamento é o anterior a esta capability

### Requirement: Só resultados bem-sucedidos entram no cache
O sistema SHALL gravar no cache somente respostas com texto não vazio e ao menos uma citação `url_citation`. Falhas, respostas sem citação, erros de configuração (HTTP 400) e o texto do fallback "sem pesquisa web" SHALL NOT ser gravados.

#### Scenario: Resposta sem citações
- **WHEN** a busca devolve texto sem nenhuma citação
- **THEN** nada é gravado no cache e a consulta segue tratada como falha, como em `web-research`

#### Scenario: Fallback sem busca
- **WHEN** o usuário escolhe "continuar sem pesquisa web"
- **THEN** o texto gerado não entra no cache

### Requirement: Validade e atualização do cache
O sistema SHALL tratar como expirada uma entrada mais antiga que `PESQUISA_CACHE_TTL_DIAS` (padrão 30; 0 desliga a leitura mantendo a gravação) e SHALL consultar a OpenAI de novo nesse caso, substituindo a entrada. A rota de pesquisa SHALL aceitar `?semCache=1` para ignorar o cache numa execução e regravá-lo. Uma entrada ilegível, corrompida ou de outra versão do formato SHALL ser ignorada com aviso no log, sem derrubar a etapa.

#### Scenario: Entrada expirada
- **WHEN** a entrada tem 31 dias e a validade é de 30
- **THEN** a consulta é refeita na OpenAI e a entrada é substituída

#### Scenario: Forçar nova pesquisa
- **WHEN** a Etapa 2 é executada com `?semCache=1`
- **THEN** todas as consultas vão à OpenAI e as entradas são regravadas

#### Scenario: Arquivo corrompido
- **WHEN** o arquivo da chave não é um JSON válido
- **THEN** o sistema o ignora, registra um aviso, consulta a OpenAI e regrava a entrada

### Requirement: Acerto de cache não consome orçamento
Um acerto de cache SHALL NOT reservar nem somar custo ao orçamento, SHALL NOT alimentar a calibração da estimativa e SHALL ser registrado no Langfuse como span `pesquisa.cache` com a chave abreviada e a idade da entrada. O registro da pesquisa (`pesquisa.json` e `pesquisa_modulos.json`) SHALL marcar cada consulta atendida pelo cache com `deCache: true` e a data original. A estimativa prévia de custo SHALL continuar sem presumir acertos.

#### Scenario: Orçamento intacto
- **WHEN** as quatro consultas da Etapa 2 vêm do cache
- **THEN** o gasto do projeto não aumenta e nenhuma reserva de orçamento é feita

#### Scenario: Calibração preservada
- **WHEN** há um acerto de cache
- **THEN** o fator de calibração da estimativa não muda

#### Scenario: Rastreabilidade
- **WHEN** uma consulta é atendida pelo cache
- **THEN** o trace registra o span `pesquisa.cache` e `pesquisa.json` marca a consulta com `deCache: true`
