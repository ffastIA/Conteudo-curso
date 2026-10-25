## 1. Núcleo de orçamento (custo.js)

- [ ] 1.1 `lerTetos(env, usoProjeto)`: tetos de projeto/dia/etapa (`ORCAMENTO_MAX_USD`, `ORCAMENTO_DIA_MAX_USD`, `ORCAMENTO_ETAPA_MAX_USD`), `ORCAMENTO_USD` como sinônimo com aviso único de depreciação, valores inválidos viram "sem teto" com aviso; tetos ajustados pelo usuário (em `uso.json`) prevalecem sobre o ambiente
- [ ] 1.2 Contabilidade em memória por escopo: `reservar(escopos, valor)` (nega se algum escopo não comporta; conta reservas em voo), `acertar(reserva, custoReal)` e `liberar(reserva)`; sem nenhum teto, `reservar` não faz nada (custo zero)
- [ ] 1.3 Alerta em `ORCAMENTO_ALERTA_PCT` (padrão 80): uma vez por escopo e por valor de teto, rearmado quando o teto muda
- [ ] 1.4 Calibração: fator = média móvel de `real / estimado` por etapa, limitado a 0,5×–3×; margem `ORCAMENTO_MARGEM_PCT` (padrão 15) somada à reserva; `estimarEtapa` e `estimarCustoChamada` passam a aplicar o fator
- [ ] 1.5 Tarifa da busca web: `buscaWebPorChamadaUsd` em `config/precos-modelos.json` (padrão 0), somada ao custo das chamadas `responses` com `web_search`; sinalizar "tarifa não configurada" quando 0

## 2. Persistência (uso.json e arquivo diário)

- [ ] 2.1 `scr/uso.json`: gasto por dia/etapa/modelo, calibração, tetos do usuário, perfil, estado de pausa e de disjuntor; gravação atômica (arquivo temporário + renomeação); leitura tolerante (ausente/corrompido vira estado vazio com aviso)
- [ ] 2.2 Preservar `uso.json` em carregar-projeto e importar (restaurar gasto, perfil e tetos) e gravá-lo junto com `projeto.json`
- [ ] 2.3 `.uso-diario.json` global (`{ data, totalUsd }`, redirecionável por `USO_DIARIO_FILE`): soma o dia entre projetos, zera na virada da data local; se não puder ser lido/gravado, o escopo dia fica desligado com aviso
- [ ] 2.4 Reservas em voo nunca são persistidas

## 3. Integração no wrapper e nas etapas (server.js)

- [ ] 3.1 `chamarOpenAI`: estimar → reservar nos escopos → chamar → acertar com o `usage` real (ou liberar em falha); mantém o disjuntor de falhas existente; sem teto, caminho idêntico ao atual
- [ ] 3.2 Tratamento de `ORCAMENTO_EXCEDIDO` nos handlers SSE: parar a etapa preservando o trabalho salvo, gravar o estado pausado e emitir `pausado_orcamento` (`escopo`, `gastoUsd`, `tetoUsd`, `estimativaProximaUsd`, `opcoes`); nunca emitir o `done` de sucesso nem gravar parcial como oficial
- [ ] 3.3 Reexecução depois da pausa: com o teto ainda estourado, pausa de imediato sem chamar a OpenAI; com o teto aumentado ou o perfil trocado, retoma pela retomada existente (`geracao-retomavel`) sem regenerar o que está pronto
- [ ] 3.4 Eventos SSE `alerta_orcamento` e `perfil_alterado` emitidos nos pontos de reserva e de troca de perfil
- [ ] 3.5 `GET /api/orcamento` e `POST /api/orcamento` (tetos, perfil, decisão após pausa/disjuntor), com validação (HTTP 400 para valores inválidos) e sem expor chaves ou caminhos externos

## 4. Perfis, papéis e juiz em cascata

- [ ] 4.1 `config/perfis-custo.json` (Econômico, Padrão, Premium com os parâmetros de D4) lido em tempo de execução; `CUSTO_PERFIL` (padrão `padrao`; inválido cai no `padrao` com aviso); perfil por projeto em `uso.json`
- [ ] 4.2 Aplicar o perfil: número de consultas em `planejarConsultasPesquisa`, `searchContextSize`, papel do modelo de redação, máximo de ciclos de melhoria, fontes do dossiê por seção (`fundamentacao`)
- [ ] 4.3 Degradação automática entre unidades de trabalho (um nível por vez, nunca sobe sozinho, `CUSTO_DEGRADACAO_AUTOMATICA=false` desliga, nada degrada sem teto)
- [ ] 4.4 `config/modelos.js`: papéis `resumos` (`OPENAI_SUMMARY_MODEL`), `avaliacao` (`OPENAI_EVAL_MODEL`) e `juiz` (`OPENAI_JUDGE_MODEL`) além de pesquisa e redação; resolvidos na hora da chamada, considerando o perfil; papel registrado como metadado da `generation`
- [ ] 4.5 `config/modelos-capacidades.json` e validação na inicialização (aviso no log e no painel; nunca erro)
- [ ] 4.6 Juiz final em cascata em `julgarVersoes`: forte só quando o ganho de nota fica a até `JUIZ_MARGEM_GANHO` de `EPSILON_CONVERGENCIA` ou rubrica e determinístico divergem mais que `JUIZ_DIVERGENCIA_MAX`; Premium sempre, Econômico nunca

## 5. Disjuntor com gatilhos

