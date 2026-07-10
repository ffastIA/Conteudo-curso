## 1. Parser: marcador `[user]`

- [x] 1.1 Em `server.js`, na função `parseMelhoriasEstruturadas` (~linha 228-268), adicionar detecção da linha marcadora: dentro do loop que varre linhas do bloco de cada aula, comparar `normLine(bruta).replace(/\.$/, '')` contra `'[user]'` antes de tratar a linha como item; ao encontrar, ativar uma flag local `apósMarcador = true` para o bloco atual e `continue` (não empurrar a linha como melhoria).
- [x] 1.2 Adicionar array `forcadoPorAula = Array.from({ length: totalAulas }, () => false)`; ao empurrar um item para `porAula[atual]` enquanto `apósMarcador` estiver ativo, marcar `forcadoPorAula[atual] = true`.
- [x] 1.3 Resetar `apósMarcador = false` sempre que uma nova linha `Aula NN` for encontrada (novo bloco).
- [x] 1.4 Ao processar a palavra reservada `Nenhuma` (reset de `porAula[atual] = []`), também resetar `forcadoPorAula[atual] = false`, para o caso raro de `Nenhuma` aparecer depois de itens `[user]` já processados no mesmo bloco.
- [x] 1.5 Atualizar o retorno da função para `{ porAula, avisos, forcadoPorAula }`.

## 2. Upload: persistir sinalização de forçado e modo

- [x] 2.1 Em `server.js`, no handler `POST /api/aplicar-melhorias` (~linha 2505-2520), ao montar `observacoesPorAula` a partir de `estruturado`, incluir `forcado: estruturado.forcadoPorAula[i]` em cada item (`{ titulo, observacoes, melhorias, forcado }`). No ramo do fallback legado, incluir `forcado: false` em cada item para manter o shape consistente.
- [x] 2.2 Persistir `sess.modoLegadoMelhorias = modoLegado;` junto a `sess.observacoesMelhorias = observacoesPorAula;` (~linha 2549), para que o loop de confirmação em outro endpoint saiba distinguir os dois modos sem reprocessar o `.docx`.

## 3. Geração do relatório: inserir a linha `[user]` por aula

- [x] 3.1 Em `server.js`, no bloco que monta `secaoMelhorias` (~linha 2457-2468), após a lista de itens de cada aula (`itens.map(...)`), acrescentar uma linha `[user]` antes da linha em branco de separação entre aulas.
- [x] 3.2 Atualizar o texto de instrução acima do título "## Melhorias a serem Aplicadas" (~linha 2459-2460) para explicar o efeito do marcador, por exemplo: informar que itens escritos abaixo de `[user]` em cada aula serão aplicados mesmo que a avaliação automática de qualidade não aponte melhora.

## 4. Ciclo de aplicação: pular aulas sem melhorias na seção

- [x] 4.1 Em `server.js`, no handler `GET /api/aplicar-melhorias/confirmar` (~linha 2690 em diante), no início do corpo do `for` (antes da pausa de 4s), calcular a condição de pular a aula. Ajuste em relação ao task original: a condição também exige `!!sess.observacoesMelhorias` (upload real realizado) — sem isso, uma sessão que nunca passou pelo upload (ex.: fluxo de teste que popula `conteudoPorAula` diretamente) ficaria com `modoLegadoMelhorias` no valor padrão `false` e todas as aulas seriam puladas incorretamente por "ausência de melhorias", quebrando o cenário de confirmar sem upload prévio.
- [x] 4.2 Quando `semMelhoriasNaSecao` for verdadeiro: emitir `progress` informando que a aula foi mantida sem alteração por não constar na seção; emitir o `token` do heading da aula (mesmo formato hoje usado) seguido do `aula.texto` original; acrescentar a `fullText`; empurrar para `reportSections` uma entrada equivalente às já existentes para aulas puladas (ex.: aula truncada, ~linha 2784); empurrar `metricasPorAula` com `{ aulaIndex: i + 1, titulo: aula.titulo, similaridade: 1, semMelhorias: true }`; empurrar `novasPorAula.push({ ...aula })`; `continue` — sem chamar `skills.aplicarMelhoriasSkill` nem a pausa de 4 segundos.
- [x] 4.3 Confirmar que aulas processadas normalmente (não puladas) continuam recebendo `melhorias: observacoes[i]?.melhorias` no parâmetro passado a `aplicarMelhoriasSkill` (já existente, ~linha 2715) — nenhuma mudança de assinatura necessária, os itens `[user]` já entram na mesma lista.

## 5. Gate de score: bypass quando houver item forçado

