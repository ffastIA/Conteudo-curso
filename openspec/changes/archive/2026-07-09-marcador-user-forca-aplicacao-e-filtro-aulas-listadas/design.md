## Context

O ciclo de melhorias (Etapa 6) já tem um pipeline por aula bem definido em `server.js`: geração da seção "Melhorias a serem Aplicadas" no relatório (~linha 2457), parser `parseMelhoriasEstruturadas` no upload (~linha 228), e o loop de aplicação em `GET /api/aplicar-melhorias/confirmar` (~linha 2690) que passa por merge de patch (`mergeSecoesConteudo`), guarda de truncamento, rede de segurança de duplicação e gate de score (julgamento pareado, `EPSILON_ACEITE = 0.02`) antes de persistir. Hoje o loop roda para as `aulas.length` aulas sempre, e o gate de score é o único critério de aceite — não há forma de o revisor humano forçar a aplicação de um item específico, e aulas sem nenhuma melhoria listada na seção estruturada ainda passam pelo pipeline completo (custo de API desperdiçado e risco de alteração indevida).

## Goals / Non-Goals

**Goals:**
- Permitir que o revisor marque itens de melhoria, por aula, como "aplicar sempre" via uma linha `[user]` no corpo do bloco da aula.
- Parar de processar (chamar o modelo) aulas que não têm nenhuma melhoria na seção estruturada.
- Preservar todas as redes de segurança existentes (truncamento, duplicação de seção) — o bypass é estritamente do gate de score.
- Manter o relatório de melhorias auditável: toda aceitação forçada deve ficar visível e distinta de uma aceitação normal.

**Non-Goals:**
- Gate por item individual (aceitar/rejeitar cada melhoria isoladamente dentro de uma aula) — o bypass continua sendo por aula inteira, como o gate de score já é hoje.
- Alterar o parser legado (`Observações do Revisor`) — o marcador `[user]` só existe no formato de seção estruturada.
- Mudar o formato de upload (continua `.docx` via `multipart/form-data`) ou introduzir novo endpoint.

## Decisions

### 1. Onde o marcador `[user]` vive e como é reconhecido
O marcador é uma linha literal `[user]` inserida pelo próprio sistema ao final da lista de sugestões de cada aula na seção "Melhorias a serem Aplicadas" (função que monta `secaoMelhorias`, ~linha 2457-2468). O parser (`parseMelhoriasEstruturadas`) reconhece a linha via comparação normalizada exata (mesma função `normLine` já usada para o título da seção, tolerante a acento/caixa), aceitando um ponto final opcional (`[user]` ou `[user].`). Isso evita falso-positivo de uma melhoria de texto livre que por acaso contenha a string.

Alternativa considerada: exigir um formato mais verboso tipo `--- FIM DAS SUGESTÕES DA IA ---`. Rejeitada por ser mais verbosa sem ganho — `[user]` já comunica a intenção ("o que vem daqui é seu") e é fácil de digitar/preservar em edição manual no Word.

**Revisão pós-uso real (mesma implementação, forma adicional reconhecida):** o primeiro uso em produção mostrou que o revisor escreveu `[user] Incluir conceitos mais modernos dos tipos de memória ROM` **na mesma linha** do texto, não numa linha própria — seguindo o padrão que o próprio app já usa para a tag `[Critério]` (`[Qualidade Didática] Adicionar exercício...`, ver requisito "Foco do patch no critério-alvo indicado na melhoria"). Como o parser só reconhecia a linha `[user]` sozinha, essa melhoria não foi sinalizada como forçada (`forcado: false` persistido) **e** o prefixo `[user]` vazou como texto literal para `aplicarMelhoriasSkill` — plausivelmente contribuindo para uma resposta do modelo que duplicou um cabeçalho de seção e foi corretamente rejeitada pela rede de segurança de duplicação (aula preservada, sem dano, mas a melhoria pedida não foi aplicada). Correção: o parser agora reconhece **também** `[user]` como prefixo de uma linha de item (`/^\[user\]\.?\s*(.*)$/i`), removendo o prefixo do texto antes de adicioná-lo à lista e marcando só aquele item (e, por extensão, a aula inteira) como forçado — sem exigir a forma "linha separada", que continua funcionando para quem preferir demarcar um bloco inteiro de itens forçados de uma vez.

### 2. Forçar por aula inteira, não por item
Itens após `[user]` entram na mesma lista `porAula[i]` (mesmo array usado para a "lista numerada" passada a `aplicarMelhoriasSkill`) — o modelo não precisa saber que um item é "forçado", isso é uma decisão que o servidor toma depois, sobre o candidato final da aula inteira. Um novo array paralelo `forcadoPorAula[i]` (boolean) indica se aquela aula tem ao menos um item pós-marcador preenchido.

