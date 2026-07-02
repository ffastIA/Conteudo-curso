## Context

O conteúdo de cada aula já existe em `sess.conteudoPorAula[i]` (`{ titulo, modulo, objetivos, texto }`), populado por `GET /api/conteudo` (`server.js:938-1017`) e restaurável via `restoreConteudoPorAula(sess)` (`server.js:237-256`) se a sessão em memória tiver sido perdida. Esse `texto` é a mesma string markdown-ish que `buildDocx` (`server.js:1316-1424`) já sabe transformar em `.docx`.

Duas funções centrais do pipeline — `buildDocx` e `persistStage` (`server.js:290-302`) — são fortemente acopladas ao par `.txt`+`.docx`: `persistStage` grava `.txt` em `/scr` (memória lida por etapas futuras via `readMemory()`) e chama `buildDocx` para o `.docx` na raiz. Nenhuma das duas serve para `.pptx`: apresentações são organizadas por slide (não por fluxo contínuo de texto), e slides não precisam ser lidos de volta como "memória" por nenhuma etapa posterior — não existe uma "Etapa 9" que dependa do conteúdo dos slides.

Não há nenhuma dependência npm de geração de `.pptx` no projeto hoje.

## Goals / Non-Goals

**Goals:**
- Um `.pptx` por aula, gerado a partir do conteúdo já existente, sem nenhuma nova chamada de geração de conteúdo (só estruturação/resumo do que já existe).
- Visual consistente, legível a distância, com identificação clara de aula/curso/data em cada slide.
- Etapa totalmente opcional e desacoplada — zero mudança de comportamento nas Etapas 0-7.

**Non-Goals:**
- Geração de imagens/gráficos.
- Notas do apresentador.
- Ciclo de exportar/editar/reimportar (diferente das etapas de texto).
- Configuração de tema/fonte pelo usuário nesta primeira versão.

## Decisions

### Biblioteca: `pptxgenjs`

Adicionar `pptxgenjs` como dependência npm — é a biblioteca mais madura e usada do ecossistema Node para gerar `.pptx` programaticamente (layouts, texto formatado, bullets, fontes customizadas, posicionamento absoluto para rodapés). Gera arquivos `.pptx` binários compatíveis com o formato OOXML padrão do PowerPoint/Office 365 nativamente, sem exigir o PowerPoint instalado no servidor.

- *Alternativa considerada:* `officegen`. Rejeitada — projeto com manutenção mais esparsa e API menos ergonômica para o caso de uso (layouts com posicionamento preciso de texto/rodapé).

### `slidesSkill`: saída JSON estruturada, seguindo o padrão de `planLessonsSkill`

```javascript
const slidesSkill = ({ nomeCurso, aula }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional e comunicação visual. Extraia ' +
    'os tópicos principais de um conteúdo de aula e organize-os em slides ' +
    'autoexplicativos, sem depender de um apresentador. Responda apenas com ' +
    'JSON válido, sem texto adicional.',
  user:
    `Analise o conteúdo da aula abaixo e organize-o em uma sequência de 6 a 10 ` +
    `slides, conforme a densidade do conteúdo (menos slides para conteúdo mais ` +
    `enxuto, mais slides para conteúdo mais denso). Cada slide deve ter um ` +
    `título curto e de 2 a 5 bullets concisos e autoexplicativos (sem precisar ` +
    `de um professor explicando ao lado). NÃO misture tópicos de módulos ou ` +
    `disciplinas distintos no mesmo slide — mantenha cada slide coeso em torno ` +
    `de um só assunto. NÃO inclua notas do apresentador.\n\n` +
    `Curso: ${nomeCurso}\nAula: ${aula.titulo}\nMódulo: ${aula.modulo || 'não especificado'}\n` +
    `Objetivos: ${aula.objetivos || 'não especificados'}\n\n` +
    `Conteúdo completo da aula:\n${aula.texto}\n\n` +
    `Responda SOMENTE com um JSON no formato exato:\n` +
    `{"slides": [{"titulo": "string", "bullets": ["string", ...]}]}`
});
```

Chamada não-streaming com `response_format: { type: 'json_object' }`, `JSON.parse` com fallback (mesmo padrão de `server.js:845` para `planLessonsSkill`). Modelo `MODEL_ECONOMY` (`gpt-4o-mini`) — tarefa de extração/estruturação, não de geração criativa longa, consistente com o restante do pipeline.

