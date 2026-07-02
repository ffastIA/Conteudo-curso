## ADDED Requirements

### Requirement: Importar .docx editado para substituir artefato de etapa
O sistema SHALL aceitar o upload de um arquivo `.docx` editado pelo usuário, extrair seu conteúdo textual via `mammoth`, identificar a qual etapa ele pertence e sobrescrever o `.txt` correspondente após confirmação explícita do usuário.

#### Scenario: Upload com nome de arquivo reconhecível
- **WHEN** o cliente faz `POST /api/importar` com um arquivo `aula03_conteudo.docx`
- **THEN** o sistema identifica o estágio como `aula03_conteudo`, extrai o texto com mammoth e retorna `{ ok: true, stagioDetectado: "aula03_conteudo", titulo: "Listas e Laços", chars: N, requerConfirmacao: true }` sem sobrescrever ainda

#### Scenario: Upload com nome de arquivo não reconhecível — match por título H1
- **WHEN** o cliente faz `POST /api/importar` com um arquivo de nome arbitrário (ex: `"Aula 3 revisada.docx"`) cujo primeiro H1 é `# Aula 3 — Listas e Laços`
- **THEN** o sistema busca correspondência fuzzy nos títulos de `projeto.json.aulas`, encontra Aula 3 e retorna `{ ok: true, stagioDetectado: "aula03_conteudo", titulo: "Listas e Laços", chars: N, requerConfirmacao: true, detectadoPor: "titulo" }`

#### Scenario: Upload com nome e título ambíguos
- **WHEN** o sistema não consegue identificar o estágio nem pelo nome nem pelo título H1
- **THEN** retorna `{ requerConfirmacao: true, candidatos: [{ stage, titulo }, ...] }` para o frontend exibir seletor manual

#### Scenario: Upload de arquivo não .docx
- **WHEN** o cliente faz `POST /api/importar` com arquivo `.pdf` ou `.txt`
- **THEN** o sistema retorna status 400 com `{ error: "Apenas arquivos .docx são aceitos" }`

---

### Requirement: Confirmar importação e sobrescrever artefato
O sistema SHALL sobrescrever o `.txt` da etapa identificada somente após confirmação explícita do cliente, atualizando também o `projeto.json`.

#### Scenario: Confirmação com estágio identificado
- **WHEN** o cliente faz `POST /api/importar/confirmar` com `{ stage: "aula03_conteudo", texto: "..." }`
- **THEN** o sistema sobrescreve `saídas/{slug}/aula03_conteudo.txt`, atualiza `sess.conteudoPorAula[2].texto`, atualiza `projeto.json` com `stages["aula03_conteudo"] = { fonte: "usuario", importadoEm: ISO8601 }` e retorna `{ ok: true, stage: "aula03_conteudo" }`

#### Scenario: Confirmação para etapa consolidada (conteudo, plano_de_ensino, etc.)
- **WHEN** o cliente confirma importação para `plano_de_ensino`
- **THEN** o sistema sobrescreve `plano_de_ensino.txt` e atualiza `sess.planoEnsino`

#### Scenario: Stage inválido na confirmação
- **WHEN** o cliente envia stage que não existe nos artefatos conhecidos
- **THEN** o sistema retorna status 400 com `{ error: "Stage desconhecido" }`

---

### Requirement: Indicar origem de cada artefato na interface
O sistema SHALL exibir em cada etapa concluída um badge indicando se o artefato é de origem `"ia"` (gerado pela IA) ou `"usuario"` (importado manualmente).

#### Scenario: Artefato gerado pela IA
- **WHEN** a interface exibe uma etapa concluída cujo `projeto.json.stages[stage].fonte === "ia"`
- **THEN** exibe badge `🤖 Gerado pela IA` em cinza próximo ao resultado

#### Scenario: Artefato importado pelo usuário
- **WHEN** a interface exibe uma etapa cujo `projeto.json.stages[stage].fonte === "usuario"`
- **THEN** exibe badge `✏️ Versão do usuário` em verde e a data de importação

#### Scenario: Tentativa de regenerar artefato de origem usuário
- **WHEN** o usuário clica em regenerar uma etapa cujo artefato tem `fonte === "usuario"`
- **THEN** o sistema exibe modal de confirmação: "Esta etapa usa uma versão editada por você. Regenerar vai substituí-la pelo conteúdo da IA. Confirmar?"

---

### Requirement: Botão de importação disponível em cada etapa concluída
O sistema SHALL exibir o botão "Importar versão editada (.docx)" em cada etapa após sua conclusão.

#### Scenario: Etapa concluída exibe botão de importação
- **WHEN** uma etapa transita para o estado "concluída" (doneSteps.has(N))
- **THEN** o botão "Importar versão editada (.docx)" torna-se visível naquela seção

#### Scenario: Etapa não concluída oculta botão de importação
- **WHEN** uma etapa ainda não foi executada
- **THEN** o botão de importação permanece oculto
