# Tasks: patch-secional-melhorias

## 1. Levantamento da estrutura real de conteúdo

- [x] 1.1 Reler o prompt de `conteudoSkill` (`skills.js:409-442`) e, se disponível, 1-2 aulas reais do usuário (ex.: projeto CapCut) para confirmar a variação de títulos/níveis de heading entre aulas — já confirmado na análise: não há vocabulário fixo, então a Task 3 deve usar comparação por título exato, não regex de heading

## 2. Prompt de patch seccional

- [x] 2.1 Reescrever `aplicarMelhoriasSkill` (`skills.js:522-558`): instruir o formato `<<<SECAO: <título>>>`...`<<<FIM_SECAO>>>`, um bloco por seção afetada; instrução explícita de copiar o título literalmente da seção original quando ela existir; manter a seção final `### Melhorias Aplicadas` (lista numerada) inalterada
- [x] 2.2 Instrução de fallback no próprio prompt: se a melhoria afetar a aula inteira, o modelo pode devolver o texto integral sem marcadores (mantém compatibilidade)

## 3. Merge no servidor

- [x] 3.1 Criar `mergeSecoesConteudo(textoOriginal, patchTexto)` em `server.js`: parse dos blocos `<<<SECAO:>>>...<<<FIM_SECAO>>>`; normalização de título (reusar padrão de `normalizeModalidade` — NFD, remoção de acento, lowercase, trim); localizar a linha do título no original por comparação tolerante; substituir até a próxima linha "que parece título" (heurística leve, já delimitada pela janela do patch); título não encontrado → acrescentar ao final; retornar também a lista de seções substituídas/novas para o relatório
- [x] 3.2 Detecção de fallback: `patchTexto` sem nenhum `<<<SECAO:` → retornar `patchTexto` como reescrita integral (sem chamar o merge)
- [x] 3.3 Exportar `mergeSecoesConteudo` para teste

## 4. Integração no loop de melhorias

- [x] 4.1 Em `/api/aplicar-melhorias/confirmar` (`server.js:~2170-2250`): após obter `texto` (já validado pela guarda de truncamento existente), aplicar `mergeSecoesConteudo(aula.texto, texto)` antes de persistir; adaptar `isRespostaMelhoriasCompleta` para considerar bloco `<<<SECAO:>>>` aberto sem fechamento como incompleta
- [x] 4.2 Acrescentar ao `reportSections` da aula a lista de seções substituídas/novas retornada pelo merge

## 5. Testes

- [x] 5.1 `mergeSecoesConteudo`: substituição de seção do meio preservando as demais; múltiplas seções no mesmo patch; seção nova acrescentada; título com variação de acentuação/caixa/espaço ainda casa; fallback sem marcadores retorna o texto integral
- [x] 5.2 `isRespostaMelhoriasCompleta` com bloco `<<<SECAO:>>>` aberto sem fechamento → incompleta
- [x] 5.3 `npx jest` completo verde + `node --check` nos arquivos alterados

## 6. Validação e fechamento

- [ ] 6.1 E2E manual (servidor reiniciado): rodar ciclo de melhorias no curso que apresentou o truncamento (ou equivalente denso) e confirmar que as aulas completam sem acionar a guarda de truncamento na maioria dos casos
- [x] 6.2 Atualizar `PROJECT.md`
- [ ] 6.3 Sync dos specs, arquivar o change, commit, push
