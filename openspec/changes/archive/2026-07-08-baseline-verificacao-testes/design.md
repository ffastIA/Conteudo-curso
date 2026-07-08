# Design: baseline-verificacao-testes

## Context

Suíte atual: Jest 30 + Supertest, 164 testes verdes em ~8s, mock global da OpenAI via `moduleNameMapper`. Cobertura medida em `e61017a`: server.js 36,41% de linhas, skills.js 87,87%, global 38,62% — abaixo do threshold de 40%, então `npm run test:coverage` falha. As faixas não cobertas de `server.js` são exatamente o núcleo do produto (export :2045-2250, melhorias :2384-2987, carregar-projeto :1819-1906, builder DOCX :3025-3272). O mock devolve prosa fixa (`'mock response text'`), o que torna impossível exercitar skills com contrato JSON (`planLessonsSkill`) e a rota de slides (`openai.images.generate` nem existe no mock).

## Goals / Non-Goals

**Goals:**
- `npm run test:coverage` com exit 0 e threshold intacto em 40%.
- Cobertura real (asserts de conteúdo, não só de shape) nos caminhos críticos.
- Mock capaz de: sequência de respostas heterogêneas, imagens, erro de abort.

**Non-Goals:**
- Meta de cobertura alta (70%+) — este é o piso, não o teto.
- Refatorar server.js para ficar mais testável (inverte a ordem: o baseline vem antes do refactor).
- CI (sem remote GitHub hoje).

## Decisions

1. **Estender o mock, não trocá-lo.** Alternativa: adotar `nock`/`msw` interceptando HTTP real do SDK. Rejeitada: dependência nova (PROJECT.md §8 exige aprovação) e o mock atual já é o padrão dos 164 testes existentes — extensão retrocompatível preserva tudo.
2. **Fila de respostas (`__setResponses`) em vez de mock por-rota.** Endpoints como `/api/conteudo` fazem N chamadas com contratos distintos (JSON de aulas, depois prosa por aula); uma fila FIFO reproduz isso sem acoplamento à implementação.
3. **Pasta temporária (`fs.mkdtempSync`) como `pastaProjeto` nos testes de persistência** — evita sujar `saídas/` e torna os testes herméticos no Windows (caminhos com espaços e acentos do repo real não entram no caminho do teste).
4. **Testes de caracterização para `slugify`/helpers**: documentam o comportamento atual (espaços→`_`), não o ideal — mudanças de comportamento ficam para um change próprio.
5. **Threshold permanece 40.** Subir agora criaria outro gate vermelho no futuro próximo; baixar destruiria o propósito. 40 volta a ser um piso honesto.

## Risks / Trade-offs

- [Testes do ciclo de melhorias acoplados ao formato `<<<SECAO:>>>`] → É contrato de produto documentado (PROJECT.md §4); se o formato mudar, o teste DEVE quebrar.
- [Upload de `.docx` no teste de melhorias pode ser frágil] → Fallback definido no plano: cobrir só a metade `confirmar` populando a sessão via `carregar-projeto`, com a escolha registrada.
- [Extensão do mock quebrar testes existentes] → Mitigação: API aditiva; os 164 testes rodam intactos como verificação do Step 1.
- [Flag de filtro do Jest 30] → Usar `--testPathPatterns` (plural); a forma singular foi removida no Jest 30.

## Open Questions

- Formato JSON exato esperado por `planLessons` (server.js ~:1521-1571) — o implementador DEVE ler a função antes de escrever o teste (STOP condition no plano se divergir do descrito).
