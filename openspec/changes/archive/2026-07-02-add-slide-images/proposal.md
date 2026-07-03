## Why

A Etapa 8 (Slides) já transforma o conteúdo textual de cada aula num `.pptx`, mas hoje só com título + bullets — nenhum elemento visual. O usuário quer que, ao final da geração textual do curso, o sistema também produza conteúdo visual de qualidade (imagens + texto), mantendo um padrão consistente do início ao fim do curso, já pronto para importar no Canva. Antes de gerar as imagens, o usuário quer escolher o estilo visual a partir de um menu de opções coerentes com o perfil do curso (público-alvo, faixa etária, tipologia, tom mais lúdico ou mais sóbrio), em vez de um estilo fixo.

## What Changes

- `slidesSkill` (`skills.js`) passa a decidir, no mesmo call que já segmenta os slides, quais slides de cada aula merecem uma imagem (campo `imagem.promptCena` por slide, `null` quando não se aplica) — sem chamada extra por aula.
- Nova skill `estiloVisualSkill`: antes de gerar, propõe de 3 a 5 opções de estilo visual coerentes com o perfil do curso (público, faixa etária, tipo de curso), com título, descrição em português e um prompt de estilo em inglês por opção.
- Novos endpoints `GET /api/estilos-visuais` (gera o menu) e `POST /api/estilos-visuais/selecionar` (grava a escolha do usuário na sessão e no `projeto.json`), seguindo o mesmo padrão já usado pela seleção BNCC.
- `buildPptx` ganha um branch de layout com imagem (bullets à esquerda, imagem à direita) quando o slide tiver `imagem` preenchida e a geração tiver funcionado; sem mudança visual para slides sem imagem.
- Novo helper `gerarImagemSlide`, usando `openai.images.generate` (`gpt-image-1.5`, qualidade `medium`) — o prompt final combina a cena decidida pela IA + o estilo escolhido pelo usuário + restrições técnicas fixas (sem texto/logos na imagem, composição quadrada centralizada).
- `GET /api/slides` passa a exigir um estilo visual já escolhido (`sess.estiloVisual`) antes de gerar, e limita a geração de imagem às primeiras `IMAGE_LESSON_LIMIT` aulas do curso (piloto controlado antes de cobrir o curso inteiro).
- Falha na geração de uma imagem específica não interrompe a aula nem o curso — o slide correspondente cai no layout sem imagem.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `slides-generation`: novos requisitos aditivos — geração de imagens por slide com estilo visual escolhido pelo usuário, menu de estilos coerente com o curso, e um limite inicial de aulas ilustradas (piloto). Nenhum requisito existente da Etapa 8 tem seu comportamento alterado (slides sem imagem seguem idênticos).

## Impact

- `skills.js`: nova `estiloVisualSkill`; `slidesSkill` ganha o campo `imagem` no contrato JSON; novas constantes `IMAGE_LAYOUT_CONSTRAINTS`, `MODEL_IMAGE`, `IMAGE_QUALITY`, `IMAGE_LESSON_LIMIT`.
- `server.js`: novos endpoints `GET /api/estilos-visuais` e `POST /api/estilos-visuais/selecionar`; `buildPptx` ganha branch de imagem; novo helper `gerarImagemSlide`; `GET /api/slides` ganha guarda de estilo escolhido e loop de geração de imagem; `saveProject`/`/api/carregar-projeto` passam a persistir/restaurar `estiloVisual`; contador `tokenUsage.images` exposto em `GET /api/tokens`.
- `public/index.html` / `public/app.js`: novo bloco de seleção de estilo na Etapa 8, antes do botão "Gerar Slides".
- Nenhuma nova dependência npm — `pptxgenjs` (já instalado) e o client `openai` (já configurado) cobrem tudo.
- Custo: introduz chamadas pagas à API de imagens da OpenAI, limitadas nesta primeira fase às 4 primeiras aulas do curso.
- Não há Gap ID (G01-G10 do PROJECT.md) diretamente relacionado — feature nova, não correção de gap conhecido.

## Non-goals

- Não integra com a API/MCP do Canva nesta versão — entrega um `.pptx` bem formatado, que o Canva já importa nativamente; integração direta fica para uma mudança futura.
- Não gera imagem para todas as aulas do curso nesta primeira fase — `IMAGE_LESSON_LIMIT` restringe às 4 primeiras aulas até aprovação explícita do usuário; ampliar para o curso inteiro é a Fase 2, tratada como último passo desta mesma change ou uma mudança de acompanhamento mínima.
- Não usa `pptx.defineSlideMaster` — a consistência visual entre aulas já vem de todas passarem pela mesma função `buildPptx`; introduzir a API de placeholders do pptxgenjs (nunca usada neste projeto) não se justifica só por organização de código.
- Não implementa troca de estilo após a escolha inicial nesta versão (ex.: botão "Trocar estilo") — fica como possível melhoria futura.
- Não adiciona configuração de modelo/qualidade/tamanho de imagem pelo usuário — `gpt-image-1.5`, qualidade `medium` e tamanho `1024x1024` são fixos no código nesta primeira versão.
