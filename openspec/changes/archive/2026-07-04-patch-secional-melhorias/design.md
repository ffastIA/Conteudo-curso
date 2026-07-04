# Design: patch-secional-melhorias

## Context

`conteudoSkill` (`skills.js:409-442`) não impõe um vocabulário fixo de seções — pede, "para CADA objetivo listado", fundamentação técnica, exemplos práticos, casos reais, erros comuns e síntese, mas o modelo decide livremente títulos, nível de heading (`##`, `###`, `####` ou apenas negrito) e se organiza por objetivo individual ou por bloco único. Uma amostra real confirma a variação: uma aula usa "Fundamentação Técnica" único; outra usa "Objetivo 1: ...” → “Fundamentação Técnica:” repetido por objetivo. **Isso invalida uma abordagem de merge baseada em regex sobre heading Markdown** (nível/formato inconsistente) — a alternativa precisa de um marcador que o próprio prompt controla, não que dependa da estrutura orgânica do texto.

`aplicarMelhoriasSkill` (`skills.js:522-558`) hoje pede a reescrita completa; a guarda de truncamento (`isRespostaMelhoriasCompleta`, `server.js:242-245`) e a continuação (`server.js:2203-2224`) da change anterior tratam o sintoma (corte) mas não a causa (volume de saída desnecessário).

## Goals / Non-Goals

**Goals:** reduzir a saída necessária por chamada ao mínimo (só o que muda); merge confiável mesmo com títulos de seção variáveis entre aulas; fallback seguro quando o patch não é identificável.

**Non-Goals:** padronizar os títulos que `conteudoSkill` gera; remover a guarda de truncamento existente; alterar o realinhamento de planos.

## Decisions

1. **Delimitador sentinela fixo, não heading Markdown.**
   Formato exigido no prompt: `<<<SECAO: <título>>>>\n<conteúdo revisado>\n<<<FIM_SECAO>>>`, um bloco por seção afetada. O `<título>` deve ser **copiado literalmente** do título da seção no conteúdo original (instrução explícita no prompt) quando a seção já existe, ou um título novo quando a melhoria introduz conteúdo inédito. Alternativa rejeitada: exigir que o modelo reproduza `## Nome Exato`, dependendo do nível de heading real — quebraria com a variação já observada (algumas aulas usam `####`, texto em negrito, ou títulos por objetivo sem heading Markdown).

2. **Merge por busca de título exato (tolerante a acento/caixa/espaço), não por regex de nível de heading.**
   `mergeSecoesConteudo(textoOriginal, patchTexto)`: para cada bloco `<<<SECAO: título>>>...<<<FIM_SECAO>>>`, normaliza o título (mesmo padrão de `normalizeModalidade`: NFD + remoção de acentos + lowercase + trim) e procura a **linha do texto original** cujo conteúdo normalizado contém o título — independente de ela começar com `#`, `##`, `####` ou estar em negrito. Encontrada → substitui do início dessa linha até a próxima linha que "parece título" (heurística: linha curta, sem terminar em pontuação de frase — mesmo espírito da heurística removida do parser legado de melhorias, mas aqui como fallback dentro de uma janela já delimitada pelo próprio LLM, não como âncora primária, reduzindo o risco que motivou a substituição naquele outro parser). Não encontrada → acrescenta a seção ao final do conteúdo, sinalizada no relatório como "seção nova".

3. **Fallback automático para reescrita integral.**
   Se `patchTexto` não contiver nenhum `<<<SECAO:`, tratar a resposta inteira como reescrita completa (comportamento atual, sem seções) — preserva compatibilidade para o caso em que a melhoria realmente precisa tocar a aula inteira (ex.: pedido de reescrever tudo em outro tom) e evita quebra dura se o modelo ignorar o formato pedido.

4. **Guarda de truncamento permanece, agora por patch.**
   `isRespostaMelhoriasCompleta` passa a validar: resposta com `<<<SECAO:` sem `<<<FIM_SECAO>>>` correspondente (bloco aberto e não fechado) OU sem a seção final `### Melhorias Aplicadas` → incompleta, aciona a mesma continuação já existente. Como o volume de saída cai bastante, a taxa de acionamento da guarda deve cair para praticamente zero na prática — ela deixa de ser a defesa primária e vira rede de segurança.

5. **Rastreabilidade de seções tocadas no relatório.**
   Ao lado da lista numerada de melhorias já existente em "### Melhorias Aplicadas", o relatório por aula passa a listar as seções efetivamente substituídas/acrescentadas — visibilidade extra para o revisor conferir o que mudou sem reler a aula inteira.

## Risks / Trade-offs

- [Título do patch não bate com o original por parafraseio do modelo, apesar da instrução de cópia literal] → normalização tolerante (acento/caixa/espaço) cobre a maioria dos casos; divergência residual vira "seção nova" (visível no relatório, não um dado perdido) em vez de falha silenciosa.
- [Heurística de fim de seção (próxima linha que "parece título") pode incluir/excluir uma linha a mais/menos] → janela já delimitada pelo LLM reduz drasticamente a superfície de erro comparado ao parser antigo (que dependia dessa heurística como âncora primária no documento inteiro); revisão humana no relatório cobre o residual.
- [Modelo ignora o formato de patch e devolve prosa livre] → fallback de reescrita integral trata como hoje, sem regressão.
- [Seção citada duas vezes no patch] → última ocorrência vence (mesmo padrão adotado em `parseMelhoriasEstruturadas`).

## Migration Plan

Sem migração de dados. Efeito imediato no próximo ciclo de melhorias. Rollback = revert do commit (a guarda de truncamento da change anterior continua funcionando isoladamente).

## Open Questions

Nenhuma — abordagem definida pelo usuário (Opção 2, redesenho estrutural).
