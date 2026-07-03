## Context

`GET /api/slides` (`server.js:591-645`) já transforma o conteúdo de cada aula (`sess.conteudoPorAula[i].texto`) num `.pptx` via `slidesSkill` (`skills.js:133-153`, JSON `{"slides": [{"titulo", "bullets"}]}`) e `buildPptx` (`server.js:1568-1603`). Hoje `buildPptx` só desenha título + bullets por slide, sem nenhuma imagem, e não há nenhum mecanismo de escolha de estilo visual — este design adiciona os dois.

`pptxgenjs` `^4.0.1` (já instalado) suporta `Slide.addImage()` com dado base64 (`data: 'image/png;base64,...'`) sem precisar de arquivo temporário. `openai` SDK v4 (já configurado) expõe `openai.images.generate(body, options)` — confirmado via `node_modules/openai/resources/images.d.ts:39` que `signal` é o segundo argumento, não um campo do corpo da requisição.

`gpt-image-1` (usado num piloto anterior desta mesma sessão, depois revertido a pedido do usuário) será descontinuado em 23/10/2026; o sucessor `gpt-image-1.5` é mais barato em todos os tiers e tem geração mais consistente entre chamadas — relevante para o objetivo de manter um padrão visual.

## Goals / Non-Goals

**Goals:**
- Slides com imagem e texto, não só texto — para os slides que a própria IA (no mesmo call que já decide a segmentação) julgar que se beneficiam de apoio visual.
- Um menu de estilos visuais coerente com o perfil de cada curso, escolhido pelo usuário antes da geração começar, aplicado de forma determinística (em código) a toda imagem gerada naquela execução — garante que a aula 1 e a aula N pareçam do mesmo material.
- Testar em escala controlada (4 aulas) antes de comprometer o custo/tempo de gerar imagens para o curso inteiro.
- `.pptx` resultante continua importável no Canva sem qualquer passo extra.

**Non-Goals:**
- Integração direta com a API/MCP do Canva.
- Gerar imagem para todas as aulas nesta primeira fase.
- `pptx.defineSlideMaster`/placeholders reutilizáveis — não necessário para o objetivo de consistência (ver Decisões).
- Configuração de modelo/qualidade/tamanho de imagem pelo usuário.
- Troca de estilo após a escolha inicial.

## Decisions

### Um único call de `slidesSkill` decide segmentação E necessidade de imagem por slide

Em vez de uma segunda chamada de chat por aula para decidir quais slides ilustrar, o mesmo call que já lê `aula.texto` e decide os 6-10 slides passa a também retornar, por slide, um campo `imagem: {"promptCena": "..."} | null`. Evita uma chamada extra por aula (custo/latência) e evita divergência entre a segmentação de slides e a escolha de quais ilustrar (um call só vendo o texto completo de uma vez, coerente).

```js
// skills.js — contrato JSON estendido de slidesSkill
{"slides": [
  {"titulo": "string", "bullets": ["string", ...], "imagem": {"promptCena": "string em inglês, só a cena"} | null}
]}
```

`promptCena` é deliberadamente **só a cena, em inglês, sem palavras de estilo** — o estilo (escolhido pelo usuário) e as restrições técnicas (sempre iguais) são concatenados em código no momento da geração da imagem, nunca decididos pela IA por slide. Isso é o que garante que uma aula gerada com um call e outra aula gerada num call totalmente diferente (chamadas independentes, sem memória compartilhada) ainda produzam imagens no mesmo "sistema" visual.

*Por que orientar "a maioria das aulas deve ter entre 3 e 6 slides ilustrados" como guidance, não regra dura:* mesmo padrão já usado hoje para a contagem de slides ("6 a 10 slides, conforme a densidade do conteúdo") — a IA julga por conteúdo, não por uma cota fixa, mas a orientação evita o extremo de ilustrar 9 de 10 slides numa aula muito densa.

### Menu de estilos: nova skill + dois endpoints, no padrão já usado pela seleção BNCC

`GET /api/bncc` (`server.js:377-388`) retorna opções, `POST /api/bncc/selecionar` (`server.js:391-399`) grava a escolha do usuário na sessão — o novo menu de estilos segue exatamente esse padrão, em vez de inventar um mecanismo novo:

```js
// server.js
app.get('/api/estilos-visuais', async (req, res) => {
  const sess = getSession(req, res);
  const { nome, publico, nivel, objetivos, modalidade } = sess.config;
  const skill = skills.estiloVisualSkill({ nome, publico, nivel, objetivos, modalidade });
  const completion = await openai.chat.completions.create({
    model: skill.model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: skill.system }, { role: 'user', content: skill.user }]
  });
  addUsage(completion.usage);
  let estilos = [];
  try { estilos = JSON.parse(completion.choices[0]?.message?.content || '{}').estilos || []; }
  catch { estilos = []; }
  res.json({ estilos });
});

app.post('/api/estilos-visuais/selecionar', (req, res) => {
  const sess = getSession(req, res);
  const { id, titulo, housePrompt } = req.body || {};
  if (!housePrompt) return res.status(400).json({ error: 'Selecione um estilo antes de continuar.' });
  sess.estiloVisual = { id, titulo, housePrompt };
  saveProject(sess);
  res.json({ ok: true });
});
```