- [ ] 5.1 Registro de gatilhos por unidade em `criarDisjuntor`: custo (`DISJUNTOR_FATOR_CUSTO`), erro repetido (`DISJUNTOR_ERROS_SEGUIDOS`), sem ganho (`DISJUNTOR_GANHO_MIN`, padrão `EPSILON_CONVERGENCIA`; interrompe em Econômico/Padrão, só avisa no Premium) e continuações esgotadas; o disjuntor de falhas da API é mantido
- [ ] 5.2 Ao disparar: interromper a etapa, marcar a unidade incompleta com o texto parcial em `.partial` (nunca no arquivo oficial), registrar motivo/valores em `uso.json` e no log (com `traceId`), emitir `disjuntor` com as opções e esperar a decisão
- [ ] 5.3 Decisão do usuário por `POST /api/orcamento` (`aumentar-limite`, `trocar-perfil`, `pular`); reset só manual; reexecutar sem decidir interrompe de imediato sem chamar a OpenAI; unidade pulada permanece incompleta e fora dos consolidados
- [ ] 5.4 Langfuse: nível de aviso e motivo como metadado do span/`generation` da unidade; `perfil` e `orcamento_restante_usd` como metadados do trace (`definirMetadadoTrace`)

## 6. Interface (public/index.html, public/app.js)

- [ ] 6.1 Painel de orçamento: saldo restante, gasto por etapa, perfil ativo, alertas, aviso de tarifa da busca web não configurada e de modelo não validado; atualizado pelos eventos SSE `alerta_orcamento`, `pausado_orcamento`, `perfil_alterado` e `disjuntor`
- [ ] 6.2 Confirmação antes de etapas pesadas quando a faixa máxima da estimativa passa do saldo restante de algum escopo (cancelar, aumentar o teto ou continuar)
- [ ] 6.3 Diálogos de decisão após pausa por orçamento e após disparo do disjuntor, ligados a `POST /api/orcamento`; ao decidir, a etapa pode ser executada de novo para retomar

## 7. Configuração e documentação

- [ ] 7.1 `.env.example`: `ORCAMENTO_MAX_USD`, `ORCAMENTO_DIA_MAX_USD`, `ORCAMENTO_ETAPA_MAX_USD`, `ORCAMENTO_ALERTA_PCT`, `ORCAMENTO_MARGEM_PCT`, `CUSTO_PERFIL`, `CUSTO_DEGRADACAO_AUTOMATICA`, `OPENAI_SUMMARY_MODEL`, `OPENAI_EVAL_MODEL`, `OPENAI_JUDGE_MODEL`, `JUIZ_MARGEM_GANHO`, `JUIZ_DIVERGENCIA_MAX`, `DISJUNTOR_FATOR_CUSTO`, `DISJUNTOR_ERROS_SEGUIDOS`, `DISJUNTOR_GANHO_MIN`, `USO_DIARIO_FILE`; marcar `ORCAMENTO_USD` como sinônimo
- [ ] 7.2 `PROJECT.md` (contagem de handlers com as duas rotas novas, `uso.json` no modelo de dados, perfis e papéis, capabilities canônicas ao arquivar), `README.md` (rotas `/api/orcamento`) e `docs/` (guia de orçamento, perfis e disjuntor, com o aviso de que os valores do plano são ilustrativos)
- [ ] 7.3 Registrar a decisão: segunda linha de base descartada (calibração só com o `capcut`) e otimizações de tokens da 1C.5 adiadas para uma change própria

## 8. Testes (última etapa)

- [ ] 8.1 Unitários de `custo.js`: tetos e sinônimo, valores inválidos, reserva/acerto/liberação, reservas concorrentes, alerta único e rearme, calibração (faixa 0,5×–3×) e margem, tarifa da busca web
- [ ] 8.2 Persistência: gravação atômica (falha no meio não trunca), arquivo corrompido, preservação em carregar-projeto/importar, teto diário entre projetos, virada do dia e arquivo global inacessível
- [ ] 8.3 Integração com orçamento baixo simulado: alerta em 80%, degradação Padrão → Econômico entre aulas, pausa em 100% sem exceder o teto além de uma chamada, `pausado_orcamento` sem `done`, reexecução sem aumentar o teto sem chamada à OpenAI, retomada após aumentar o teto sem regenerar o pronto
- [ ] 8.4 Perfis e papéis: parâmetros de cada perfil aplicados, perfil inválido, troca sem reiniciar, herança dos papéis, validação de capacidades (aviso, nunca erro)
- [ ] 8.5 Juiz em cascata: caso claro não chama o forte, caso duvidoso e divergência chamam, Premium sempre, Econômico nunca
- [ ] 8.6 Disjuntor: os quatro gatilhos (custo, erro repetido, sem ganho por perfil, continuações), parcial em `.partial` e nunca no oficial, decisões `aumentar-limite`/`trocar-perfil`/`pular`, reset manual e registro com `traceId`
- [ ] 8.7 Teste estático: nenhuma chamada à OpenAI fora do wrapper com reserva; `GET/POST /api/orcamento` (validação, HTTP 400, sem segredos); Langfuse (`perfil`, `orcamento_restante_usd`, papel por `generation`)
- [ ] 8.8 Verificação com a linha de base `capcut` (estimativa dentro de 25% do custo real por etapa, quando houver dados), `npm test` verde, `npm run test:coverage` acima do gate e `openspec validate --all`
