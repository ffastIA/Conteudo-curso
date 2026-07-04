## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Atualizar conteúdo exibido após importação confirmada
Após `POST /api/importar/confirmar` bem-sucedido, a interface SHALL re-renderizar o conteúdo da etapa afetada com o texto importado, além de atualizar o badge de origem.

#### Scenario: Texto da etapa atualizado na tela
- **WHEN** o usuário confirma a importação de uma versão editada da metodologia
- **THEN** o elemento de resultado da metodologia passa a exibir o texto importado (renderizado como markdown) e o badge muda para `✏️ Versão do usuário`

#### Scenario: Importação de aula é persistida sem clobber da visão agregada
- **WHEN** o usuário confirma a importação de `aula03_conteudo`
- **THEN** o texto importado é persistido (arquivo e sessão) e o painel agregado de conteúdo (que exibe todas as aulas) NÃO é sobrescrito pelo texto de uma aula única; a versão importada aparece ao recarregar o projeto
