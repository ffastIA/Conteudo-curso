## Context

A change `add-slide-images` (arquivada em `openspec/changes/archive/2026-07-02-add-slide-images/`) entregou o piloto: `slidesSkill` decide por slide se uma imagem ajuda (`imagem.promptCena`), `estiloVisualSkill` gera um menu de 3-5 estilos coerentes com o curso, o usuário escolhe um estilo antes de gerar, e `gerarImagemSlide` (server.js) chama `openai.images.generate` (`gpt-image-1.5`, `medium`) combinando cena + estilo + restrições técnicas fixas. Tudo isso ficou restrito às primeiras `IMAGE_LESSON_LIMIT = 4` aulas (`skills.js`), guardado por `if (i < skills.IMAGE_LESSON_LIMIT)` dentro do loop de `GET /api/slides` (`server.js`).

Teste ao vivo do piloto (curso "Python para Iniciantes", 4 aulas): 9 imagens geradas, 0 falhas, estilo "Lúdico e Colorido" aplicado corretamente, arquivos `.pptx` com imagens embutidas salvos em `courseRootDir(sess)` (a pasta escolhida pelo usuário na Etapa 1). Usuário aprovou o resultado e pediu (1) cobertura de todas as aulas do curso e (2) um menu de estilo mais rico, ancorado em arquétipos nomeados e reconhecíveis (lúdico/cartoon, dinâmico, Pixar/3D, minimalista/geométrico, corporativo/sóbrio, aquarela, etc.).

## Goals / Non-Goals

**Goals:**
- Toda aula do curso passa pelo mesmo fluxo de decisão de imagem (`slidesSkill`) e geração (`gerarImagemSlide`) — sem distinção entre "aulas piloto" e "aulas restantes".
- O menu de `estiloVisualSkill` continua sendo gerado dinamicamente pela IA por curso (não uma lista estática fixa), mas agora ancorado em um conjunto de referência de arquétipos nomeados, para que as opções sejam reconhecíveis e não genéricas demais.
- Confirmar (documentar como requisito formal, sem mudar código) que a saída da Etapa 8 continua salva na pasta do projeto da Etapa 1.

**Non-Goals:**
- Não introduz fila de jobs, processamento paralelo, nem infraestrutura de background workers para acelerar cursos longos — o pacing sequencial já validado (2s entre imagens, 4s entre aulas) é mantido; cursos muito longos simplesmente demoram mais (trade-off aceito, ver Riscos).
- Não adiciona configuração de modelo/qualidade/tamanho pelo usuário.
- Não permite prompt de estilo livre/customizado pelo usuário — o menu continua 100% gerado pela IA, apenas com melhor ancoragem.
- Não muda o destino de salvamento dos arquivos (`courseRootDir(sess)`) — já correto.

## Decisions

### Remover `IMAGE_LESSON_LIMIT` inteiramente, não apenas aumentar o valor

Em vez de mudar `IMAGE_LESSON_LIMIT = 4` para um número maior (ex.: `Infinity` ou 999), a constante e o guard `if (i < skills.IMAGE_LESSON_LIMIT)` em `GET /api/slides` são removidos por completo. `IMAGE_LESSON_LIMIT` existia exclusivamente para restringir o piloto — mantê-la como "guard sempre verdadeiro" seria configuração morta sem propósito funcional real, e todo o projeto evita esse tipo de sinalização residual (ver `PROJECT.md`, princípio de não introduzir configuração para necessidades hipotéticas). O bloco de geração de imagem por aula deixa de estar condicionado a `i`, e passa a rodar sempre que a aula tiver slides com `imagem` preenchida.

*Alternativa considerada:* manter a constante com um valor alto configurável — rejeitada porque não há necessidade real de um limite configurável nesta fase; se um limite fizer sentido no futuro (ex.: por custo por execução), pode ser reintroduzido then, com um propósito concreto, não especulativo.

### Pacing inalterado — trade-off aceito para cursos longos

