## ADDED Requirements

### Requirement: Persistência imediata de pastaProjeto em POST /api/config
`POST /api/config` SHALL persistir imediatamente `projeto.json` e o índice global `saídas/index.json` (via `saveProject`) sempre que o valor de `pastaProjeto` recebido na requisição for diferente do valor previamente salvo em `sess.config`, independentemente de outros campos pedagógicos terem mudado ou de a ementa ser regenerada nesta mesma requisição.

#### Scenario: Definir pastaProjeto pela primeira vez em um curso já existente
- **WHEN** o usuário submete a Etapa 1 de um curso que já tem ementa gerada, preenchendo `pastaProjeto` (antes vazio) com um caminho válido
- **THEN** `saídas/index.json` é atualizado com o novo `pastaProjeto` para o slug deste curso
- **THEN** `projeto.json` dentro da pasta do curso é atualizado com `config.pastaProjeto` igual ao novo valor
- **THEN** isso ocorre mesmo que nenhum campo pedagógico (nome, público, carga, duração, nível, objetivos) tenha mudado e a ementa não seja regerada

#### Scenario: Alterar pastaProjeto para um novo caminho
- **WHEN** o usuário submete a Etapa 1 alterando `pastaProjeto` de um valor já configurado para outro caminho válido
- **THEN** `saídas/index.json` e o `projeto.json` do curso refletem o novo caminho imediatamente após a resposta desta requisição

#### Scenario: Submeter a Etapa 1 sem alterar pastaProjeto
- **WHEN** o usuário submete a Etapa 1 e o valor de `pastaProjeto` é idêntico ao já salvo em `sess.config` (incluindo o caso de ambos vazios)
- **THEN** nenhuma escrita adicional de `projeto.json`/`saídas/index.json` é feita só por causa deste campo (o comportamento existente de persistência condicionada a `conteudoMudou`/ementa permanece inalterado)

#### Scenario: Projeto recarregado posteriormente usa a pastaProjeto correta
- **WHEN** um curso teve `pastaProjeto` definida e, em uma sessão futura (após reinício do servidor ou nova sessão do navegador), o usuário seleciona esse curso na lista de projetos
- **THEN** `POST /api/carregar-projeto` resolve o diretório correto a partir de `saídas/index.json`, que já contém a `pastaProjeto` real
- **THEN** a geração de conteúdo subsequente (incluindo os arquivos das aulas) é salva na pasta configurada, não em `saídas/{slug}/`
