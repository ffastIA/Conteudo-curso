## MODIFIED Requirements

### Requirement: Campos de sessão persistidos em disco
A sessão em memória SHALL ter os campos `bncc`, `metodologia`, `aulas` (LessonMeta[]) **e `inputs`** persistidos em `projeto.json` a cada etapa concluída, além dos campos textuais já persistidos individualmente como `.txt`.

O campo `inputs` SHALL ser um objeto flat com as seguintes chaves, sempre refletindo o último valor submetido pelo usuário:
- `topicos` (string): tópicos inseridos na Etapa 2
- `limite` (number): número de fontes selecionado na Etapa 2
- `ajustesEnsino` (string): ajustes inseridos na Etapa 3
- `observacoesAula` (string): observações inseridas na Etapa 4

#### Scenario: Sessão com BNCC ativo persistida
- **WHEN** qualquer etapa é concluída e `sess.bncc.ativo === true`
- **THEN** `projeto.json` contém `{ bncc: { ativo: true, publico, nivel, itens: [...] } }`

#### Scenario: Sessão sem BNCC persistida
- **WHEN** qualquer etapa é concluída e `sess.bncc.ativo === false`
- **THEN** `projeto.json` contém `{ bncc: { ativo: false, publico: null, nivel: null, itens: [] } }`

#### Scenario: Metodologia persistida
- **WHEN** qualquer etapa é concluída após `sess.metodologia` ser definida
- **THEN** `projeto.json` contém `{ metodologia: "..." }` com o texto completo

#### Scenario: Array de aulas persistido
- **WHEN** a Etapa 4 (plano de aulas) é concluída e `sess.aulas` está populado
- **THEN** `projeto.json` contém `{ aulas: [{ titulo, modulo, objetivos }, ...] }` com todas as aulas

#### Scenario: Inputs da Etapa 2 persistidos
- **WHEN** o usuário aciona a geração da pesquisa web (`GET /api/search`) com `topicos` e `limite`
- **THEN** `projeto.json` contém `{ inputs: { topicos: "...", limite: N, ... } }` com os valores submetidos

#### Scenario: Input da Etapa 3 persistido
- **WHEN** o usuário aciona a geração do plano de ensino (`GET /api/plano-ensino`) com `ajustes`
- **THEN** `projeto.json` contém `{ inputs: { ajustesEnsino: "...", ... } }` com o valor submetido

#### Scenario: Input da Etapa 4 persistido
- **WHEN** o usuário aciona a geração do plano de aula (`GET /api/plano-aula`) com `observacoes`
- **THEN** `projeto.json` contém `{ inputs: { observacoesAula: "...", ... } }` com o valor submetido

#### Scenario: inputs ausente em projetos legados
- **WHEN** `projeto.json` existe mas não contém o campo `inputs`
- **THEN** o sistema carrega o projeto normalmente e trata `inputs` como `{}` sem erro

---

### Requirement: Reconexão de sessão após restart do servidor
O sistema SHALL ser capaz de reconstruir uma sessão funcional completa a partir dos arquivos em disco, sem nenhuma chamada à OpenAI, quando o usuário retomar um projeto após perda de sessão.

A resposta de `POST /api/carregar-projeto` SHALL incluir os campos `config`, `metodologia` e `inputs` para que o frontend possa repopular os campos editáveis sem requisição adicional.

#### Scenario: Restart com projeto.json presente
- **WHEN** o servidor reinicia, o usuário retorna ao browser e seleciona o projeto pelo nome
- **THEN** `sess.config`, `sess.bncc`, `sess.metodologia`, `sess.aulas` e `sess.inputs` são restaurados do `projeto.json`, e campos textuais são restaurados dos `.txt` via `readMemory()`

#### Scenario: Resposta inclui dados para repopulação do frontend
- **WHEN** `POST /api/carregar-projeto` conclui com sucesso
- **THEN** a resposta JSON contém `{ ok: true, config: {...}, metodologia: "...", inputs: {...}, etapasCarregadas: [...], stages: {...}, nome: "..." }`

#### Scenario: Etapas concluídas antes desta change (sem projeto.json)
- **WHEN** o usuário tenta carregar um projeto cujo diretório tem `.txt` mas não tem `projeto.json`
- **THEN** o sistema carrega os campos textuais disponíveis, sinaliza `camposFaltantes: ["bncc", "metodologia", "aulas"]` e o usuário pode reinserir esses campos nas etapas correspondentes sem precisar regenerar os textos

#### Scenario: projeto.json corrompido
- **WHEN** `projeto.json` existe mas não é JSON válido
- **THEN** o sistema ignora o `projeto.json`, carrega apenas os `.txt` disponíveis e retorna `{ ok: true, aviso: "projeto.json corrompido — campos estruturados não carregados" }`

## ADDED Requirements

### Requirement: Campos editáveis restaurados no frontend ao carregar projeto
Ao carregar um projeto existente, o frontend SHALL preencher automaticamente todos os campos editáveis de cada etapa com os valores presentes em `data.config` e `data.inputs` retornados pelo servidor.

Os campos SHALL ser restaurados para:
- **Etapa 1**: `nome`, `publico`, `carga`, `duracao`, `nivel`, `objetivos`, `modalidade`, `proporcaoTeoricoPratico`, `preRequisitos` — a partir de `data.config`
- **Etapa 0**: texto da metodologia exibido no painel `#metodologiaResult` e botões `#metodologiaActions` visíveis — a partir de `data.metodologia`
- **Etapa 2**: `topicos`, `limite` — a partir de `data.inputs`
- **Etapa 3**: `ajustesEnsino` — a partir de `data.inputs`
- **Etapa 4**: `observacoesAula` — a partir de `data.inputs`

#### Scenario: Formulário da Etapa 1 repopulado
- **WHEN** o usuário seleciona um projeto existente e `data.config` está presente na resposta
- **THEN** todos os campos do formulário `#configForm` são preenchidos com os valores de `data.config` antes do redirecionamento para a etapa máxima concluída

#### Scenario: Metodologia restaurada no painel
- **WHEN** o usuário seleciona um projeto existente e `data.metodologia` é uma string não vazia
- **THEN** `#metodologiaResult` exibe o texto renderizado em markdown e `#metodologiaActions` fica visível

#### Scenario: Campos de texto livre das etapas 2–4 restaurados
- **WHEN** o usuário seleciona um projeto existente e `data.inputs` contém valores para `topicos`, `ajustesEnsino` e/ou `observacoesAula`
- **THEN** os campos `#topicos`, `#limite`, `#ajustesEnsino` e `#observacoesAula` são preenchidos com os respectivos valores

#### Scenario: inputs ausente ou parcial — campos permanecem em branco
- **WHEN** `data.inputs` é `null`, `undefined` ou não contém determinada chave
- **THEN** o campo correspondente permanece em branco sem erro e sem limpar valores previamente digitados pelo usuário
