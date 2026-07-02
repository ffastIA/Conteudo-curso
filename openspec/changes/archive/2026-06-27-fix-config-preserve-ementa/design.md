## Context

`POST /api/config` sempre regenerava a ementa via OpenAI ao ser chamado, independentemente de o conteúdo pedagógico ter mudado. Isso tornava impossível atualizar campos operacionais como `pastaProjeto`, `modalidade` ou `proporcaoTeoricoPratico` sem consumir tokens e potencialmente sobrescrever uma ementa já revisada. O problema se tornou concreto quando usuários precisaram re-configurar o caminho do projeto após perda de sessão.

## Goals / Non-Goals

**Goals:**
- Atualização de `pastaProjeto` (e outros campos não-pedagógicos) não regenera ementa
- Ementa é regerada quando campos de conteúdo mudam (`nome`, `publico`, `carga`, `duracao`, `nivel`, `objetivos`)
- Ementa é sempre gerada quando ainda não existe (projeto novo)
- Comportamento idêntico ao anterior para criação de novos cursos

**Non-Goals:**
- Não detecta mudanças semânticas dentro de um mesmo campo (comparação é estritamente por valor de string)
- Não expõe um endpoint dedicado `PATCH /api/config/pasta` para atualizar apenas o caminho
- Não migra arquivos para o novo `pastaProjeto` ao alterar o caminho

## Decisions

### Comparação de campos antes de atualizar `sess.config`

A comparação deve acontecer ANTES de `sess.config = req.body`, para que o `sess.config` antigo ainda esteja disponível:

```javascript
const camposConteudo = ['nome', 'publico', 'carga', 'duracao', 'nivel', 'objetivos'];
const conteudoMudou = camposConteudo.some(k => (req.body[k] || '') !== (sess.config[k] || ''));

sess.config = req.body;

if (!sess.ementa || conteudoMudou) {
  // regenera ementa
}
```

**Alternativa considerada:** verificar apenas se `sess.ementa` existe (sem comparar campos). Descartada — o usuário pode corrigir o nome do curso na Etapa 1, e nesse caso a ementa DEVE ser atualizada.

### Campos pedagógicos vs. operacionais

| Campo | Tipo | Regenera ementa? |
|---|---|---|
| `nome` | pedagógico | Sim |
| `publico` | pedagógico | Sim |
| `carga` | pedagógico | Sim |
| `duracao` | pedagógico | Sim |
| `nivel` | pedagógico | Sim |
| `objetivos` | pedagógico | Sim |
| `pastaProjeto` | operacional | Não |
| `modalidade` | operacional | Não |
| `proporcaoTeoricoPratico` | operacional | Não |
| `preRequisitos` | operacional | Não |

## Risks / Trade-offs

| Risco | Mitigação |
|---|---|
| Usuário muda `nome` por typo e não percebe que ementa foi regerada | Comportamento esperado e desejável — ementa deve refletir o nome correto |
| Comparação por string não detecta mudança semântica (ex.: reordenação de palavras) | Aceitável — a granularidade de campo é suficiente para o fluxo do sistema |
