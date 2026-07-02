## ADDED Requirements

### Requirement: Restauração automática de conteudoPorAula a partir do disco
O sistema SHALL tentar restaurar `sess.conteudoPorAula` a partir de dados persistidos em disco sempre que este array estiver vazio no início dos handlers da Etapa 6. A restauração SHALL ser transparente para o usuário e não SHALL alterar o contrato dos endpoints nem o comportamento quando a sessão já estiver populada.

#### Scenario: Sessão com aulas mas sem conteudoPorAula
- **WHEN** `sess.conteudoPorAula` está vazio mas `sess.aulas` contém as aulas do projeto
- **THEN** o sistema lê os arquivos `aula{NN}_conteudo.txt` do diretório `scr/` do projeto
- **THEN** popula `sess.conteudoPorAula` com `{ ...aula, texto }` para cada aula
- **THEN** o handler prossegue normalmente como se a sessão estivesse completa

#### Scenario: Sessão sem aulas mas com config do projeto
- **WHEN** `sess.conteudoPorAula` e `sess.aulas` estão ambos vazios, mas `sess.config.nome` ou `sess.config.pastaProjeto` permite localizar `projeto.json` em disco
- **THEN** o sistema lê `projeto.json` do diretório `scr/` do projeto
- **THEN** popula `sess.aulas` com os dados lidos
- **THEN** em seguida popula `sess.conteudoPorAula` lendo os `aula{NN}_conteudo.txt` correspondentes
- **THEN** o handler prossegue normalmente

#### Scenario: Projeto não pode ser inferido
- **WHEN** `sess.conteudoPorAula`, `sess.aulas` e `sess.config.nome` estão todos ausentes ou vazios
- **THEN** o sistema retorna HTTP 400 com a mensagem `"Carregue o projeto antes de aplicar melhorias."`
- **THEN** nenhuma leitura de arquivo ou processamento é iniciado

#### Scenario: projeto.json corrompido ou ausente
- **WHEN** a tentativa de ler `projeto.json` lança uma exceção (arquivo ausente, JSON inválido, permissão negada)
- **THEN** o sistema absorve silenciosamente a exceção
- **THEN** se `conteudoPorAula` seguir vazio após a tentativa, retorna HTTP 400 com mensagem de erro clara
- **THEN** nenhum dado corrompido é gravado na sessão

#### Scenario: Sessão já populada (caminho normal)
- **WHEN** `sess.conteudoPorAula` já contém as aulas (sessão populada normalmente via Etapa 5 ou Carregar Projeto)
- **THEN** o sistema usa os dados da sessão diretamente, sem tentar ler do disco
- **THEN** o comportamento é idêntico ao comportamento anterior ao fix
