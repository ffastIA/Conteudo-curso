## 1. `skills.js` — remover limite piloto e enriquecer o menu de estilo

- [x] 1.1 Remover a constante `IMAGE_LESSON_LIMIT` de `skills.js` e sua entrada em `module.exports` (não substituir por outro valor — a constante deixa de existir).
- [x] 1.2 Reescrever o `system`/`user` prompt de `estiloVisualSkill` para incluir uma lista de referência de arquétipos de estilo nomeados (ex.: playful/cartoon, dynamic/modern, Pixar-style 3D animated, minimalist/geometric, corporate/muted, watercolor/handcrafted), instruindo o modelo a escolher e adaptar de 3 a 5 opções ancoradas nesses arquétipos (ou combinações coerentes entre eles) conforme público-alvo, faixa etária e tipologia do curso — títulos das opções devem refletir um arquétipo reconhecível, não uma categoria genérica inventada.

## 2. `server.js` — geração de imagem para todas as aulas

- [x] 2.1 Em `GET /api/slides`, remover a condição `if (i < skills.IMAGE_LESSON_LIMIT)` que hoje envolve o loop de geração de imagem — o bloco passa a rodar para toda aula que tiver slides com `imagem` preenchida, sem depender do índice `i`.
- [x] 2.2 Confirmar (sem alterar) que o pacing existente é preservado: pausa de ~2s entre imagens da mesma aula (`if (j > 0) await ... 2000`) e ~4s entre aulas (`if (i < aulas.length - 1) await ... 4000`).

## 3. Validação

- [x] 3.1 Rodar `node -c server.js` e `node -c skills.js` para confirmar sintaxe.
- [x] 3.2 Rodar `npm test` para garantir que as suítes existentes não quebraram.
- [x] 3.3 Testar `GET /api/estilos-visuais` contra 2-3 perfis de curso distintos (ex.: público infantil/lúdico, público corporativo/sóbrio, curso técnico adulto) e confirmar que as opções geradas citam arquétipos nomeados e reconhecíveis, adaptados a cada perfil. Testado com 3 perfis: "Python para Iniciantes" (adultos, básico) → Lúdico/Moderno/Aquarela/Minimalista/**Pixar 3D**; "Governança Corporativa de TI" (executivos seniores) → Minimalista Geométrico/Corporativo Sutil/Dinâmico/Aquarela (deslocado para sóbrio/corporativo); "Programação para Crianças 8-10 anos" → Lúdico/**Pixar 3D**/Moderno/Aquarela/Geometria Divertida (deslocado para lúdico/infantil). Arquétipos nomeados aparecem explicitamente nos títulos em todos os perfis.
- [x] 3.4 Testado ao vivo (custo real de API, confirmado com o usuário) com um curso de teste de 5 aulas ("Teste_5_Aulas", conteúdo sintético sem custo de Etapa 1-5, evitando gasto duplicado de texto). Resultado: aula 5 (antes bloqueada pelo limite de 4) recebeu imagem normalmente — 5 imagens geradas no total entre as 5 aulas (aula 2 corretamente sem imagem, por decisão da IA de que nenhum slide se beneficiava), 0 falhas. Estilo "Minimalista Geométrico" aplicado corretamente (confirmado visualmente).
- [x] 3.5 Confirmado que os arquivos `.pptx` gerados continuam salvos em `courseRootDir(sess)` (a pasta do projeto definida na Etapa 1) — todos os 5 arquivos apareceram diretamente em `saídas/Teste_5_Aulas/`, a `pastaProjeto` configurada, consistente com o comportamento já validado na change anterior.
