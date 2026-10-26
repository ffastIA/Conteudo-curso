## 1. Contabilidade de tokens em cache

- [x] 1.1 `config/precos-modelos.json`: `entradaEmCache` por modelo (`gpt-4o` 1,25; `gpt-4o-mini` 0,075, por milhão), `buscaWebBlocoTokensMini` (8000) e a chave de ativação `buscaWebBlocoTokensMiniSomar` (false); observação atualizada
- [x] 1.2 `observabilidade.js` (`tokensEmCache`, `calcularCusto`): cobrar `entradaEmCache` pelo preço de cache e o restante pelo de entrada; sem o campo, preço cheio; estimativa prévia sem desconto
- [x] 1.3 Wrapper `chamarOpenAI`: ler `cached_tokens` (chat e Responses), normalizar como `entradaEmCache`, gravar em `geracao_log.json`, no contexto do trace e na `generation` do Langfuse (`input_cached_tokens`); ausente vale 0
- [x] 1.4 `custo.custoBlocoBuscaMini`: bloco fixo da busca em modelos mini, somado ao custo da chamada só com `buscaWebBlocoTokensMiniSomar: true` (ativar depois da verificação 7.3; `gpt-4o` nunca soma)

## 2. Prefixo estável nas skills

- [x] 2.1 Reordenar `secaoConteudoSkill`, `revisaoSecaoSkill` e `scoreAulaSkill`: estável primeiro, variável por último, sem mudar o texto (as demais skills são chamadas uma vez por aula e ficam como estão; ver design D6)
- [x] 2.2 `system` idêntico entre as chamadas de uma etapa (já era)

## 3. Cache de pesquisa

- [x] 3.1 `pesquisa-cache.js` (chave SHA-256 do prompt final, leitura tolerante, gravação atômica, validade `PESQUISA_CACHE_TTL_DIAS`, `PESQUISA_CACHE`, `PESQUISA_CACHE_DIR`); só grava texto com citação
- [x] 3.2 Integrar em `executarPesquisaWeb` (acerto sem chamar a OpenAI, sem reserva de orçamento, sem calibração); `progress` com a data original; `?semCache=1` na pesquisa geral e na por módulo (na por módulo, `?refazer=1` também ignora o cache)
- [x] 3.3 `deCache` e `pesquisadoEm` nas consultas de `pesquisa.json` e `pesquisa_modulos.json`; span `pesquisa.cache` no Langfuse
- [x] 3.4 `.gitignore` (`.cache-pesquisa/`); `PESQUISA_CACHE=false` na suíte (`tests/setup-env.js`)

## 4. Modelo de pesquisa por perfil

- [x] 4.1 `modeloPesquisa` opcional em `config/perfis-custo.json`, aplicado à pesquisa geral e à por módulo e à estimativa; conferido na validação de capacidades
- [x] 4.2 Painel de orçamento: mostrar o modelo de pesquisa do perfil
- [x] 4.3 (2026-10-26: mini 18 fontes em 14 domínios, nota 0,84 contra 0,85 da linha de base; pesquisa 81% mais barata; adoção pelo Econômico fica para decisão do usuário, ver docs/otimizacao-de-tokens.md) Experimento: refazer a pesquisa da linha de base `capcut` com `gpt-4o-mini` e comparar fontes (mínimo 3 em 2 domínios) e nota média das aulas (no máximo 0,03 abaixo de 0,85); registrar o resultado e só então decidir se o Econômico adota o modelo

## 5. Pré-checagem da revisão

- [x] 5.1 Conferir no código o que já existe de checagens locais e estados de aula. Resultado: a trava da Etapa 5 já impede revisar aula incompleta ou pulada, e a geração já detecta código aberto, tamanho abaixo da meta e ids `[F#]` inválidos; a pré-checagem proposta foi descartada (design D11) e a capability `evaluation-efficiency` retirada da change

## 6. Documentação

- [x] 6.1 `docs/governanca-de-custo.md` (ou `docs/otimizacao-de-tokens.md`): cache de pesquisa (como limpar, validade, `?semCache=1`), cache de prompt e tokens em cache; `PROJECT.md` (modelo de dados, pasta `.cache-pesquisa/`, contagem de capabilities ao arquivar), `README.md` e `.env.example`

## 7. Testes e verificação (última etapa)

- [x] 7.1 Unitários: `calcularCusto` com cache (exemplo da spec, sem preço de cache, estimativa sem desconto, bloco da busca mini); chave e validade do cache, só sucesso, arquivo corrompido, `PESQUISA_CACHE=false`; prefixo comum das skills reordenadas com conteúdo preservado; modelo de pesquisa do perfil na validação
- [x] 7.2 Integração com OpenAI simulada: segunda execução da Etapa 2 sem chamada à OpenAI e com gasto zero; `?semCache=1`; entrada diferente e validade vencida; acerto sem calibrar nem gastar orçamento; pesquisa por módulo; modelo de pesquisa do perfil e chave de cache por modelo; wrapper registra `entradaEmCache` e usa o preço de cache
- [x] 7.3 (2026-10-26: 2ª pesquisa 100% do cache; 67% da entrada do conteúdo em cache; usage do mini já inclui o bloco de 8.000 tokens, soma continua desligada; falta só a conciliação com a página de uso da OpenAI, feita pelo usuário) Verificação real (leitura de uso): duas execuções da pesquisa da linha de base (a segunda custa zero), `cached_tokens` maior que zero nas chamadas de conteúdo, confirmar se o `usage` de uma busca em modelo mini inclui o bloco fixo e comparar o custo calculado com a página de uso da OpenAI
- [x] 7.4 `npm test`, `npm run test:coverage` acima do gate e `openspec validate --all`