A pausa de ~2s entre imagens da mesma aula e ~4s entre aulas é mantida sem alteração. Um curso de N aulas, cada uma com até ~6 slides ilustrados (orientação já existente em `slidesSkill`), pode gerar dezenas de imagens em sequência — a Etapa 8 passa a levar potencialmente vários minutos para cursos longos. Isso já está comunicado ao usuário na etapa 8 ("a geração de imagens para várias aulas pode levar alguns minutos", texto introduzido em `add-slide-images`). Introduzir paralelismo ou fila de background exigiria mudanças arquiteturais (fora do padrão SSE síncrono do request atual) não justificadas nesta fase — aceito como trade-off, não um bug.

### Menu de estilo ancorado em arquétipos nomeados, mantendo curadoria por IA

`estiloVisualSkill` (`skills.js`) recebe uma lista de referência de arquétipos de estilo no `system` prompt — ex.: "playful/cartoon", "dynamic/modern", "Pixar-style 3D animated", "minimalist/geometric", "corporate/muted", "watercolor/handcrafted" — como banco de inspiração, não como catálogo fixo. A instrução ao modelo passa a ser: "escolha e adapte de 3 a 5 arquétipos desta lista (ou uma combinação coerente de dois) que façam sentido para este curso específico, adaptando paleta/tom ao público-alvo e à tipologia — o título de cada opção deve refletir um arquétipno reconhecível, não uma categoria genérica inventada." Isso preserva o comportamento já validado (a IA adapta as opções ao perfil do curso, ex. "Lúdico e Colorido" com paleta vibrante para iniciantes) e resolve o pedido do usuário de ter estilos "nomeados e reconhecíveis" em vez de descrições soltas.

*Alternativa considerada:* lista fixa de estilos pré-escritos (sem IA), selecionados por regra (ex.: público infantil → sempre "lúdico"). Rejeitada — perde a adaptação por curso já demonstrada como valiosa no teste ao vivo (a mesma pergunta gerou 5 opções coerentes e distintas para o perfil específico do curso, algo que uma lista fixa por categoria não replicaria tão bem).

### Confirmação do diretório de saída — sem mudança de código

O requisito "Um arquivo .pptx por aula, salvo na pasta do projeto" (já presente em `openspec/specs/slides-generation/spec.md`, não introduzido por esta change) já cobre que `persistPptxStage`/`courseRootDir(sess)` salvam sempre na pasta escolhida pelo usuário na Etapa 1 (`sess.config.pastaProjeto`). O teste ao vivo da change anterior confirmou isso na prática (arquivos gerados em `saídas/Python_para_Iniciantes/`, a pasta configurada). Não há delta spec para este ponto — é apenas reafirmado aqui para registro, já que o usuário pediu confirmação explícita.

## Risks / Trade-offs

- [Risco] Custo real de API cresce proporcionalmente ao número de aulas do curso (sem mais limite de 4) → Aceito explicitamente pelo usuário ao pedir esta expansão, após validar o resultado do piloto.
- [Risco] Tempo de execução da Etapa 8 aumenta para cursos longos (dezenas de imagens em série) → Mitigado pela mensagem já existente na UI avisando que a geração pode levar minutos; sem mitigação adicional nesta fase (ver Non-Goals).
- [Risco] Arquétipos de estilo nomeados podem não cobrir todo perfil de curso possível → Aceito; a lista de referência é inspiração para a IA, não uma enumeração exaustiva — a IA pode adaptar/combinar arquétipos quando nenhum se encaixar sozinho.
- [Risco] `.pptx` de cursos longos com muitas imagens embutidas cresce em tamanho (múltiplos MB por aula) → Aceito, mesma observação já feita em `add-slide-images`, sem ação necessária.

## Migration Plan

Mudança aditiva/simplificadora — remove uma constante e um guard condicional, sem alterar contratos de API externos (`GET/POST /api/estilos-visuais*`, `GET /api/slides` mantêm as mesmas assinaturas). Nenhuma migração de dados: `projeto.json` de projetos que já geraram slides com o piloto (4 aulas) continuam válidos; rodar a Etapa 8 novamente nesses projetos agora cobre as aulas restantes também. Rollback trivial: reverter o diff restaura o limite de 4 aulas.

## Open Questions

Nenhuma — escopo foi definido diretamente pelo pedido explícito do usuário após validação do piloto.
