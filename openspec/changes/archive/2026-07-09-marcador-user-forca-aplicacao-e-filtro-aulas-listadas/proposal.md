## Why

Hoje o ciclo de aplicação de melhorias (Etapa 6) tem dois problemas observados em uso real: (1) não existe forma de o revisor humano garantir que uma melhoria específica seja aplicada quando o gate automático de score (`scoreCandidato >= scoreOriginal + 0.02`) rejeitaria o candidato — o revisor fica sem controle fino sobre aulas onde sabe que a mudança vale a pena mesmo que o julgamento pareado não capture o ganho; (2) em testes anteriores o sistema aplicou melhorias em aulas que **não constavam** na seção "Melhorias a serem Aplicadas" do documento anotado — o loop de aplicação processa todas as aulas do curso independentemente de terem ou não melhorias listadas nessa seção, contrariando a promessa já registrada no requisito "Parser da seção estruturada de melhorias" (esta seção é a única zona lida pelo sistema).

## What Changes

- Nova linha marcadora `[user]` inserida pelo sistema no corpo de cada bloco `Aula NN` da seção "Melhorias a serem Aplicadas" do relatório de revisão de qualidade gerado (Etapa 5★), abaixo das melhorias sugeridas pela IA.
- No upload do `.docx` anotado, `parseMelhoriasEstruturadas` passa a reconhecer o marcador `[user]` em duas formas: sozinho numa linha (itens não vazios escritos **após** ela, até a próxima `Aula NN` ou fim da seção, são marcados como "forçados") ou como prefixo de uma linha de item (`[user] texto`, mesmo padrão já usado pela tag `[Critério]` deste app) — forma adicionada após um caso real de uso mostrar que o revisor naturalmente escreve o marcador colado ao texto, não numa linha separada.
- No ciclo de aplicação (`GET /api/aplicar-melhorias/confirmar`), uma aula com pelo menos um item forçado tem o **gate de aceite por score ignorado**: o candidato é sempre persistido, independentemente de `scoreCandidato` vs `scoreOriginal`. As demais redes de segurança (guarda de truncamento/continuação, rede de segurança de duplicação de seções) continuam valendo normalmente — o bypass é só do critério de score.
- O relatório `melhorias_aplicadas_<timestamp>.docx`, seção `## Scores do Ciclo`, passa a indicar quando a aceitação de uma aula foi forçada pelo marcador `[user]` (distinguindo de aceitação normal por score).
- **BREAKING** (comportamental, não de API): o loop de aplicação passa a **pular integralmente** (sem chamada ao modelo, conteúdo mantido byte a byte) qualquer aula que não tenha nenhuma melhoria na seção estruturada — hoje essa aula é processada como as demais. Essa restrição vale apenas quando a seção estruturada está presente (`parseMelhoriasEstruturadas` retorna não-nulo); o modo legado (fallback "Observações do Revisor") não muda.

## Capabilities

### New Capabilities

(nenhuma — esta mudança estende uma capability existente)

### Modified Capabilities

- `improvement-application-cycle`:
  - Requisito "Parser da seção estruturada de melhorias" ganha a regra do marcador `[user]` (itens após a linha são marcados como forçados).
  - Requisito "Aplicação de melhorias por aula com confirmação" ganha a regra de **pular aulas sem melhorias na seção estruturada** (nenhuma chamada de API, similaridade tratada como 1, sem elegibilidade a realinhamento).
  - Requisito "Gate de aceite por score no ciclo de melhorias" ganha a exceção de bypass quando a aula tem itens forçados por `[user]`.
  - Requisito "Seção de scores no relatório de melhorias" passa a diferenciar aceitação normal de aceitação forçada.

## Impact

- `server.js`: geração da seção "Melhorias a serem Aplicadas" (~linha 2457-2468), `parseMelhoriasEstruturadas` (~linha 228-268), loop de `GET /api/aplicar-melhorias/confirmar` (~linha 2690 em diante, incluindo o gate de score ~linha 2832-2874 e a montagem do relatório ~linha 3063-3078).
- Nenhuma dependência nova. Nenhuma mudança de schema de sessão além do já existente `sess.observacoesMelhorias` (passa a carregar também a marca de "forçado" por aula).
- Sem impacto em ementa, plano de ensino, autenticação ou multi-tenancy (non-goals permanentes do projeto).