- [x] 5.1 Em `server.js`, antes do bloco do gate de score (~linha 2822-2867), calcular `const forcadaPorUser = !sess.modoLegadoMelhorias && !!observacoes[i]?.forcado;`.
- [x] 5.2 Envolver a chamada ao julgamento pareado (`skills.scoreAulaSkill` + `openai.chat.completions.create` + cálculo de `scoreOriginal`/`scoreCandidato`) num `if (!forcadaPorUser) { ... } else { aceita = true; }`, evitando a chamada de API quando forçada.
- [x] 5.3 Ao empurrar em `scoresPorAula` (~linha 2868), incluir o campo `forcada: forcadaPorUser` em cada entrada.
- [x] 5.4 Confirmar que o bloco de rejeição (`if (!aceita) { ... continue; }`, ~linha 2870-2880) permanece inalterado — com `aceita` sempre `true` quando `forcadaPorUser`, esse ramo naturalmente não é atingido para essas aulas, preservando a guarda de truncamento e a rede de segurança de duplicação (que já rodam antes do gate, ~linha 2794-2820, inalteradas).

## 6. Relatório: distinguir aceitação forçada

- [x] 6.1 Em `server.js`, na montagem da seção `## Scores do Ciclo`, alterar o `map` para: se `s.forcada` for verdadeiro, renderizar `- Aula ${s.aula} (${s.titulo}): aceita (forçada por [user])`; senão manter a lógica atual (não avaliada / score antes → depois). Ajuste adicional em relação ao task original: a condição que decide **exibir a seção** (antes gateada por `avaliadas.length`, que exclui aulas forçadas por terem score `null`) foi separada da condição que decide **persistir o histórico** (`ganhoMedio`) — a seção agora é exibida sempre que `scoresPorAula.length > 0`, senão um ciclo com todas as aulas forçadas por `[user]` ficaria sem a seção `## Scores do Ciclo` no relatório.
- [x] 6.2 Confirmar que o filtro `avaliadas` usado para `ganhoMedio` (`s.scoreOriginal !== null && s.scoreCandidato !== null`) já exclui aulas forçadas (que têm ambos `null`) sem necessidade de alteração.

## 7. Testes

- [x] 7.1 Em `tests/unit/melhorias-parser.test.js`, adicionar casos para: itens após `[user]` marcados em `forcadoPorAula`; marcador sem itens preenchidos não sinaliza nada; tolerância a grafias (`[User]`, `[user].`); `Nenhuma` após itens `[user]` no mesmo bloco reseta ambos os arrays.
- [x] 7.2 Adicionado `tests/integration/melhorias-marcador-user.test.js` (novo arquivo, seguindo o padrão de `tests/integration/sse.test.js`) cobrindo, via upload real (com `mammoth` mockado) seguido de `/api/aplicar-melhorias/confirmar`: (1) aula ausente da seção estruturada é pulada sem nenhuma chamada de API; (2) item após `[user]` força a aceitação sem chamar o julgamento pareado de score — ambos verificados por contagem exata de chamadas ao mock da OpenAI.
- [x] 7.3 `npm test`: 195/195 (era 188/188 antes da mudança). `npm run test:coverage`: 62.04% de linhas, acima do gate de 40%.

## 8. Correção pós-uso real: [user] como prefixo inline

- [x] 8.1 Achado ao investigar um caso real (curso "Manutenção de Computadores", Aula 9): o revisor escreveu `[user] Incluir conceitos mais modernos dos tipos de memória ROM` na mesma linha do item (seguindo o padrão já usado pela tag `[Critério]` neste app), não na forma "linha separada" prevista originalmente. Isso deixava `forcado: false` persistido e vazava o texto literal `[user] ...` para `aplicarMelhoriasSkill`. Em `server.js`, na função `parseMelhoriasEstruturadas` (~linha 233-284), adicionado reconhecimento de `[user]` também como prefixo de uma linha de item (regex `/^\[user\]\.?\s*(.*)$/i` aplicada após a remoção dos prefixos de lista), removendo o prefixo do texto e marcando `forcadoPorAula[atual] = true` apenas quando há texto após o prefixo.
- [x] 8.2 Testes adicionados em `tests/unit/melhorias-parser.test.js`: prefixo inline força só aquele item e remove o prefixo do texto (caso real da Aula 9); prefixo inline convive com itens normais no mesmo bloco; tolerância a grafia e a ausência de texto após o prefixo.
- [x] 8.3 Specs delta (`specs/improvement-application-cycle/spec.md`) e `design.md` atualizados para documentar as duas formas do marcador (linha separada e prefixo inline) e o achado que motivou a segunda forma.
- [x] 8.4 `npm test`: 198/198 (era 195/195 antes desta correção).
