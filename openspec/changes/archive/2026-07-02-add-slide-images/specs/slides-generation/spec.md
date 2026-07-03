## ADDED Requirements

### Requirement: Menu de estilos visuais coerente com o perfil do curso
Antes de gerar slides com imagem, o sistema SHALL oferecer um menu de 3 a 5 opções de estilo visual, geradas com base no perfil do curso (nome, público-alvo, nível, modalidade, objetivos), via `GET /api/estilos-visuais`. Cada opção SHALL incluir um título curto, uma descrição em português explicando a coerência com o curso, e um prompt de estilo em inglês para o gerador de imagens. O usuário SHALL escolher uma opção via `POST /api/estilos-visuais/selecionar` antes que a geração de imagens possa iniciar.

#### Scenario: Menu gerado a partir do perfil do curso
- **WHEN** o cliente chama `GET /api/estilos-visuais` com a configuração do curso já definida (Etapa 1)
- **THEN** o sistema retorna de 3 a 5 opções de estilo, cada uma com título, descrição em português e um prompt de estilo em inglês

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

### Requirement: Geração de imagem por slide, no estilo escolhido, com restrições técnicas fixas
Para os slides que `slidesSkill` identificar como beneficiados por uma imagem (campo `imagem.promptCena` não nulo), o sistema SHALL gerar uma imagem via API de imagens da OpenAI (`gpt-image-1.5`, qualidade `medium`), combinando a cena decidida pela IA, o estilo escolhido pelo usuário, e restrições técnicas fixas (composição quadrada centralizada, ausência de texto/logos na imagem) sempre aplicadas independentemente do estilo escolhido.

#### Scenario: Slide identificado como beneficiado por imagem
- **WHEN** `slidesSkill` retorna um slide com `imagem.promptCena` preenchido
- **THEN** o sistema chama a API de imagens com um prompt combinando `promptCena`, o `housePrompt` do estilo escolhido e as restrições técnicas fixas

#### Scenario: Slide sem necessidade de imagem
- **WHEN** `slidesSkill` retorna um slide com `imagem: null`
- **THEN** nenhuma chamada à API de imagens é feita para esse slide, e ele é renderizado no layout de texto integral já existente

#### Scenario: Falha isolada na geração de uma imagem
- **WHEN** a chamada à API de imagens para um slide específico falha (erro de rede, timeout, recusa de política de conteúdo)
- **THEN** o sistema registra a falha no log do servidor e emite uma mensagem de progresso informativa via SSE
- **THEN** o slide afetado é renderizado no layout de texto integral (mesmo comportamento de "sem imagem"), sem interromper a geração da aula ou do curso

### Requirement: Layout de slide com imagem, mantendo compatibilidade visual dos slides sem imagem
O sistema SHALL renderizar slides com imagem num layout com os bullets à esquerda e a imagem à direita, numa caixa quadrada. Slides sem imagem (por decisão da IA ou por falha de geração) SHALL manter exatamente o layout de texto integral já existente, sem nenhuma alteração visual.

#### Scenario: Slide com imagem gerada com sucesso
- **WHEN** um slide tem uma imagem gerada com sucesso
- **THEN** o `.pptx` mostra os bullets desse slide numa coluna à esquerda e a imagem numa caixa à direita, sem sobreposição

#### Scenario: Slide sem imagem permanece inalterado
- **WHEN** um slide não tem imagem (decisão da IA ou falha de geração)
- **THEN** o `.pptx` mostra os bullets em largura total, no mesmo layout já usado antes desta mudança

### Requirement: Limite inicial de aulas ilustradas (piloto controlado)
Nesta primeira versão, o sistema SHALL restringir a geração de imagens às primeiras `IMAGE_LESSON_LIMIT` aulas do curso (valor inicial: 4). Aulas além desse limite SHALL continuar recebendo o `.pptx` somente-texto já existente, mesmo que `slidesSkill` identifique slides que se beneficiariam de imagem.

#### Scenario: Aulas dentro do limite recebem imagens
- **WHEN** o curso tem aulas de índice menor que `IMAGE_LESSON_LIMIT`
- **THEN** essas aulas passam pelo fluxo completo de geração de imagem (quando `slidesSkill` indicar necessidade)

#### Scenario: Aulas além do limite não geram imagem
- **WHEN** o curso tem aulas de índice igual ou maior que `IMAGE_LESSON_LIMIT`
- **THEN** essas aulas não disparam nenhuma chamada à API de imagens, mesmo que `slidesSkill` retorne `imagem` preenchida para algum de seus slides
- **THEN** o `.pptx` dessas aulas é idêntico ao gerado antes desta mudança