Não-streaming (como `/api/bncc`) — resposta rápida, SSE seria over-engineering aqui.

`estiloVisualSkill` (`skills.js`) recebe o perfil do curso (`nome`, `publico`, `nivel`, `modalidade`, `objetivos`) e retorna de 3 a 5 opções, cada uma com título/descrição em português (para o usuário ler) e um `housePrompt` em inglês (para o gerador de imagens) — reaproveita o mesmo padrão "IA decide, JSON estruturado" já usado por `planLessonsSkill`/`slidesSkill`.

*Por que a paleta de cor não é mais fixa (`#4A3B8C`), como numa versão anterior deste design:* como o estilo agora é escolhido pelo usuário a partir de opções geradas pela IA, forçar uma cor específica em toda opção anularia o propósito de oferecer opções distintas entre si (ex.: uma opção "sóbria corporativa" pode preferir azul/cinza). A cor de marca `#4A3B8C` permanece nos títulos do pptx (inalterado), só não é mais imposta às imagens.

### Restrições técnicas separadas do estilo estético

```js
// skills.js
const IMAGE_LAYOUT_CONSTRAINTS =
  'Centered composition within a square frame, subject fully visible with generous margin on ' +
  'all sides (the image will sit in a square box beside text, not full-bleed). No text, letters, ' +
  'numbers, or logos anywhere in the image. No watermarks, no borders.';
const MODEL_IMAGE = 'gpt-image-1.5';
const IMAGE_QUALITY = 'medium';
const IMAGE_LESSON_LIMIT = 4;
```

Prompt final por imagem = `promptCena` + `housePrompt` (estilo escolhido pelo usuário) + `IMAGE_LAYOUT_CONSTRAINTS` (técnico, sempre igual, independente do estilo). Separar os dois evita que o menu de estilos precise repetir instruções técnicas em toda opção gerada pela IA (risco de inconsistência entre opções) — a composição quadrada e a ausência de texto/logos na imagem são exigências de layout do slide, não escolhas estéticas.

### `buildPptx`: branch de imagem, sem `defineSlideMaster`

`pptxgenjs` `^4.0.1` suporta `pptx.defineSlideMaster(...)` com placeholders reutilizáveis (título/corpo/imagem) — cogitado, mas descartado: a consistência visual entre todas as aulas do curso já vem de graça, porque toda aula passa pela mesma função `buildPptx` com os mesmos valores de estilo hardcoded (isso já é 100% verdade hoje, antes desta mudança). `defineSlideMaster` só ajudaria a organização do código (DRY), mas a API de placeholders do pptxgenjs nunca foi exercitada neste projeto — arriscar uma API não testada sem necessidade funcional real não se justifica. Mantém-se o padrão atual de `addText`/`addSlide` com opções literais, só adicionando o branch condicional de imagem:

```js
if (slide.imagem && slide._imageData) {
  s.addText(bulletsFormatted, { x: 0.8, y: 1.6, w: 6.6, h: 5, fontFace: FONT, fontSize: 22, color: '222222', valign: 'top' });
  s.addImage({
    data: slide._imageData,
    x: 7.7, y: 1.6, w: 4.9, h: 4.9,
    sizing: { type: 'contain', w: 4.9, h: 4.9 },
    altText: slide.titulo || 'Ilustração'
  });
} else {
  s.addText(bulletsFormatted, { x: 0.8, y: 1.6, w: 11.5, h: 5, fontFace: FONT, fontSize: 24, color: '222222', valign: 'top' }); // valores atuais, inalterados
}
```

Layout imagem-à-direita/bullets-à-esquerda (texto lidera, imagem apoia) — composição quadrada centralizada (`IMAGE_LAYOUT_CONSTRAINTS`) combina com a caixa `4.9"×4.9"`. Bullets reduzem de `w:11.5/fontSize:24` para `w:6.6/fontSize:22` só quando há imagem, para não sobrepor a caixa da imagem — slides sem imagem (falha ou decisão da IA) mantêm os valores de hoje, byte-idênticos.

### Geração de imagem: helper dedicado + guarda de estilo obrigatório + limite de aulas

```js
// server.js
async function gerarImagemSlide(promptCena, housePrompt) {
  const response = await openai.images.generate(
    {
      model: skills.MODEL_IMAGE,
      prompt: `${promptCena}. ${housePrompt}. ${skills.IMAGE_LAYOUT_CONSTRAINTS}`,
      size: '1024x1024',
      quality: skills.IMAGE_QUALITY,
      n: 1
    },
    { signal: makeAbortSignal(90000) }
  );
  const b64 = response.data[0]?.b64_json;
  return b64 ? `image/png;base64,${b64}` : null;
}
```

