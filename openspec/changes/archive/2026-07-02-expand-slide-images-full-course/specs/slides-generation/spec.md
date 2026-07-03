## ADDED Requirements

### Requirement: Cobertura completa de geração de imagem para todas as aulas do curso
O sistema SHALL gerar imagens para todo slide que `slidesSkill` identificar como beneficiado por imagem (`imagem.promptCena` preenchido), em qualquer aula do curso, sem restrição de quantidade de aulas. Não há mais distinção entre "aulas piloto" e "aulas restantes" — toda aula passa pelo mesmo fluxo de geração de imagem descrito no requisito "Geração de imagem por slide, no estilo escolhido, com restrições técnicas fixas".

#### Scenario: Todas as aulas recebem imagens quando indicado
- **WHEN** o curso tem N aulas, cada uma com um ou mais slides com `imagem.promptCena` preenchido
- **THEN** todas as N aulas passam pelo fluxo completo de geração de imagem, sem nenhuma aula pulada por posição/índice

#### Scenario: Curso longo não interrompe a geração
- **WHEN** um curso tem um número elevado de aulas (ex.: 20 ou mais)
- **THEN** o sistema continua gerando imagens para cada aula em sequência, respeitando o mesmo pacing já existente (pausa entre imagens da mesma aula e entre aulas), sem impor um corte arbitrário de aulas

## MODIFIED Requirements

### Requirement: Menu de estilos visuais coerente com o perfil do curso
Antes de gerar slides com imagem, o sistema SHALL oferecer um menu de 3 a 5 opções de estilo visual, geradas com base no perfil do curso (nome, público-alvo, nível, modalidade, objetivos), via `GET /api/estilos-visuais`. As opções SHALL se basear em arquétipos de estilo nomeados e reconhecíveis (ex.: lúdico/cartoon, dinâmico/moderno, estilo Pixar/3D animado, minimalista/geométrico, corporativo/sóbrio, aquarela/artesanal, ou combinações coerentes entre eles), adaptados pela IA ao público-alvo e à tipologia do curso — não descrições de estilo genéricas sem referência reconhecível. Cada opção SHALL incluir um título curto, uma descrição em português explicando a coerência com o curso, e um prompt de estilo em inglês para o gerador de imagens. O usuário SHALL escolher uma opção via `POST /api/estilos-visuais/selecionar` antes que a geração de imagens possa iniciar.

#### Scenario: Menu gerado a partir do perfil do curso
- **WHEN** o cliente chama `GET /api/estilos-visuais` com a configuração do curso já definida (Etapa 1)
- **THEN** o sistema retorna de 3 a 5 opções de estilo, cada uma com título, descrição em português e um prompt de estilo em inglês

#### Scenario: Opções ancoradas em arquétipos reconhecíveis
- **WHEN** o sistema gera o menu de estilos para um curso qualquer
- **THEN** cada opção do menu corresponde a um arquétipo de estilo nomeado e reconhecível (ou uma combinação coerente entre arquétipos), adaptado ao público-alvo e à tipologia do curso — não uma categoria inventada sem referência conhecida

#### Scenario: Escolha do usuário é obrigatória antes da geração
- **WHEN** o cliente chama `GET /api/slides` sem um estilo visual previamente selecionado nesta sessão
- **THEN** o servidor retorna HTTP 400 com uma mensagem pedindo para escolher um estilo antes de gerar os slides

#### Scenario: Escolha do usuário é persistida
- **WHEN** o cliente chama `POST /api/estilos-visuais/selecionar` com uma opção válida (contendo `housePrompt`)
- **THEN** o sistema grava a escolha na sessão (`sess.estiloVisual`) e no `projeto.json` do curso
- **THEN** uma chamada subsequente a `GET /api/slides` na mesma sessão usa esse estilo sem pedir nova seleção

#### Scenario: Estilo restaurado ao recarregar o projeto
- **WHEN** o usuário recarrega um projeto (`POST /api/carregar-projeto`) que já teve um estilo visual selecionado anteriormente
- **THEN** `sess.estiloVisual` é restaurado a partir do `projeto.json`, sem exigir nova escolha

## REMOVED Requirements

### Requirement: Limite inicial de aulas ilustradas (piloto controlado)
**Reason**: O piloto de 4 aulas foi validado ao vivo (9 imagens geradas, 0 falhas) e aprovado pelo usuário, que pediu explicitamente a expansão para todas as aulas do curso. O limite não tem mais propósito funcional.
**Migration**: Nenhuma migração necessária — projetos que já geraram slides com o piloto continuam válidos; rodar a Etapa 8 novamente cobre as aulas restantes. Substituído pelo requisito "Cobertura completa de geração de imagem para todas as aulas do curso".
