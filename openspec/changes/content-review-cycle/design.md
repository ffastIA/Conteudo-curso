## Context

O pipeline atual (Etapas 0–7) aplica qualidade de forma silenciosa: a deduplicação Jaccard detecta sobreposições e regenera conteúdo automaticamente sem notificar o usuário; a revisão de coerência (`revisaoCoerenciaSkill`) roda ao final da Etapa 5 e persiste um arquivo que dificilmente é consultado; e a expansão (Etapa 6) enriquece o conteúdo sem critério pedagógico explícito. O usuário não tem visibilidade nem controle sobre nenhum desses processos.

Esta mudança substitui esse pipeline por um **ciclo human-in-the-loop**: Etapa 5 gera conteúdo de forma limpa → Etapa 5★ produz um relatório de qualidade editável → Etapa 6 aplica as anotações humanas com auxílio de web search → o ciclo repete quantas vezes o usuário desejar.

**Restrições herdadas do projeto:**
- SSE obrigatório para operações assíncronas
- Sem novas dependências npm sem justificativa
- Sessão in-memory (cookie HttpOnly)
- Persistência dupla: `.txt` (memória) + `.docx` (entregável)

## Goals / Non-Goals

**Goals:**
- Tornar as sobreposições de conteúdo visíveis e acionáveis pelo usuário
- Substituir a auto-regeneração por um loop de revisão com julgamento humano
- Permitir que o revisor anote diretamente no `.docx` e devolva ao sistema
- Dar ao usuário controle completo sobre quando o conteúdo está "pronto"
- Eliminar a Etapa 6 de expansão cega e absorver seu valor (enriquecimento web) na aplicação de melhorias

**Non-Goals:**
- Edição do `.docx` dentro da interface web
- Versionamento automático dos ciclos de revisão
- Parser de formatação rica do `.docx` (negrito, tabelas, estilos)
- Manutenção da Etapa 6 de expansão como etapa independente

## Decisions

### D1 — Extração de texto do `.docx` enviado: `mammoth`

**Escolha:** usar `mammoth` para extrair texto plano do `.docx` enviado pelo usuário.

**Alternativas consideradas:**
- `docx` (já no projeto): voltado para *geração*, não para *leitura* de arquivos existentes — API inadequada para extração de texto.
- `officegen`: descontinuado.
- Parser manual de XML ZIP: frágil e requer manutenção.

**Justificativa:** `mammoth` é a única biblioteca leve e mantida que converte `.docx` → texto/markdown com fidelidade suficiente para uso em prompts. Extrai parágrafos e headings adequadamente; ignora formatação visual irrelevante. Única dependência nova nesta change.

---

### D2 — Formato do `.docx` de revisão (saída da Etapa 5★)

**Escolha:** `.docx` estruturado com seções por aula, gerado pelo `buildDocx()` existente.

Estrutura de cada seção:
```
# Revisão de Qualidade — [Nome do Curso]

## Aula N — [Título]

### Compatibilidade com Plano de Aula
[análise]

### Compatibilidade com Plano de Ensino e Ementa
[análise]

### Sobreposições Detectadas (Jaccard ≥ 55%)
[lista de sobreposições com aula X]   ← ou "Nenhuma detectada"

### Alinhamento BNCC
[análise]   ← omitido se BNCC não ativo

### Deficiências e Melhorias Sugeridas
[lista]

### Observações do Revisor
[espaço em branco para anotação humana]
```

**Justificativa:** o espaço "Observações do Revisor" sinaliza ao usuário onde escrever. O formato com `###` headings é legível no Word e extraível de forma previsível pelo `mammoth` na Etapa 6.

---

### D3 — Rastreamento do estado do ciclo na Session

**Escolha:** dois novos campos na Session:
```
revisaoQualidade    string|null   — texto completo do último relatório de revisão
conteudoFinal       string|null   — consolidado final após o usuário encerrar o ciclo
```

O `conteudoFinal` só é populado quando o usuário clica "Conteúdo Concluído". As iterações intermediárias sobrescrevem `conteudoPorAula` e `conteudo` normalmente.

**Justificativa:** não há necessidade de histórico de versões — a Session já é efêmera. O arquivo `.txt` persistido em disco (por iteração, com sufixo `_vN`) serve como backup implícito se necessário no futuro.

---

### D4 — Upload do `.docx` via multipart

**Escolha:** `POST /api/aplicar-melhorias` aceita `multipart/form-data` com campo `arquivo` (arquivo `.docx`). O backend usa `multer` (já amplamente usado no ecossistema Express) em modo `memStorage` — o arquivo fica em buffer, nunca toca o disco do servidor antes de ser processado.

