### Requirement: Geração de slides a partir do conteúdo já existente
O sistema SHALL oferecer uma Etapa 8 opcional que, para cada aula em `sess.conteudoPorAula`, usa `slidesSkill` para analisar o conteúdo já gerado e estruturá-lo em uma sequência de 6 a 10 slides (título + bullets), com a quantidade decidida pela IA conforme a densidade do conteúdo. O sistema SHALL NOT misturar tópicos de módulos ou disciplinas distintos no mesmo slide, e os slides SHALL NOT incluir notas do apresentador — o conteúdo de cada slide SHALL ser autoexplicativo.

#### Scenario: Estruturação de uma aula com conteúdo denso
- **WHEN** o sistema processa uma aula com conteúdo extenso
- **THEN** `slidesSkill` retorna um JSON `{"slides": [...]}` com um número de itens dentro da faixa 6-10, mais próximo de 10 conforme a densidade do conteúdo

#### Scenario: Estruturação de uma aula com conteúdo enxuto
- **WHEN** o sistema processa uma aula com conteúdo mais curto
- **THEN** `slidesSkill` retorna um número de slides mais próximo de 6

#### Scenario: Nenhuma mistura de módulos no mesmo slide
- **WHEN** uma aula cobre mais de um sub-tópico distinto
- **THEN** cada slide gerado permanece coeso em torno de um único assunto, sem combinar sub-tópicos não relacionados

---

### Requirement: Um arquivo .pptx por aula, salvo na pasta do projeto
O sistema SHALL gerar um arquivo `.pptx` por aula (`aula{NN}_slides.pptx`), salvo diretamente em `courseRootDir(sess)`, nunca via download do navegador. Cada arquivo SHALL consolidar todos os slides daquela aula em um único documento.

#### Scenario: Geração de slides para um curso com múltiplas aulas
- **WHEN** o usuário clica em "Gerar Slides" para um curso com N aulas
- **THEN** o sistema gera N arquivos `.pptx`, um por aula, nomeados `aula01_slides.pptx`, `aula02_slides.pptx`, etc.
- **THEN** cada arquivo é salvo em `courseRootDir(sess)`, sem nenhum passo de download pelo navegador

#### Scenario: Rastreamento de origem no projeto
- **WHEN** um arquivo de slides é gerado com sucesso
- **THEN** `projeto.json.stages` registra uma entrada `aula{NN}_slides` com `fonte: "ia"` e o timestamp de geração

---

### Requirement: Padronização visual dos slides
Cada slide gerado SHALL usar uma fonte compatível com importação no Canva sem substituição, tamanho de fonte legível a até 5 metros de distância de projeção (título ≥ 32pt, corpo ≥ 22pt), layout widescreen (16:9), e um rodapé no canto inferior esquerdo de cada slide de conteúdo contendo: identificação da aula, tema do curso, data e horário de geração.

#### Scenario: Rodapé presente em todo slide de conteúdo
- **WHEN** um slide de conteúdo (não a capa) é gerado
- **THEN** o rodapé no canto inferior esquerdo contém o título da aula, o nome do curso, a data e o horário de geração

#### Scenario: Fonte e tamanhos consistentes
- **WHEN** qualquer slide é gerado
- **THEN** a fonte usada é uma fonte padrão compatível com Canva (ex.: Calibri)
- **THEN** o título do slide usa tamanho de fonte de pelo menos 32pt e o corpo/bullets usa tamanho de pelo menos 22pt

---

### Requirement: Etapa opcional e independente
A Etapa 8 SHALL ser opcional e SHALL NOT bloquear nem ser bloqueada por nenhuma outra etapa, exceto exigir que a Etapa 5 (Conteúdo) já tenha sido concluída (fonte de dados necessária). A interface SHALL exibir o botão "Gerar Slides" desabilitado até que a Etapa 5 esteja concluída, seguindo o mesmo padrão já usado pelas Etapas 7 (Qualidade/PPC).

#### Scenario: Botão desabilitado antes da Etapa 5
- **WHEN** o usuário ainda não concluiu a Etapa 5 (Conteúdo)
- **THEN** o botão "Gerar Slides" na Etapa 8 permanece desabilitado

#### Scenario: Geração de slides não afeta outras etapas
- **WHEN** o usuário gera os slides de um curso
- **THEN** nenhum dado de `sess.ementa`, `sess.pesquisa`, `sess.planoEnsino`, `sess.planoAula`, `sess.conteudo`, `sess.revisaoQualidade` ou `sess.relatorioQualidade` é alterado

#### Scenario: Geração de slides sem conteúdo disponível é rejeitada
- **WHEN** o usuário tenta gerar slides antes de a Etapa 5 ter sido concluída
- **THEN** `GET /api/slides` retorna status 400 com uma mensagem indicando que a Etapa 5 precisa ser concluída primeiro

---

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

---

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

---

### Requirement: Layout de slide com imagem, mantendo compatibilidade visual dos slides sem imagem
O sistema SHALL renderizar slides com imagem num layout com os bullets à esquerda e a imagem à direita, numa caixa quadrada. Slides sem imagem (por decisão da IA ou por falha de geração) SHALL manter exatamente o layout de texto integral já existente, sem nenhuma alteração visual.

#### Scenario: Slide com imagem gerada com sucesso
- **WHEN** um slide tem uma imagem gerada com sucesso
- **THEN** o `.pptx` mostra os bullets desse slide numa coluna à esquerda e a imagem numa caixa à direita, sem sobreposição

#### Scenario: Slide sem imagem permanece inalterado
- **WHEN** um slide não tem imagem (decisão da IA ou falha de geração)
- **THEN** o `.pptx` mostra os bullets em largura total, no mesmo layout já usado antes desta mudança

---

### Requirement: Cobertura completa de geração de imagem para todas as aulas do curso
O sistema SHALL gerar imagens para todo slide que `slidesSkill` identificar como beneficiado por imagem (`imagem.promptCena` preenchido), em qualquer aula do curso, sem restrição de quantidade de aulas. Não há mais distinção entre "aulas piloto" e "aulas restantes" — toda aula passa pelo mesmo fluxo de geração de imagem descrito no requisito "Geração de imagem por slide, no estilo escolhido, com restrições técnicas fixas".

#### Scenario: Todas as aulas recebem imagens quando indicado
- **WHEN** o curso tem N aulas, cada uma com um ou mais slides com `imagem.promptCena` preenchido
- **THEN** todas as N aulas passam pelo fluxo completo de geração de imagem, sem nenhuma aula pulada por posição/índice

#### Scenario: Curso longo não interrompe a geração
- **WHEN** um curso tem um número elevado de aulas (ex.: 20 ou mais)
- **THEN** o sistema continua gerando imagens para cada aula em sequência, respeitando o mesmo pacing já existente (pausa entre imagens da mesma aula e entre aulas), sem impor um corte arbitrário de aulas
