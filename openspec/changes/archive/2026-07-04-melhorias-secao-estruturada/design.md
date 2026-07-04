# Design: melhorias-secao-estruturada

## Context

O relatório de revisão é gerado por aula (`revisaoQualidadeSkill`, `skills.js`) e exportado como .docx; o revisor edita e reenvia. O parser atual (`server.js:1874-1897`) segmenta o texto por regex `Aula N[:\s—]`, procura "Observações do Revisor" em cada segmento e corta no próximo "título aparente" — três pontos de fragilidade acionáveis por edições humanas legítimas. O padrão desejado é "zona livre para humanos + zona estruturada para máquina": o corpo do relatório vira 100% livre e o sistema lê apenas a seção final.

## Goals / Non-Goals

**Goals:**
- Upload à prova de edição humana: uma única âncora, formato de lista trivial.
- Contagem real de melhorias por aula antes da confirmação.
- Rastreabilidade item a item na aplicação.
- Compatibilidade com documentos no formato antigo.

**Non-Goals:**
- Remover o fluxo legado; interpretar anotações nativas do Word; mudar mammoth/.docx.

## Decisions

1. **Seção pré-preenchida pelo sistema (curadoria, não redação).**
   A `revisaoQualidadeSkill` ganha subseção final obrigatória `### Resumo de Melhorias Propostas` — bullets curtos, um por melhoria, sem prosa (espelho enxuto de "Deficiências e Melhorias Sugeridas"). O servidor extrai esses bullets de cada aula e monta a seção consolidada `## Melhorias a serem Aplicadas` ao final do relatório. Alternativa rejeitada: seção vazia para o revisor preencher do zero — mais trabalho humano e mais erro de formato.

2. **Parser: cada linha não vazia é um item.**
   O `mammoth.extractRawText` descarta marcadores de lista do Word (bullet vira linha pura). Exigir `-` quebraria silenciosamente com listas nativas. Regra: dentro do bloco de uma aula, toda linha não vazia é uma melhoria; prefixos `-`, `*`, `•`, `1.`/`1)` são removidos se presentes. Função exportável `parseMelhoriasEstruturadas(texto, totalAulas)` → `[{ aulaIndex, melhorias: [] }]`, testável isoladamente (padrão de `extractScopeAlerts`).

3. **Âncoras tolerantes e mapeamento por número.**
   - Seção: **última ocorrência** de `/melhorias a serem aplicadas/i` com normalização de acentos — imune à frase aparecer no corpo.
   - Blocos: linha iniciando com `Aula NN` (aceita `Aula 1` e `Aula 01`, com ou sem `:`/título após); o número mapeia para o índice da sessão — imune a reordenação/omissão; números fora do intervalo são ignorados com aviso.
   - `Nenhuma` (sozinha no bloco, case-insensitive) = pular aula explicitamente (distinto de aula ausente, que também pula).

4. **Fallback legado com aviso.**
   Seção ausente → parser atual de "Observações do Revisor" + campo `modoLegado: true` e aviso na resposta ("seção estruturada não encontrada — usando modo legado"). Documentos gerados antes desta change continuam funcionando; nenhum flag de configuração.

5. **Aplicação numerada com rastreabilidade.**
   `aplicarMelhoriasSkill` recebe `melhorias` como array e monta lista numerada no prompt; a instrução da seção `### Melhorias Aplicadas` passa a exigir referência por número: `1. <ação tomada>` ou `1. Não aplicado: <motivo>`. O formato interno `sess.observacoesMelhorias` ganha campo `melhorias: []` ao lado de `observacoes` (string juntada preservada para o check de duplicata e para o modo legado — mudança retrocompatível).

6. **Instrução fixa no documento.**
   Parágrafo imediatamente antes da seção consolidada: "Edite apenas os itens abaixo — uma melhoria por linha. O sistema aplicará exclusivamente o que estiver nesta seção." Elimina a principal fonte de erro: não saber qual é a zona editável.

## Risks / Trade-offs

- [Modelo não gerar o "Resumo de Melhorias Propostas" em alguma aula] → Servidor tolera ausência (aula entra na seção consolidada com placeholder vazio); teste de prompt exige a subseção.
- [Revisor apagar a seção inteira] → Fallback legado + aviso (Decisão 4).
- [Linha de comentário do revisor dentro do bloco vira "melhoria"] → Instrução fixa no documento + preview de contagem por aula na confirmação (o revisor vê o que será aplicado antes de confirmar).
- [Título de aula contendo "Aula N" no meio de um item] → Só linhas que INICIAM com `Aula NN` abrem bloco.
- [Duplicata entre ciclos] → Check atual preservado juntando o texto dos itens.

## Migration Plan

Sem migração de dados. Relatórios antigos caem no fallback legado. Rollback = revert do commit.

## Open Questions

Nenhuma — os 6 refinamentos foram validados com o usuário na análise que originou esta proposta.
