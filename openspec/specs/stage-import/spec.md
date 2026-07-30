## Purpose

Permitir que o usuário importe um arquivo `.docx` editado externamente para
substituir o artefato de uma etapa já gerada, identificando a etapa por nome
de arquivo ou por título, com confirmação explícita antes de sobrescrever.

## Requirements

### Requirement: Importar .docx editado para substituir artefato de etapa
O sistema SHALL aceitar o upload de um arquivo `.docx` editado pelo usuário, extrair seu conteúdo textual via `mammoth`, identificar a qual etapa ele pertence e sobrescrever o `.txt` correspondente após confirmação explícita do usuário. A identificação por nome de arquivo SHALL aceitar tanto o basename exato do stage quanto basenames com prefixo do curso no formato `<prefixo>_<stage>` (padrão gerado pelo export `.docx` do sistema).

#### Scenario: Upload com nome de arquivo reconhecível
- **WHEN** o cliente faz `POST /api/importar` com um arquivo `aula03_conteudo.docx`
- **THEN** o sistema identifica o estágio como `aula03_conteudo`, extrai o texto com mammoth e retorna `{ ok: true, stagioDetectado: "aula03_conteudo", titulo: "Listas e Laços", chars: N, requerConfirmacao: true }` sem sobrescrever ainda

#### Scenario: Upload de arquivo exportado pelo próprio sistema (nome com prefixo do curso)
- **WHEN** o cliente faz `POST /api/importar` com um arquivo `Curso_de_Logica_metodologia.docx` (nome gerado pelo export do sistema)
- **THEN** o sistema identifica o estágio como `metodologia` pelo sufixo `_metodologia` e retorna `{ ok: true, stagioDetectado: "metodologia", requerConfirmacao: true }` sem exigir seleção manual

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
- **THEN** o sistema sobrescreve `aula03_conteudo.txt` em `courseScrDir(sess)` (`/scr` dentro de `pastaProjeto`; `saídas/{slug}/scr/` só no fallback legado, ver capability `project-folder`), atualiza `sess.conteudoPorAula[2].texto`, atualiza `projeto.json` com `stages["aula03_conteudo"] = { fonte: "usuario", geradoEm: ISO8601 }` e retorna `{ ok: true, stage: "aula03_conteudo" }`

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
O sistema SHALL exibir o botão "Importar versão editada (.docx)" em cada etapa após sua conclusão. Os manipuladores de evento do modal de importação SHALL estar registrados e funcionais quando a página termina de carregar, independentemente da posição do modal no documento em relação ao script.

#### Scenario: Etapa concluída exibe botão de importação
- **WHEN** uma etapa transita para o estado "concluída" (doneSteps.has(N))
- **THEN** o botão "Importar versão editada (.docx)" torna-se visível naquela seção

#### Scenario: Etapa não concluída oculta botão de importação
- **WHEN** uma etapa ainda não foi executada
- **THEN** o botão de importação permanece oculto

#### Scenario: Seleção de arquivo dispara o upload
- **WHEN** o usuário abre o modal de importação e seleciona um arquivo `.docx` no input
- **THEN** o frontend envia imediatamente `POST /api/importar` com o arquivo em `FormData` e exibe o resultado da detecção (nenhum clique adicional é necessário para o envio)

#### Scenario: Etapa de origem pré-selecionada no fluxo ambíguo
- **WHEN** o usuário abriu o modal a partir do botão de uma etapa específica (ex.: metodologia) e o backend retorna detecção ambígua com lista de candidatos
- **THEN** o seletor manual de etapa é exibido com a etapa de origem pré-selecionada e o botão "Confirmar importação" habilitado, permanecendo o usuário livre para trocar a seleção

---

### Requirement: Atualizar conteúdo exibido após importação confirmada
Após `POST /api/importar/confirmar` bem-sucedido, a interface SHALL re-renderizar o conteúdo da etapa afetada com o texto importado, além de atualizar o badge de origem.

#### Scenario: Texto da etapa atualizado na tela
- **WHEN** o usuário confirma a importação de uma versão editada da metodologia
- **THEN** o elemento de resultado da metodologia passa a exibir o texto importado (renderizado como markdown) e o badge muda para `✏️ Versão do usuário`

#### Scenario: Importação de aula é persistida sem clobber da visão agregada
- **WHEN** o usuário confirma a importação de `aula03_conteudo`
- **THEN** o texto importado é persistido (arquivo e sessão) e o painel agregado de conteúdo (que exibe todas as aulas) NÃO é sobrescrito pelo texto de uma aula única; a versão importada aparece ao recarregar o projeto
