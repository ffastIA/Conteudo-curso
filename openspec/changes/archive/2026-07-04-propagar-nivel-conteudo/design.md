# Design: propagar-nivel-conteudo

## Context

O `nivel` flui corretamente do formulário à persistência (`public/index.html:133-141` → `public/app.js:320` → `POST /api/config`, `server.js:732-758` → `projeto.json`, `server.js:305`) e já é parâmetro de 9 skills (`metodologiaSkill`, `ementaSkill`, `pesquisaWebSkill`, `pesquisaFallbackSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`, `estiloVisualSkill`) — mas apenas como linha `Nível: ${nivel}` sem semântica. O modelo não sabe o que o sistema espera que "básico" ou "avançado" signifique; o resultado é conteúdo de profundidade uniforme.

Lacunas totais: `slidesSkill` (`skills.js:134-163`) não recebe o nível; `revisaoQualidadeSkill` (`skills.js:275-326`) recebe `config` mas só usa `nome`/`publico` — o revisor automático nunca fiscaliza desvio de nível; `aplicarMelhoriasSkill` (`skills.js:329-354`) idem.

Atenção: existe um segundo conceito de "nível" no sistema — o nível BNCC (`ef1/ef2/em/competencias`, `server.js:74`) — que não é o nível de conteúdo.

## Goals / Non-Goals

**Goals:**
- Uma única definição operacional de cada nível governando todas as etapas (coerência vertical do currículo).
- Pesquisa web direcionada pelo nível.
- Revisão de qualidade fiscalizando a adequação ao nível (geração alinhada + revisão que cobra o alinhamento).

**Non-Goals:**
- Skills especializadas por nível.
- Mudanças de formulário, API ou persistência.
- Alterar o tratamento do nível BNCC.

## Decisions

1. **Skill única parametrizada, não 3 variantes por skill.**
   Alternativa considerada: uma skill por nível por etapa (~24-30 funções novas). Rejeitada: duplicação massiva de prompts calibrados (limites de escopo, anti-duplicação, JSON estrito em `planLessonsSkill`) com drift garantido — correções de prompt teriam de ser aplicadas 3×; dispatch em ~10 call sites; não escala para um 4º nível. Pedagogicamente, os prompts não mudam de estrutura entre níveis — mudam de parâmetros (profundidade, Bloom, vocabulário), o que é literalmente a definição de parametrização.

2. **Mapa `NIVEL_DIRETRIZES` com variantes `geral` e `pesquisa`.**
   `geral`: bloco `## Diretrizes de Nível — {Nível}` com profundidade esperada, vocabulário (definir termos técnicos vs. usá-los livremente), pré-requisitos assumíveis, tipo de exemplos/atividades, nível de Bloom predominante (básico → lembrar/entender/aplicar; intermediário → aplicar/analisar; avançado → analisar/avaliar/criar) e o que evitar (básico → não aprofundar internals; avançado → não gastar tempo em fundamentos). `pesquisa`: direcionamento das consultas web por nível. Duas variantes porque a skill de pesquisa precisa de instrução sobre O QUE BUSCAR, não sobre como escrever.

3. **Helper `nivelBlock(nivel, tipo = 'geral')` com normalização.**
   O formulário envia `"Básico"`/`"Intermediário"`/`"Avançado"` (capitalizado e acentuado); o helper normaliza (lowercase + remoção de acentos) e retorna string vazia para valor ausente/desconhecido — projetos legados/importados não quebram.

4. **Injeção no prompt `user` seguindo o padrão `pedagCtxBlock` existente; reforço opcional no `system` das skills principais.**
   Nas 9 skills que já recebem `nivel`, concatenar `nivelBlock(nivel)` — zero mudança de assinatura e zero mudança em `server.js` para essas. Em `conteudoSkill` e `planoAulaSkill`, mencionar o nível também no `system` (instruções em system têm mais aderência que metadado em user).

5. **Fechar as 3 lacunas explicitamente.**
   `slidesSkill`: novo parâmetro `nivel` + injeção (única mudança em `server.js`, linha 663). `revisaoQualidadeSkill`: nova seção obrigatória "Adequação ao Nível Declarado ({config.nivel})" ao lado da seção de faixa etária (`skills.js:304-308`). `aplicarMelhoriasSkill`: injetar `nivelBlock(config?.nivel)`.

## Risks / Trade-offs

- [Diretrizes mal calibradas geram conteúdo raso demais/denso demais] → Validar a redação com o responsável pedagógico; E2E comparando o mesmo curso em básico vs. avançado antes do merge.
- [Valores de nível não normalizados em projetos importados] → Fallback vazio do helper (Decisão 3).
- [Conteúdo regenerado difere de projetos existentes] → Esperado e desejado; sem regeneração retroativa.
- [Asserts de prompt existentes quebram] → Revisar `tests/unit/skills.test.js` no mesmo PR.
- [Confusão com nível BNCC] → Nomenclatura distinta no código (`nivelBlock` vs. contexto BNCC) e teste garantindo que o bloco BNCC permanece intacto.

## Migration Plan

Sem migração de dados. Projetos existentes passam a receber as diretrizes na próxima geração/regeneração. Rollback = revert do commit.

## Open Questions

- Minuta das diretrizes por nível redigida em `diretrizes-nivel.md` (base: boas práticas gerais de educação profissional) — pendente de revisão/aprovação do usuário (task 1.1).
