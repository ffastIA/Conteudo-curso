## Contexto

Base de medição: `docs/baseline/capcut/` (3 aulas; custo medido US$ 0,4969 sem a tarifa da busca; US$ 0,5669 com ela, a US$ 0,01 por chamada). Preços de referência, da página oficial de preços da OpenAI em 2026-10-25: `gpt-4o` entrada US$ 2,50, entrada em cache US$ 1,25, saída US$ 10,00; `gpt-4o-mini` entrada US$ 0,15, entrada em cache US$ 0,075, saída US$ 0,60 (por milhão de tokens); busca web US$ 10,00 por mil chamadas, e nos modelos mini mais um bloco fixo de 8.000 tokens de entrada por chamada.

**Estimativas de ganho (hipóteses a medir, não promessas):**

| Medida | Primeira execução | Reexecução idêntica |
|---|---|---|
| Cache de pesquisa | 0% | cerca de −88% do custo total (as 7 chamadas de busca somam US$ 0,50 de US$ 0,57) |
| Cache de prompt | cerca de −2% a −4% (parte estável das 21 chamadas de conteúdo, a metade do preço) | igual |
| Modelo de pesquisa mini no Econômico | até −70% se a qualidade se mantiver (a busca cairia de cerca de US$ 0,068 para US$ 0,012 por chamada) | igual |

## Decisões

**D1. Chave do cache de pesquisa = hash do prompt final.** A chave é o SHA-256 de `[versão do formato, modelo, search_context_size, instruções, entrada]` da chamada de busca. Qualquer mudança em ementa, nível, público, modalidade, metodologia, consulta ou ano muda o prompt e invalida o cache sozinha, sem lista de campos para manter. Consequência assumida: o cache só acerta com entrada idêntica (reexecutar a etapa, refazer o curso, retomar após falha). Reaproveitar entre cursos parecidos não é objetivo.

**D2. Só guardar sucesso.** Entram no cache apenas respostas com texto e ao menos uma citação `url_citation`. Falhas, respostas vazias e o fallback "sem busca" nunca são guardados, para não perpetuar um resultado ruim.

**D3. Validade e frescor.** A pesquisa trata de tendências do ano corrente; por isso o cache expira (`PESQUISA_CACHE_TTL_DIAS`, padrão 30; 0 desliga a leitura). Todo acerto mostra a data original ao usuário, e `?semCache=1` força uma consulta nova. O ano está no prompt, então a virada de ano invalida tudo.

**D4. Onde guardar.** `.cache-pesquisa/` na raiz do app (ou `PESQUISA_CACHE_DIR`), um arquivo JSON por chave, gravação atômica (arquivo temporário e renomeação), leitura tolerante (arquivo corrompido ou de outro formato é ignorado). A pasta entra no `.gitignore`. O conteúdo é texto de pesquisa pública; nenhuma chave de API é gravada. É um cache local único por instalação, coerente com o non-goal de multi-tenancy.

**D5. Acerto de cache não gasta nem calibra.** Um acerto não reserva orçamento, não conta no gasto, não é usado para calibrar a estimativa (`orcamento.js` só aprende com chamadas reais) e aparece no Langfuse como span `pesquisa.cache` com o motivo. A estimativa prévia de custo continua sem presumir acerto (é a faixa conservadora); o painel pode avisar quando há resultados em cache para a etapa.

**D6. Cache de prompt é só ordem de blocos.** A OpenAI aplica o desconto de prefixo automaticamente para prompts de 1.024 tokens ou mais com prefixo idêntico; não há parâmetro a ligar. A mudança é reordenar o texto das skills repetitivas (estável primeiro, variável por último) **sem alterar o conteúdo**. Skills alvo: `secaoConteudoSkill`, `expandirSecaoSkill`, `revisaoSecaoSkill`, `revisaoQualidadeSkill`, `scoreAulaSkill` e a de roteiro por aula. Hoje, por exemplo, em `secaoConteudoSkill` o dossiê de fontes, o nível e o contexto pedagógico ficam no fim, depois da seção a redigir, o que quebra o prefixo. A parte `system` já é estável.

**D7. Prova da ordem sem chamar a API.** Um teste monta duas chamadas consecutivas da mesma aula (seções 1 e 2) e verifica que o prefixo comum cobre todo o contexto da aula (dossiê, plano, ementa) e que só o trecho da seção difere depois dele. O ganho real é conferido numa execução real lendo `cached_tokens` (tarefa de verificação).

**D8. Tokens em cache na contabilidade.** A OpenAI informa `usage.prompt_tokens_details.cached_tokens` (Chat Completions) e `usage.input_tokens_details.cached_tokens` (Responses). O wrapper normaliza para `tokens.entradaEmCache`, grava no `geracao_log` e na `generation` do Langfuse, e `calcularCusto` cobra esses tokens pelo preço `entradaEmCache` do modelo (campo novo em `config/precos-modelos.json`). Sem o campo para um modelo, tudo é cobrado pelo preço cheio (conservador).

**D9. Bloco fixo da busca nos modelos mini.** Nos modelos `gpt-4o-mini` e `gpt-4.1-mini` a OpenAI cobra um bloco fixo de 8.000 tokens de entrada por chamada de busca (informação da página de preços, a confirmar com uma chamada real). Fica configurável em `config/precos-modelos.json` (`buscaWebBlocoTokensMini`) e só é somado se a chamada confirmar que o `usage` não o inclui. Hoje isso não afeta, pois a pesquisa usa `gpt-4o`.

**D10. Modelo de pesquisa por perfil, adoção por evidência.** O perfil ganha o campo opcional `modeloPesquisa` (papel `pesquisa` por padrão, que herda `OPENAI_RESEARCH_MODEL`). O plano pede decidir roteamento "por evidência" (1C.3). O experimento (tarefa 4.3) refaz a pesquisa da linha de base com `gpt-4o-mini` e compara fontes, domínios e a nota final; só se ficar equivalente o perfil Econômico passa a usar o modelo mini. Critério objetivo: pelo menos 3 fontes em 2 domínios por pesquisa (o mesmo da spec `web-research`) e nota média das aulas a no máximo 0,03 da linha de base (0,85).

**D11. Pré-checagem determinística.** Antes de qualquer chamada de revisão, `revisarAula` consulta o estado da aula (`completa`, `curta`, `incompleta`, pulada) e roda as checagens locais já disponíveis: bloco de código com cerca aberta, ids `[F#]` que não existem no dossiê, palavras abaixo de metade da meta. Aula `incompleta` ou pulada não é avaliada (a revisão registra "não avaliada" e o motivo), pois o avaliador gastaria entrada para dar nota a um texto que o usuário ainda vai refazer. As demais achados entram no relatório como alertas, sem alterar a nota (a fórmula 0,7 × rubrica + 0,3 × determinístico não muda).

## Riscos e mitigações

- **Reordenar pode mudar a qualidade do texto.** Mitigação: conteúdo idêntico, só a ordem; verificar na linha de base que a nota média das aulas fica a no máximo 0,03 da linha de base.
- **Cache velho aparecer como atual.** Mitigação: validade, data visível e `?semCache=1`.
- **Cache esconder uma falha de configuração.** Mitigação: só sucesso entra no cache; erro 400 de configuração nunca é guardado.