`GET /api/slides` passa a exigir `sess.estiloVisual` (retorna HTTP 400 "Escolha um estilo visual antes de gerar os slides." se ausente — mesmo padrão de guarda já usado para "Etapa 5 não concluída"). Dentro do loop existente por aula, depois de obter `slidePlan`: para `i < IMAGE_LESSON_LIMIT`, itera os slides com `imagem` preenchida, chama `gerarImagemSlide(slide.imagem.promptCena, sess.estiloVisual.housePrompt)`, anexa o resultado em `slide._imageData`; para `i >= IMAGE_LESSON_LIMIT`, pula a geração — o slide cai naturalmente no branch sem imagem de `buildPptx`, sem precisar de lógica extra.

*Por que um limite de aulas em vez de gerar tudo já nesta primeira versão:* um curso de 20 aulas pode gerar ~80 imagens sequenciais (minutos de execução, custo real de API). O usuário pediu explicitamente para validar em 4 aulas antes de comprometer o curso inteiro — `IMAGE_LESSON_LIMIT` é uma constante isolada, ampliá-la depois é uma mudança de uma linha.

*Falha isolada por imagem:* `try/catch` por chamada de `gerarImagemSlide` — falha loga `console.error` + emite `progress` de aviso (nunca `type: 'error'`, que encerraria o `EventSource` inteiro no frontend hoje, `app.js:736-740`), e o slide cai no branch sem imagem. A mesma lógica de layout serve tanto para "IA decidiu não ilustrar" quanto para "tentativa de ilustrar falhou" — nenhum código especial extra para o caso de falha.

*Pacing:* mantém a pausa de 4s já existente entre aulas (`server.js:1089`, mesmo padrão da Etapa 5/6); adiciona uma pausa menor (~2s) entre imagens da mesma aula como margem de rate-limit — a chamada de imagem já é lenta o bastante para não precisar de mais que isso.

### Persistência da escolha de estilo

`saveProject()` (`server.js:283-323`) já serializa `sess.config`/`sess.bncc`/`sess.metodologia`/`sess.aulas`/`sess.inputs` em `projeto.json`. Adiciona `projeto.estiloVisual = sess.estiloVisual || null`, restaurado em `/api/carregar-projeto` no mesmo padrão de `sess.bncc`/`sess.metodologia` — se o usuário recarregar o projeto entre a Fase 1 (4 aulas) e a Fase 2 (curso inteiro), o estilo escolhido é reaproveitado automaticamente.

### Contador de custo sem forçar mapeamento de campos que não existem

`addUsage()` (`server.js:369-374`) lê `usage.prompt_tokens`/`usage.completion_tokens` — campos da API de chat completions. A API de imagens não expõe tokens da mesma forma; em vez de mapear campos que não representam o custo real, um contador simples `tokenUsage.images` é incrementado a cada `gerarImagemSlide` bem-sucedida, exposto junto ao `GET /api/tokens` já existente — visibilidade de quantas imagens foram geradas, sem fingir precisão que a API não oferece.

## Risks / Trade-offs

- [Risco] Custo real de API por execução (imagens `gpt-image-1.5` são mais caras que chat completions) → Mitigado pelo `IMAGE_LESSON_LIMIT = 4` nesta primeira fase; ampliar exige aprovação explícita do usuário sobre o resultado do teste.
- [Risco] `gpt-image-1.5` pode recusar um `promptCena` por política de conteúdo, interrompendo a geração daquele slide → Mitigado pelo try/catch isolado por imagem (item acima); o curso/aula continuam normalmente.
- [Risco] Menu de estilos gerado pela IA pode não ser suficientemente distinto entre as opções em cursos muito genéricos → Aceito para esta primeira versão; o prompt da `estiloVisualSkill` orienta explicitamente variar de mais lúdico a mais sóbrio, e o teste ao vivo (Fase 1) inclui checar isso.
- [Risco] `.pptx` cresce em tamanho com imagens base64 embutidas → Aceito, sem ação necessária; mencionado aqui só como nota, não é um problema funcional.

## Migration Plan

Mudança aditiva — nenhuma migração de dados. Projetos existentes sem `estiloVisual` salvo simplesmente pedem a escolha na próxima geração de slides (guarda HTTP 400 already-covers isso). Rollback trivial: reverter o diff; nenhum estado persistente incompatível é criado (arquivos `.pptx` já gerados continuam válidos, e `projeto.json.estiloVisual` é um campo adicional inofensivo se ignorado por uma versão anterior do código).

## Open Questions

- ~~Ampliar `IMAGE_LESSON_LIMIT` para o curso inteiro (Fase 2)~~ — **Resolvido.** Fase 1 testada ao vivo (4 aulas, 9 imagens, 0 falhas — ver `tasks.md` seção 7) e aprovada pelo usuário. O usuário pediu explicitamente a expansão para todas as aulas **e** um catálogo de estilo mais rico (arquétipos nomeados: lúdico, dinâmico, estilo Pixar, etc.). Por ser maior que uma troca de constante, tratado como change de acompanhamento separada.
