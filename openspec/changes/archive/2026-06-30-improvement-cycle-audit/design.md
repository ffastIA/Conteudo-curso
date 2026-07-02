## Context

O ciclo de melhorias atual sobrescreve `aula{NN}_conteudo.txt` sem preservar o estado anterior. `sess.observacoesMelhorias` só existe em memória. A função `textSimilarity` já está implementada em `server.js` e usada na Etapa 5★ — pode ser reutilizada sem modificação. O número de ciclos precisa ser determinado em runtime lendo o diretório `scr/` em busca de subpastas com padrão `ciclo_NNN`.

## Goals / Non-Goals

**Goals:**
- Persistir observações em disco imediatamente no upload (sobreviver a restart)
- Criar snapshot imutável do estado anterior a cada ciclo
- Detectar e alertar quando o modelo não alterou significativamente o conteúdo
- Forçar o modelo a auto-reportar o que aplicou por observação

**Non-Goals:**
- Exibir histórico de ciclos na UI
- Implementar rollback
- Alterar contratos de API ou schema de sessão

## Decisions

**Estrutura de diretórios de ciclos:**
```
scr/
  observacoes_pendentes.json     ← gravado no upload, sobrescrito a cada novo upload
  ciclo_001/
    aula01_conteudo.txt          ← cópia do estado ANTES do ciclo 1
    aula02_conteudo.txt
    ...
    observacoes.json             ← { aulas: [{ titulo, observacoes }] }
    meta.json                    ← { ciclo, dataHora, totalAulas, totalComObservacoes,
                                      similaridadeMedia, similaridadePorAula: [{ aula, sim }] }
  ciclo_002/
    ...
  aula01_conteudo.txt            ← estado atual (sempre o mais recente)
```

**Numeração de ciclos:** contar subpastas `ciclo_NNN` existentes em `scrDir` e usar `count + 1`, com zero-padding de 3 dígitos. Operação síncrona com `fs.readdirSync`.

**Onde criar o snapshot:** no início do handler `GET /api/aplicar-melhorias/confirmar`, antes do loop de processamento. Se a criação do diretório de ciclo falhar, logar o erro e continuar — snapshot é auditoria secundária, não deve bloquear o fluxo principal.

**Jaccard por aula:** guardar o `aula.texto` antes de chamar `streamSkillToClient`, comparar com o `texto` retornado. Emitir evento SSE `progress` com aviso apenas quando `sim > 0.90`. A similaridade (0–1) é armazenada como número no `meta.json`.

**Auto-auditoria no prompt:** inserir após o bloco de instrução de melhoria em `aplicarMelhoriasSkill`:
```
\n\nAo final do conteúdo revisado, adicione obrigatoriamente a seção:\n
### Melhorias Aplicadas\n
Para cada observação do revisor listada acima, indique em um bullet: a observação e como foi tratada. Se uma observação não foi aplicada, justifique.
```
Isso aumenta o output em ~150–300 tokens por aula.

## Risks / Trade-offs

**Disco cheio com muitos ciclos** → baixo risco na prática (conteúdo de aulas em texto plano é pequeno). Mitigação: nenhuma necessária no curto prazo; pode-se adicionar limpeza de ciclos antigos no futuro.

**Falha no snapshot não bloqueia o fluxo** → intencional. O snapshot usa `try/catch` isolado; erro é logado mas o processamento continua. Risco: ciclo executado sem snapshot. Mitigação: o log indica a falha.

**Tokens extras por auto-auditoria** → ~150–300 tokens por aula com `gpt-4o-search-preview`. Com 27 aulas: ~4.000–8.000 tokens extras por ciclo. Custo marginal aceitável dado o valor informacional.

**Similaridade Jaccard não mede qualidade** → alta similaridade pode ocorrer em aulas onde as melhorias eram pontuais (trocar um exemplo, ajustar um parágrafo). O limiar de 90% é conservador para evitar falsos positivos. Mitigação: o aviso é informativo, não blocante.