**Alternativa considerada:** base64 no body JSON. Descartado: arquivos `.docx` típicos têm 30–200 KB; base64 aumenta 33% o payload e complica o frontend.

**Nova dependência:** `multer` — padrão de-facto para upload em Express, já presente em muitos projetos Node. Justificada pela ausência de alternativa viável sem dependência.

---

### D5 — SSE para a aplicação de melhorias (Etapa 6)

**Escolha:** o endpoint `/api/aplicar-melhorias` responde em SSE, processando cada aula em streaming como as demais etapas.

**Fluxo:**
1. Cliente envia `POST /api/aplicar-melhorias` com o `.docx`
2. Servidor extrai texto com `mammoth`, injeta no prompt de cada aula
3. Para cada aula: `aplicarMelhoriasSkill` com web search → stream de tokens via SSE
4. Ao final: `done` com texto consolidado

**Justificativa:** consistência com o resto do pipeline. O usuário vê progresso aula a aula, exatamente como nas Etapas 4 e 5.

---

### D6 — Jaccard na Etapa 5★ é reporte, não gatilho

**Escolha:** a similaridade Jaccard ≥ 55% na Etapa 5★ gera apenas uma nota no relatório indicando quais aulas se sobrepõem. Nenhuma regeneração automática ocorre.

**Justificativa:** a regeneração automática é o problema que esta change resolve. O usuário precisa ver a sobreposição, julgar se é legítima (às vezes dois temas realmente se tocam) e decidir o que fazer. A `aplicarMelhoriasSkill` na Etapa 6 tratará o caso se o revisor indicar no documento.

## Risks / Trade-offs

**[Risco] Qualidade da extração `mammoth` em `.docx` com formatação rica** → Mitigação: o `.docx` de saída da Etapa 5★ é gerado pelo próprio sistema com estrutura previsível (`###` headings); o usuário só adiciona texto plano nas seções "Observações". `mammoth` extrai isso com fidelidade adequada.

**[Risco] Upload de arquivo grande bloqueia o event loop** → Mitigação: `multer` com `memStorage` é async; o parse do `.docx` com `mammoth` é rápido (< 100ms para arquivos típicos). Não há processamento síncrono pesado.

**[Risco] Usuário envia `.docx` de outra fonte (não gerado pelo sistema)** → Mitigação: a `aplicarMelhoriasSkill` recebe o texto extraído como "orientações de melhoria" — se o conteúdo for genérico ou mal estruturado, o modelo ainda assim aplica o que puder. Não é um erro fatal.

**[Trade-off] Remoção da expansão (+50%) como etapa autônoma** → A funcionalidade de enriquecimento web é preservada dentro da `aplicarMelhoriasSkill`, mas não é mais acessível de forma independente sobre uma pasta arbitrária. Usuários que usavam `/api/expandir` diretamente perdem essa opção.

**[Trade-off] Dependência nova `mammoth` e `multer`** → Únicas adições nesta change. Ambas são maduras, amplamente usadas e de baixo risco de segurança para uso server-side.

## Migration Plan

1. Remover do `server.js`: lógica Jaccard + chamada a `conteudoRegenSkill` + chamada a `revisaoCoerenciaSkill` no handler `/api/conteudo`; remover handler `/api/expandir`.
2. Remover do `skills.js`: `conteudoRegenSkill`, `revisaoCoerenciaSkill`, `expansaoConteudoSkill`, `aplicarSugestoesSkill`.
3. Adicionar ao `server.js`: handlers SSE `/api/revisao-qualidade` e `/api/aplicar-melhorias` (multipart) e REST `/api/finalizar-conteudo`.
4. Adicionar ao `skills.js`: `revisaoQualidadeSkill` e `aplicarMelhoriasSkill`.
5. Atualizar `public/index.html` e `public/app.js`: remover seção Etapa 6 (expansão), adicionar seção Etapa 5★ e nova Etapa 6.
6. Instalar `mammoth` e `multer` via `npm install`.

**Rollback:** git revert do commit de implementação. Não há migração de dados (sessões são in-memory e efêmeras; arquivos `.txt`/`.docx` existentes em `saídas/` não são afetados).

## Open Questions

- O sufixo de versionamento nos arquivos intermediários (ex: `aula01_conteudo_v2.txt`) é necessário, ou sobrescrever é suficiente dado que as sessões são efêmeras? → Decisão adiada para implementação: sobrescrever por ora.
- O `.docx` final consolidado deve incluir apenas o conteúdo revisado, ou também os planos (ensino + aula) como contexto? → Apenas conteúdo revisado; os planos já têm seus próprios `.docx`.
