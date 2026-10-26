## 1. Contabilidade de tokens em cache

- [ ] 1.1 `config/precos-modelos.json`: `entradaEmCache` por modelo (`gpt-4o` 1,25; `gpt-4o-mini` 0,075, por milhão) e `buscaWebBlocoTokensMini` (8000); atualizar `vigencia` e a observação
- [ ] 1.2 `custo.js` (`calcularCusto`): cobrar `entradaEmCache` pelo preço de cache e o restante pelo de entrada; sem o campo, preço cheio; estimativa prévia sem desconto
- [ ] 1.3 Wrapper `chamarOpenAI`: ler `cached_tokens` (chat e Responses), normalizar como `entradaEmCache`, gravar em `geracao_log.json` e na `generation` do Langfuse; ausente vale 0
- [ ] 1.4 Bloco fixo da busca em modelos mini: somar ao custo apenas se a verificação real mostrar que o `usage` não o inclui (ver 7.2)

## 2. Prefixo estável nas skills

- [ ] 2.1 Reordenar `secaoConteudoSkill`, `expandirSecaoSkill`, a skill de roteiro por aula, `revisaoSecaoSkill`, `revisaoQualidadeSkill` e `scoreAulaSkill`: estável primeiro, variável por último, sem mudar o texto
- [ ] 2.2 Manter `system` idêntico entre as chamadas de uma etapa

## 3. Cache de pesquisa

- [ ] 3.1 Módulo do cache (chave SHA-256 do prompt final, leitura tolerante, gravação atômica, validade `PESQUISA_CACHE_TTL_DIAS`, `PESQUISA_CACHE`, `PESQUISA_CACHE_DIR`); só grava texto com citação
- [ ] 3.2 Integrar em `executarPesquisaWeb` (acerto sem chamar a OpenAI, sem reserva de orçamento, sem calibração); `progress` com a data original; `?semCache=1` nas rotas de pesquisa geral e por módulo
- [ ] 3.3 Marcar `deCache` e a data original nas consultas de `pesquisa.json` e `pesquisa_modulos.json`; span `pesquisa.cache` no Langfuse
- [ ] 3.4 `.gitignore` (`.cache-pesquisa/`) e `.env.example`

## 4. Modelo de pesquisa por perfil

- [ ] 4.1 `modeloPesquisa` opcional em `config/perfis-custo.json`, aplicado a pesquisa geral e por módulo; validação de capacidades
- [ ] 4.2 Painel de orçamento: mostrar o modelo de pesquisa do perfil
- [ ] 4.3 Experimento: refazer a pesquisa da linha de base `capcut` com `gpt-4o-mini` e comparar fontes (mínimo 3 em 2 domínios) e nota média das aulas (no máximo 0,03 abaixo de 0,85); registrar o resultado e só então decidir se o Econômico adota o modelo

## 5. Pré-checagem da revisão

- [ ] 5.1 Conferir no código o que já existe de checagens locais e estados de aula, para não duplicar
- [ ] 5.2 `revisarAula`: pré-checagem (cerca de código aberta, ids `[F#]` inválidos, palavras abaixo de metade da meta) com alertas no relatório e sem alterar a nota
- [ ] 5.3 Aula `incompleta` ou pulada: não chama o modelo, entra no relatório como "não avaliada" e fica fora das médias e dos consolidados

## 6. Documentação

- [ ] 6.1 `docs/governanca-de-custo.md` (ou `docs/otimizacao-de-tokens.md`): cache de pesquisa (como limpar, validade, `?semCache=1`), cache de prompt e tokens em cache; `PROJECT.md` (modelo de dados, pasta `.cache-pesquisa/`, contagem de capabilities ao arquivar) e `README.md`

## 7. Testes e verificação (última etapa)

- [ ] 7.1 Unitários: `calcularCusto` com cache (exemplo da spec, sem preço de cache, estimativa sem desconto); chave e validade do cache, só sucesso, arquivo corrompido, `PESQUISA_CACHE=false`; prefixo comum das skills reordenadas com conteúdo preservado; pré-checagens
- [ ] 7.2 Integração com OpenAI simulada: segunda execução da Etapa 2 sem chamada à OpenAI e com gasto zero; `?semCache=1`; acerto sem calibrar nem reservar; revisão ignora aula incompleta e pulada; wrapper registra `entradaEmCache`
- [ ] 7.3 Verificação real (leitura de uso): duas execuções da pesquisa da linha de base (a segunda custa zero), `cached_tokens` maior que zero nas chamadas de conteúdo, confirmar se o `usage` de uma busca em modelo mini inclui o bloco fixo e comparar o custo calculado com a página de uso da OpenAI
- [ ] 7.4 `npm test`, `npm run test:coverage` acima do gate e `openspec validate --all`; nota média da linha de base mantida (no máximo 0,03 abaixo)