Alternativa considerada: marcar cada item individualmente e aplicar um gate por item (ex.: aceitar seções relacionadas ao item forçado mesmo se o score da aula cair). Rejeitada — o gate de score hoje já opera sobre a aula inteira (candidato pareado vs. original), não por seção; introduzir granularidade por item exigiria redesenhar o julgamento pareado (`scoreAulaSkill`) para avaliar seções isoladas, custo desproporcional ao pedido original ("aplicar independente do score").

### 3. Bypass do gate pula a chamada de score, não apenas ignora o resultado
Quando `forcadoPorAula[i]` é verdadeiro, o servidor **não invoca** `scoreAulaSkill`/julgamento pareado para aquela aula — define `aceita = true` diretamente, com `scoreOriginal = null` e `scoreCandidato = null`, e marca a entrada em `scoresPorAula` com `forcada: true`. Evita uma chamada de API cujo resultado seria descartado de qualquer forma, e evita ambiguidade no caso do julgamento falhar (o `catch` hoje trata falha como rejeição — inverteria a intenção do revisor).

Alternativa considerada: sempre computar o score (para fins de relatório) e só ignorar o resultado na decisão de aceite. Rejeitada por gastar uma chamada de API (custo real, o projeto já tem G05/rate-limit como preocupação registrada) sem mudar o resultado — o revisor já decidiu explicitamente que quer a aplicação.

### 4. Critério de "aula consta na seção"
Uma aula "consta na seção" quando `porAula[i].length > 0` após o parse — isso já cobre naturalmente os três casos possíveis (aula nunca mencionada com `Aula NN`; aula mencionada mas bloco vazio; aula mencionada com `Nenhuma`), sem precisar de uma flag adicional "encontrada vs. não encontrada". A restrição de pular a aula só se aplica quando `estruturado !== null` (seção presente) — persistida em sessão como `sess.modoLegadoMelhorias` (valor de `modoLegado` já calculado no upload, hoje só devolvido na resposta JSON e não guardado em sessão).

Alternativa considerada: adicionar uma flag explícita `encontradaNaSecao` distinta de "melhorias vazias". Rejeitada — o comportamento correto (pular, não chamar o modelo) é o mesmo nos dois casos; a distinção não muda nada observável e adicionaria estado sem valor.

### 5. Aula pulada por "sem melhorias na seção" segue o mesmo padrão das aulas puladas hoje
Reusa exatamente o padrão já existente para aulas truncadas/rejeitadas por score/merge rejeitado: `metricasPorAula.push({ aulaIndex, titulo, similaridade: 1, semMelhorias: true })`, conteúdo copiado byte a byte (`novasPorAula.push({ ...aula })`), sem chamada de API, sem elegibilidade ao realinhamento automático do plano de aula (o requisito de realinhamento já usa "similaridade ≤ 0.90" como critério de elegibilidade, então `similaridade: 1` já basta — nenhuma mudança necessária nesse requisito). A checagem acontece **antes** da pausa de 4s entre aulas (rate limiting), já que não há chamada de API a espaçar.

## Risks / Trade-offs

- [Risco] Revisor escreve algo abaixo de `[user]` sem perceber que aquilo terá aceite forçado, resultando em conteúdo persistido mesmo que a qualidade caia → Mitigação: a linha `[user]` já vem pré-inserida com uma instrução textual acima da seção (texto de orientação editado nesta mudança) explicando o efeito; o relatório também torna a aceitação forçada visível.
- [Risco] `[user]` grafado com variações (`[User]`, `[user] `, `[USER].`) não ser reconhecido → Mitigação: normalização já usada no projeto (`normLine`) mais tolerância a ponto final cobre os casos plausíveis de edição manual no Word.
- [Risco] Pular aulas sem melhorias na seção é uma mudança de comportamento visível (**BREAKING** comportamental) — um fluxo que hoje "sempre processa todas as aulas" pode surpreender quem dependia disso implicitamente → Mitigação: é exatamente o requisito já documentado ("Parser da seção estruturada... única zona lida pelo sistema") que não estava sendo cumprido; a correção alinha comportamento à spec existente, e o relatório sinaliza claramente quais aulas foram puladas e por quê.
- [Trade-off] Não computar score para aulas forçadas significa que o relatório não mostra "antes/depois" numérico nessas linhas — aceito porque o revisor já expressou a intenção de aplicar independentemente do score.

## Migration Plan

Mudança é aditiva/comportamental dentro do mesmo endpoint, sem migração de dados: `scr/observacoes_pendentes.json` e `scr/score_historico.json` continuam com o mesmo formato (novos campos são opcionais/aditivos: `forcadoPorAula` no parse em memória, `forcada` em `scoresPorAula`). Não há rollback especial — reverter o commit restaura o comportamento anterior sem efeitos colaterais em disco.

## Open Questions

Nenhuma — decisões acima cobrem os pontos de ambiguidade identificados na proposta.