### `buildPptx(config, aula, slidePlan, geradoEm)`: nova função, não reaproveita `buildDocx`

```javascript
function buildPptx(config, aula, slidePlan, geradoEm) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDESCREEN', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDESCREEN';

  const FONT = 'Calibri';
  const rodape = `${aula.titulo} · ${config.nome} · ${geradoEm.toLocaleDateString('pt-BR')} ${geradoEm.toLocaleTimeString('pt-BR')}`;

  // Slide de capa (identificação — não conta na faixa de 6-10 slides de conteúdo)
  const capa = pptx.addSlide();
  capa.addText(aula.titulo, { x: 0.6, y: 2.6, w: 12, h: 1.2, fontFace: FONT, fontSize: 36, bold: true, color: '4A3B8C' });
  capa.addText(config.nome, { x: 0.6, y: 3.8, w: 12, h: 0.6, fontFace: FONT, fontSize: 20, color: '555555' });

  for (const slide of slidePlan.slides) {
    const s = pptx.addSlide();
    s.addText(slide.titulo, { x: 0.6, y: 0.4, w: 12, h: 0.9, fontFace: FONT, fontSize: 32, bold: true, color: '4A3B8C' });
    s.addText(
      slide.bullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } })),
      { x: 0.8, y: 1.6, w: 11.5, h: 5, fontFace: FONT, fontSize: 24, color: '222222', valign: 'top' }
    );
    s.addText(rodape, { x: 0.4, y: 7.05, w: 8, h: 0.35, fontFace: FONT, fontSize: 11, color: '888888', align: 'left' });
  }

  return pptx;
}
```

- *Fonte — Calibri:* fonte nativa do Office/PowerPoint, também presente na biblioteca de fontes do Canva sem necessidade de substituição ao importar — elimina o risco de a apresentação "quebrar" o layout ao ser reaberta em outra ferramenta. Alternativas como "Montserrat"/"Open Sans" (Google Fonts, também disponíveis no Canva) ficam registradas como opção futura para um visual mais "moderno", mas não são a escolha padrão desta primeira versão.
- *Tamanhos de fonte:* título 32-36pt, corpo 22-24pt — dentro da prática comum de design de apresentações para salas grandes (recomendação geral: nunca abaixo de ~20pt para texto de corpo em projeção a vários metros de distância).
- *Layout 16:9:* padrão moderno do PowerPoint/Office 365 (widescreen), evita a aparência datada do 4:3.
- *Slide de capa:* adição de baixo custo, não pedida explicitamente mas coerente com "identificação da aula" — um primeiro slide simples com o título da aula e o nome do curso, complementando (não substituindo) o rodapé presente em todos os slides de conteúdo.
- *Rodapé:* presente em todo slide de conteúdo (não na capa, para não duplicar a identificação), formato `{aula} · {curso} · {data} {hora}`, fonte pequena (11pt), canto inferior esquerdo.
- *Paleta:* reaproveita a cor de destaque já usada na interface do próprio app (`#4A3B8C`, vista em badges de origem no frontend) para título — mantém uma identidade visual consistente com o resto do produto, sem introduzir uma paleta nova.

### `persistPptxStage(sess, baseName, aula, slidePlan)`: variante de `persistStage` sem `.txt`

```javascript
async function persistPptxStage(sess, baseName, aula, slidePlan) {
  const rootDir = courseRootDir(sess);
  const pptx = buildPptx(sess.config, aula, slidePlan, new Date());
  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  const fullPath = path.join(rootDir, `${baseName}.pptx`);
  fs.writeFileSync(fullPath, buffer);
  saveProject(sess, { baseName, fonte: 'ia' });
  return fullPath;
}
```

- *Por que não reaproveitar `persistStage`:* essa função sempre grava um `.txt` companheiro em `/scr` (memória para `readMemory()`); slides não precisam disso — não existe leitura futura do conteúdo dos slides por nenhuma etapa. Forçar esse `.txt` seria um artefato órfão sem propósito. `saveProject` continua sendo chamado para que `aula{NN}_slides` apareça em `projeto.json.stages` (rastreamento de origem), consistente com o resto do pipeline.

### `GET /api/slides`: SSE com `done` carregando lista de arquivos, não `fullText`

