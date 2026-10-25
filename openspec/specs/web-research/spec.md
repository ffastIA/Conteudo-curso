# web-research Specification

## Purpose
TBD - created by archiving change pesquisa-web-real. Update Purpose after archive.
## Requirements
### Requirement: Busca web por função única e modelo configurável
O sistema SHALL executar buscas web exclusivamente por `executarPesquisaWeb(consulta, opcoes)`, usando o modelo definido em `OPENAI_RESEARCH_MODEL`, e SHALL validar na inicialização se o modelo aceita a ferramenta de busca, emitindo aviso quando não aceitar.

#### Scenario: Modelo incompatível
- **WHEN** o servidor inicia com um modelo que não aceita a ferramenta de busca
- **THEN** um aviso claro é registrado no log de inicialização

#### Scenario: Parâmetro de busca inválido em runtime
- **WHEN** a API responde 400 por parâmetro de busca
- **THEN** o erro é tratado como configuração inválida com mensagem clara, sem retentativa e sem fallback automático

### Requirement: Pesquisa em múltiplas consultas atuais
A Etapa 2 SHALL executar de 3 a 5 consultas planejadas a partir de ementa, nível, público e tópicos extras, usar o ano corrente obtido de `new Date().getFullYear()` e SHALL pedir fontes primárias, emitindo `progress` para cada consulta executada.

#### Scenario: Consultas planejadas
- **WHEN** a Etapa 2 inicia
- **THEN** entre 3 e 5 consultas são executadas e cada uma gera um evento `progress`

#### Scenario: Ano dinâmico
- **WHEN** o prompt de pesquisa é montado
- **THEN** ele não contém o texto fixo "2024-2025" e usa o ano corrente

### Requirement: Estados da pesquisa sem falha silenciosa
A pesquisa SHALL ter os estados `web`, `sem_web` e `falhou`. Uma resposta sem nenhuma anotação `url_citation` SHALL ser tratada como falha de busca, e o resultado SHALL exigir ao menos 3 fontes em 2 domínios distintos para ser `web`.

#### Scenario: Resposta de memória
- **WHEN** a resposta não contém anotações `url_citation`
- **THEN** o estado é `falhou` e a UI oferece "tentar novamente" ou "continuar sem pesquisa"

#### Scenario: Fontes insuficientes
- **WHEN** há menos de 3 fontes ou menos de 2 domínios
- **THEN** o log avisa e a UI oferece as duas opções

### Requirement: Fallback somente por decisão explícita
O fallback para `gpt-4o-mini` SHALL ocorrer apenas após decisão explícita do usuário e SHALL gravar `fonte: 'modelo_sem_busca'`, exibindo o selo "sem pesquisa web" nos documentos e na UI. As etapas seguintes SHALL receber instrução de não citar esse texto como fonte.

#### Scenario: Usuário continua sem pesquisa
- **WHEN** o usuário escolhe "continuar sem pesquisa"
- **THEN** `pesquisa.txt`/`.docx` trazem o selo e `pesquisa.json` tem `status: 'sem_web'`

#### Scenario: Falha nunca produz pesquisa sem selo
- **WHEN** a busca falha e o usuário não decide
- **THEN** nenhum `pesquisa.txt` é gravado

### Requirement: Resultado estruturado persistido
O sistema SHALL gravar `scr/pesquisa.json` com `status`, `modelo`, `geradoEm`, `consultas`, `fontes` (id, url, título, domínio, consultaId) e `achados` (tema, resumo, fonteIds), além de `pesquisa.txt` e `pesquisa.docx` com a lista de fontes e URLs.

#### Scenario: Pesquisa concluída
- **WHEN** a Etapa 2 conclui com `status: 'web'`
- **THEN** `pesquisa.json`, `pesquisa.txt` e `pesquisa.docx` existem e a lista de fontes tem URLs

### Requirement: Preservação do resultado estruturado
`saveProject`, `carregar-projeto` e importar/confirmar SHALL ler e preservar `pesquisa.json`; um `.docx` de pesquisa editado e reimportado SHALL resultar em `fonte: 'usuario'` mantendo as fontes originais.

#### Scenario: Recarregar projeto
- **WHEN** um projeto com `pesquisa.json` é carregado
- **THEN** consultas, fontes e achados estão disponíveis na sessão

#### Scenario: Projeto legado
- **WHEN** o projeto não tem `pesquisa.json`
- **THEN** a pesquisa é tratada como `fonte: 'legado'` e o fluxo antigo continua funcionando

