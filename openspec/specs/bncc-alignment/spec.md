## Purpose

Permitir que o usuário alinhe o conteúdo do curso à BNCC (Base Nacional Comum
Curricular), selecionando habilidades ou competências que são injetadas nos
prompts de todas as etapas geradoras.

## Requirements

### Requirement: Pergunta de alinhamento BNCC na Etapa 0
O sistema SHALL perguntar ao usuário, antes de qualquer outra etapa, se o conteúdo do curso deve se alinhar à BNCC. A resposta é binária (Sim/Não). Se Não, toda a seção BNCC é pulada e o sistema avança para a seleção de metodologia pedagógica.

#### Scenario: Usuário opta por não alinhar à BNCC
- **WHEN** o usuário seleciona "Não" na pergunta de alinhamento BNCC
- **THEN** o sistema registra `session.bncc.ativo = false` e exibe a seção de metodologia pedagógica sem exibir nenhuma pergunta adicional sobre BNCC

#### Scenario: Usuário opta por alinhar à BNCC
- **WHEN** o usuário seleciona "Sim" na pergunta de alinhamento BNCC
- **THEN** o sistema exibe a pergunta de público-alvo (Ed. Básica ou adultos/profissionais)

---

### Requirement: Bifurcação por público-alvo na seleção BNCC
O sistema SHALL perguntar se o curso é destinado a estudantes da Educação Básica ou a adultos/profissionais, e exibir o conjunto de itens BNCC correspondente ao perfil escolhido.

#### Scenario: Curso para estudantes da Ed. Básica
- **WHEN** o usuário seleciona "Estudantes da Educação Básica"
- **THEN** o sistema exibe seletor de nível (EF1, EF2, Ensino Médio) seguido das habilidades de letramento digital e cultura digital filtradas para o nível escolhido, com multi-seleção via checkboxes

#### Scenario: Curso para adultos ou profissionais
- **WHEN** o usuário seleciona "Adultos / Profissionais"
- **THEN** o sistema exibe checkboxes para multi-seleção entre C2 (Pensamento científico, crítico e criativo) e C5 (Cultura digital)

---

### Requirement: Multi-seleção de habilidades BNCC para Ed. Básica
O sistema SHALL permitir que o usuário selecione múltiplas habilidades BNCC simultaneamente via checkboxes. O usuário pode selecionar qualquer combinação de habilidades disponíveis para o nível escolhido.

#### Scenario: Seleção de múltiplas habilidades
- **WHEN** o usuário marca dois ou mais checkboxes de habilidades
- **THEN** todas as habilidades marcadas são incluídas no contexto BNCC da sessão como array

#### Scenario: Nenhuma habilidade selecionada
- **WHEN** o usuário não marca nenhum checkbox e avança
- **THEN** o sistema exibe alerta solicitando ao menos uma seleção antes de prosseguir

---

### Requirement: Dados BNCC carregados de arquivo estático
O sistema SHALL carregar os dados BNCC (habilidades de letramento digital + cultura digital e competências C2/C5) de `bncc-data.js` na inicialização do servidor, sem chamadas à OpenAI ou leitura de disco por requisição.

#### Scenario: Requisição de habilidades por nível
- **WHEN** o frontend chama `GET /api/bncc?nivel=ef2`
- **THEN** o servidor retorna JSON com array de habilidades `{ id, codigo, descricao }` filtradas para EF2, diretamente do objeto em memória, sem chamada à OpenAI

#### Scenario: Requisição de competências gerais
- **WHEN** o frontend chama `GET /api/bncc?tipo=competencias`
- **THEN** o servidor retorna JSON com C2 e C5 `{ id, titulo, descricao }` do objeto em memória

---

### Requirement: Persistência das seleções BNCC na sessão
O sistema SHALL armazenar as seleções BNCC do usuário na sessão como contexto permanente disponível para todas as skills subsequentes.

#### Scenario: Confirmação da seleção BNCC
- **WHEN** o usuário confirma suas seleções via `POST /api/bncc/selecionar`
- **THEN** a sessão armazena `{ ativo: true, publico: "basica"|"adulto", nivel: string|null, itens: [{ id, descricao }] }` e o sistema avança para metodologia pedagógica

---

### Requirement: Injeção do contexto BNCC nos prompts das skills
O sistema SHALL injetar as habilidades ou competências selecionadas como bloco `## Alinhamento BNCC` nos prompts de todas as skills que geram conteúdo, quando `session.bncc.ativo === true`.

#### Scenario: Skill recebe contexto BNCC ativo
- **WHEN** uma skill é chamada e `session.bncc.ativo === true`
- **THEN** o prompt inclui bloco com código e descrição de cada item selecionado, instruindo o modelo a observar e justificar o alinhamento ao longo do conteúdo gerado

#### Scenario: Skill chamada sem BNCC ativo
- **WHEN** uma skill é chamada e `session.bncc.ativo === false`
- **THEN** o prompt não inclui nenhum bloco BNCC e a skill se comporta exatamente como antes desta change