```javascript
app.get('/api/slides', async (req, res) => {
  const sess = getSession(req, res);
  if (!sess.conteudo && !sess.conteudoPorAula?.length) {
    return res.status(400).json({ error: 'Conclua a Etapa 5 antes de gerar os slides.' });
  }
  restoreConteudoPorAula(sess);
  sseHeaders(res);
  try {
    const arquivos = [];
    for (let i = 0; i < sess.conteudoPorAula.length; i++) {
      const aula = sess.conteudoPorAula[i];
      const numero = String(i + 1).padStart(2, '0');
      send(res, { type: 'progress', message: `Gerando slides da aula ${i + 1} de ${sess.conteudoPorAula.length}: ${aula.titulo}` });

      const skill = skills.slidesSkill({ nomeCurso: sess.config.nome, aula });
      const completion = await openai.chat.completions.create({
        model: skill.model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: skill.system }, { role: 'user', content: skill.user }]
      });
      addUsage(completion.usage);
      let slidePlan = { slides: [] };
      try { slidePlan = JSON.parse(completion.choices[0]?.message?.content || '{}'); } catch {}

      const baseName = `aula${numero}_slides`;
      const fullPath = await persistPptxStage(sess, baseName, aula, slidePlan);
      arquivos.push({ baseName, titulo: aula.titulo, path: fullPath });
    }
    send(res, { type: 'progress', message: 'Concluído' });
    send(res, { type: 'done', arquivos });
  } catch (err) {
    console.error(err);
    send(res, { type: 'error', message: err.message || 'Erro ao gerar slides' });
  } finally {
    res.end();
  }
});
```

- *Por que SSE em vez de uma resposta única:* mantém o mesmo padrão de feedback de progresso já usado em `/api/plano-aula`/`/api/conteudo` para cursos com muitas aulas — o usuário vê "Gerando slides da aula X de N" em vez de esperar em silêncio.
- *Por que `done` carrega `arquivos` em vez de `fullText`:* não há texto para renderizar como resultado — o artefato é binário. `streamSSE()` no cliente (`public/app.js:129-171` e correções feitas nesta sessão) precisa de um pequeno ajuste para este caso específico: quando `onDone` recebe o payload completo (não só `fullText`), a Etapa 8 renderiza cards de arquivo (mesmo padrão visual já usado em `carregarProjetoPorPasta` para `data.arquivos`) em vez de chamar `renderMarkdown`.

### Frontend: Etapa 8 espelha a Etapa 7, com resultado em cards em vez de texto

Segue exatamente o padrão de `btnQualidade`/`btnPpc` (`public/app.js:638-687`) para gating (`state.doneSteps.has(5)`) e estrutura de card (`public/index.html:398-436`), mas a área de resultado não usa `streamSSE()` com renderização de markdown — usa um handler dedicado que consome os eventos `progress` (log) e `done` (lista de arquivos) diretamente, similar ao consumo de `arquivos` já implementado para o carregamento de projeto por pasta.

## Risks / Trade-offs

- [Risco] `pptxgenjs` é uma nova dependência de terceiros — superfície adicional de manutenção → Mitigação: é a biblioteca padrão de fato do ecossistema Node para este caso de uso, ativamente mantida, sem alternativa mais estabelecida.
- [Risco] A IA pode gerar bullets longos demais para caber confortavelmente no slide dentro do tamanho de fonte definido → Mitigação: a instrução de prompt pede bullets "concisos"; ajuste fino de prompt/tamanho de fonte pode ser necessário após uso real, mas não bloqueia a primeira versão.
- [Risco] Cursos com muitas aulas (ex.: 20+) geram 20+ chamadas sequenciais à OpenAI nesta etapa, com o mesmo risco de rate-limit já mitigado em outras etapas (`harden-conteudo-rate-limit-timeout`) → Mitigação: fora do escopo desta primeira versão; pode ser adicionado depois seguindo o mesmo padrão de pausa/timeout já validado em outra etapa, se necessário na prática.

## Migration Plan

Funcionalidade inteiramente nova e aditiva — nenhuma migração de dados necessária. Projetos existentes simplesmente não têm arquivos `_slides.pptx` até que o usuário gere-os pela primeira vez. Rollback trivial: remover a dependência e o código novo, sem efeito em nenhum dado já persistido.
