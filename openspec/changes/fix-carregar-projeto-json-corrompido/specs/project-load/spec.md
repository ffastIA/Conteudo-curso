## ADDED Requirements

### Requirement: Tolerância a projeto.json corrompido no carregamento
O sistema SHALL, quando `scr/projeto.json` existir mas não for JSON válido, tratá-lo como ausente: SHALL preservar o arquivo renomeando-o para `projeto.json.corrompido-<timestamp>.bak` na mesma pasta, SHALL continuar o carregamento pelo caminho legado (leitura dos `.txt`, reconstrução de `sess.aulas` a partir de `aula{NN}_conteudo.txt` quando houver, escaneamento dos arquivos reais), e SHALL incluir na resposta um campo `aviso` contendo a palavra "corrompido" e o campo `backup` com o nome do arquivo preservado. O cliente SHALL exibir o `aviso` ao usuário.

#### Scenario: projeto.json corrompido com .txt presentes
- **WHEN** o cliente faz `POST /api/carregar-projeto` com uma pasta cujo `scr/projeto.json` não é JSON válido e que contém `scr/ementa.txt` e `scr/aula01_conteudo.txt`
- **THEN** a resposta é 200 com `ok: true`, `etapasCarregadas` contendo `ementa` e `aula01_conteudo`, `arquivos` listando esses arquivos e `camposFaltantes` contendo `bncc` e `metodologia`
- **THEN** `aviso` casa `/corrompido/i` e `backup` informa o `.bak` criado; o `.bak` contém o conteúdo original e o conteúdo ruim não permanece em `projeto.json` (o arquivo deixa de existir ou é regenerado como JSON válido pela reconstrução das aulas)

#### Scenario: Falha ao renomear o arquivo corrompido
- **WHEN** o `rename` do `projeto.json` corrompido falha
- **THEN** o carregamento prossegue normalmente, `aviso` é retornado sem `backup`, e a falha é registrada no log

#### Scenario: Cliente exibe o aviso
- **WHEN** a resposta de `/api/carregar-projeto` traz `aviso`
- **THEN** o frontend mostra o texto do `aviso` ao usuário após marcar as etapas carregadas

### Requirement: Gravação atômica do projeto.json
O sistema SHALL gravar `scr/projeto.json` de forma atômica: o conteúdo SHALL ser escrito em um arquivo temporário na mesma pasta e movido sobre `projeto.json` por `rename`, de modo que nunca exista um `projeto.json` parcial ou com restos de uma versão anterior. Em caso de erro, o arquivo temporário SHALL ser removido e a falha registrada no log sem interromper a etapa em andamento.

#### Scenario: Gravação bem-sucedida
- **WHEN** `saveProject()` é chamado com `sess.config.nome` definido
- **THEN** `scr/projeto.json` contém JSON válido com os campos atuais da sessão e nenhum arquivo `projeto.json.tmp-*` permanece na pasta

#### Scenario: Falha na gravação
- **WHEN** a escrita ou o `rename` falha
- **THEN** o `projeto.json` anterior permanece intacto, o temporário é removido e o erro é registrado no log
