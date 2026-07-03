## Why

A change `add-slide-images` (arquivada) entregou um piloto controlado: menu de estilo visual + geração de imagem por slide, limitado às 4 primeiras aulas do curso (`IMAGE_LESSON_LIMIT`). O piloto foi validado ao vivo (curso de 4 aulas, 9 imagens geradas, 0 falhas, estilo aplicado corretamente, arquivos `.pptx` com imagens embutidas salvos corretamente na pasta do projeto) e aprovado pelo usuário. O usuário agora pede explicitamente para (1) cobrir **todas** as aulas do curso, não só as 4 primeiras, e (2) tornar o menu de estilo visual mais rico e reconhecível, ancorado em arquétipos nomeados (ex.: lúdico/cartoon, dinâmico, estilo Pixar/3D, minimalista/geométrico, corporativo/sóbrio, aquarela) em vez de opções totalmente livres sem referência a estilos conhecidos.

## What Changes

- Remover a restrição `IMAGE_LESSON_LIMIT = 4` em `skills.js` — todas as aulas do curso passam a receber o mesmo tratamento (slides ilustrados quando `slidesSkill` indicar `imagem.promptCena`), sem distinção entre "aulas piloto" e "aulas restantes".
- `GET /api/slides` (`server.js`) remove o `if (i < skills.IMAGE_LESSON_LIMIT)` que hoje pula a geração de imagem a partir da 5ª aula — o loop de geração de imagem passa a rodar para toda aula com slides ilustrados, mantendo a mesma pausa de ~2s entre imagens da mesma aula e ~4s entre aulas (evita simplesmente remover o guard sem repensar o pacing para cursos maiores).
- `estiloVisualSkill` (`skills.js`) tem seu prompt reescrito para ancorar as opções geradas em um conjunto de arquétipos de estilo nomeados e reconhecíveis (lúdico/cartoon, dinâmico/moderno, estilo Pixar/3D animado, minimalista/geométrico, corporativo/sóbrio, aquarela/artesanal, entre outros equivalentes) — a IA continua escolhendo e adaptando de 3 a 5 dessas opções (com `housePrompt` ajustado) conforme o público-alvo, faixa etária e tipologia do curso, em vez de inventar categorias livres sem nome reconhecível.
- Confirma (sem mudança de código) que a saída da Etapa 8 — os arquivos `.pptx` com imagens embutidas — continua sendo salva em `courseRootDir(sess)` (a pasta do projeto definida na Etapa 1, `sess.config.pastaProjeto`), o mesmo destino já usado por todos os outros artefatos do curso. Este comportamento já existe e foi validado no teste ao vivo da change anterior; passa a constar como requisito explícito do spec para não regressão futura.
- Sem mudança nos demais aspectos já entregues: guarda de estilo obrigatório antes de gerar, isolamento de falha por imagem (uma imagem falha não derruba a aula/curso), layout de slide com/sem imagem, persistência de `estiloVisual` em `projeto.json`.

## Capabilities

### New Capabilities

Nenhuma — esta change amplia e refina a capability `slides-generation` já existente (introduzida por `add-slide-images`).

### Modified Capabilities

- `slides-generation`: o requisito "Limite inicial de aulas ilustradas (piloto controlado)" é substituído por um requisito de cobertura total (todas as aulas do curso recebem o mesmo tratamento de imagem). O requisito "Menu de estilos visuais coerente com o perfil do curso" ganha um critério adicional: as opções apresentadas devem se ancorar em arquétipos de estilo nomeados e reconhecíveis. Um novo requisito confirma o destino de salvamento (pasta do projeto da Etapa 1) como comportamento formalmente especificado.

## Impact

- `skills.js`: remove ou torna sem efeito a constante `IMAGE_LESSON_LIMIT` (decisão de design: remover a constante e o guard, não apenas aumentar o número — ver `design.md`); reescreve o prompt de `estiloVisualSkill` para incluir a lista de arquétipos de referência.
- `server.js`: em `GET /api/slides`, remove a condição `i < skills.IMAGE_LESSON_LIMIT` do loop de geração de imagem — todas as aulas passam pelo mesmo fluxo.
- Custo: geração de imagem passa a ocorrer para o curso inteiro, não só as 4 primeiras aulas — aumenta proporcionalmente ao número de aulas e de slides ilustrados por aula. Sem mudança de modelo/qualidade (`gpt-image-1.5`, `medium` seguem fixos).
- Tempo de execução da Etapa 8 aumenta para cursos longos (mais chamadas de imagem em série, respeitando o pacing existente) — mencionado como trade-off aceito em `design.md`.
- Nenhuma nova dependência npm.
- Não há Gap ID (G01-G07 do PROJECT.md) diretamente relacionado — feature nova, não correção de gap conhecido.

## Non-goals

- Não adiciona configuração de modelo/qualidade/tamanho de imagem pelo usuário — seguem fixos (`gpt-image-1.5`, `medium`, `1024x1024`), como já decidido em `add-slide-images`.
- Não permite que o usuário escreva um prompt de estilo livre/customizado — o menu continua sendo gerado e curado pela IA (`estiloVisualSkill`), agora apenas ancorado em arquétipos nomeados como inspiração, não uma lista fixa de opções idênticas em todo curso.
- Não implementa troca de estilo após a escolha inicial, nem geração de imagem por upload do usuário.
- Não integra com a API/MCP do Canva nesta versão.
- Não muda o destino de salvamento dos arquivos `.pptx` — apenas confirma/formaliza o comportamento já existente (pasta do projeto da Etapa 1).
