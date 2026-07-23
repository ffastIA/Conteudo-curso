// ── Skills específicas por etapa ─────────────────────────────────────────────
// Cada skill define o modelo apropriado (pesquisa web → gpt-4o-search-preview;
// demais etapas → gpt-4o-mini, mais econômico em tokens) e a estrutura de
// mensagens (system + user) usada na chamada à OpenAI.

const MODEL_RESEARCH = 'gpt-4o-search-preview';
const MODEL_ECONOMY = 'gpt-4o-mini';

// Resumo enxuto (somente título + objetivos) de um conjunto de aulas — usado
// para dar "consciência sequencial" sem sobrecarregar o prompt com texto integral.
function summarizeLessons(aulas, { excludeIndex = -1 } = {}) {
  return aulas
    .map((a, i) => ({ i, a }))
    .filter(({ i }) => i !== excludeIndex)
    .map(({ i, a }) => `Aula ${i + 1}: ${a.titulo}${a.modulo ? ` [Módulo: ${a.modulo}]` : ''} — Objetivos: ${a.objetivos}`)
    .join('\n');
}

// Helper interno: adiciona bloco de contexto pedagógico ao prompt quando presente.
function pedagCtxBlock(metodologia, bnccContext) {
  const parts = [];
  if (metodologia) parts.push(`## Metodologia Pedagógica Adotada\n${metodologia}`);
  if (bnccContext) parts.push(bnccContext);
  return parts.length ? '\n\n' + parts.join('\n\n') : '';
}

// ── Diretrizes por modalidade de ensino ──────────────────────────────────────
// Injetadas no bloco "## Modalidade do Curso" via buildPedagogicalContext
// (server.js), que alcança todas as etapas geradoras. Em caso de conflito,
// a Metodologia Pedagógica definida prevalece (regra incluída no próprio bloco).
const MODALIDADE_DIRETRIZES = {
  presencial:
    '- Atividades: privilegie o que só o encontro físico oferece — prática supervisionada em ' +
    'laboratório/oficina, dinâmicas em grupo, demonstrações ao vivo, simulações e estudos de caso discutidos em turma.\n' +
    '- Recursos: sala de aula, laboratório/oficina e equipamentos físicos; quadro e projetor; ' +
    'apostila como apoio. Não pressuponha AVA como canal principal.\n' +
    '- Interação: síncrona, em turma, com mediação direta do docente e feedback imediato.\n' +
    '- Avaliação: prática observada pelo docente, provas presenciais, apresentações e participação em turma.\n' +
    '- Evite: atividades dependentes de longos períodos de estudo autônomo não mediado; ' +
    'ferramentas online como única via de entrega.',
  ead:
    '- Atividades: autoinstrucionais e assíncronas — videoaulas, leituras guiadas, quizzes com feedback ' +
    'automático, fóruns temáticos, projetos com entrega digital. Encontros síncronos (webconferência) como ' +
    'complemento, nunca como estrutura principal.\n' +
    '- Recursos: Ambiente Virtual de Aprendizagem (AVA), videoaulas e material navegável; para prática, ' +
    'simuladores, laboratórios virtuais ou roteiros que o aluno execute com recursos próprios.\n' +
    '- Interação: fóruns, mensagens e tutoria a distância; inclua orientações explícitas de estudo ' +
    'autônomo, organização de rotina e gestão de tempo.\n' +
    '- Avaliação: instrumentos aplicáveis a distância — questionários online, entregas de projeto, ' +
    'portfólio digital, participação qualificada em fórum.\n' +
    '- Evite: qualquer atividade que dependa de presença física, laboratório físico ou dinâmica de sala; ' +
    'excesso de carga síncrona.',
  hibrido:
    '- Distribuição: reserve os momentos presenciais prioritariamente para prática em laboratório/oficina, ' +
    'dinâmicas e avaliações práticas; os momentos a distância para teoria, preparação prévia e fixação.\n' +
    '- Integração: os momentos a distância devem preparar ou consolidar os encontros presenciais ' +
    '(ex.: sala de aula invertida) — nunca duas trilhas paralelas desconexas.\n' +
    '- Identificação: em ementa, plano de ensino e plano de aula, explicite quais atividades/momentos ' +
    'são presenciais e quais são a distância.\n' +
    '- Recursos: combine AVA e materiais digitais (parte a distância) com laboratório/oficina e ' +
    'dinâmicas de turma (parte presencial).\n' +
    '- Avaliação: combine instrumentos das duas modalidades, posicionando avaliações práticas nos momentos presenciais.\n' +
    '- Evite: tratar o híbrido como "presencial com material online de apoio" ou como "EaD com encontros ' +
    'ocasionais sem função definida".'
};

// Lookup tolerante a caixa/acentuação ("EaD", "Híbrido", "presencial"...).
function normalizeModalidade(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Bloco "## Modalidade do Curso" para o contexto pedagógico. Retorna string
// vazia para modalidade ausente/desconhecida (projetos legados não quebram).
function modalidadeBlock(modalidade, { distribuicaoHibrida, cargaSincronaPorAula } = {}) {
  const diretrizes = MODALIDADE_DIRETRIZES[normalizeModalidade(modalidade)];
  if (!diretrizes) return '';
  const extras = [];
  if (distribuicaoHibrida) {
    extras.push(
      `Distribuição híbrida definida para este curso: ${distribuicaoHibrida} — respeite-a rigorosamente ` +
      `na organização de atividades presenciais e a distância.`
    );
  }
  if (cargaSincronaPorAula) {
    extras.push(
      `Carga síncrona por aula definida para este curso: ${cargaSincronaPorAula} — reserve essa janela ` +
      `explicitamente em cada plano de aula, com objetivo definido (tira-dúvidas, feedback ou demonstração ` +
      `ao vivo), mantendo o restante da aula autoinstrucional.`
    );
  }
  return (
    `## Modalidade do Curso: ${modalidade}\n${diretrizes}` +
    (extras.length ? '\n' + extras.join('\n') : '') +
    '\nEm caso de conflito entre estas diretrizes e a Metodologia Pedagógica definida, ' +
    'a Metodologia Pedagógica prevalece.'
  );
}

// ── Diretrizes por nível de conteúdo ─────────────────────────────────────────
// O nível (básico/intermediário/avançado) define profundidade, vocabulário,
// pré-requisitos assumíveis e o alvo na Taxonomia de Bloom. Variante `geral`
// para as skills de geração; variante `pesquisa` para direcionar as buscas web.
// Distinto do nível BNCC (ef1/ef2/em/competencias) — não confundir.
const NIVEL_DIRETRIZES = {
  basico: {
    geral:
      '- Pré-requisitos: não assuma nenhum conhecimento prévio na área além dos requisitos de ' +
      'ingresso do curso, nem experiência profissional.\n' +
      '- Vocabulário: defina todo termo técnico na primeira ocorrência, em linguagem simples; ' +
      'use analogias com o cotidiano quando ajudar.\n' +
      '- Profundidade: foque no "o quê" e no "como" fundamentais; funcionamento interno e ' +
      'casos-limite apenas mencionados, sem aprofundar.\n' +
      '- Exemplos e atividades: situações do cotidiano e tarefas simples da ocupação; atividades ' +
      'guiadas, com instruções passo a passo e resultado verificável; progressão em passos pequenos.\n' +
      '- Taxonomia de Bloom (alvo): lembrar, entender e aplicar.\n' +
      '- Evite: jargão sem explicação, saltos de raciocínio, atividades que exijam autonomia ' +
      'técnica ou decisões de projeto, aprofundamento em otimização e internals.',
    pesquisa:
      'priorize guias introdutórios, tutoriais passo a passo, materiais didáticos de entrada, ' +
      'glossários e documentação "getting started"; evite artigos avançados, benchmarks e ' +
      'material voltado a profissionais experientes.'
  },
  intermediario: {
    geral:
      '- Pré-requisitos: assuma domínio dos fundamentos da área (nível básico concluído); use ' +
      'termos fundamentais livremente e defina brevemente apenas os especializados.\n' +
      '- Profundidade: além do "como", explique o "porquê"; compare alternativas e apresente ' +
      'critérios de escolha e boas práticas de mercado.\n' +
      '- Exemplos e atividades: cenários reais de trabalho com complexidade moderada; problemas ' +
      'com mais de um caminho possível; pequenos projetos integradores; atividades semiestruturadas.\n' +
      '- Taxonomia de Bloom (alvo): aplicar e analisar.\n' +
      '- Evite: reexplicar fundamentos extensivamente (referencie em vez de reensinar) e ' +
      'profundidade de especialista (tuning fino, casos-limite raros).',
    pesquisa:
      'priorize documentação oficial, boas práticas e padrões de mercado, estudos de caso e ' +
      'comparativos de ferramentas e abordagens; evite material puramente introdutório e ' +
      'material de fronteira/pesquisa.'
  },
  avancado: {
    geral:
      '- Pré-requisitos: assuma experiência prática consolidada na área; use vocabulário técnico ' +
      'livremente, sem definições introdutórias.\n' +
      '- Profundidade: funcionamento interno, otimização, trade-offs, casos-limite, integração ' +
      'entre sistemas/processos, tendências e evolução da área.\n' +
      '- Exemplos e atividades: cenários complexos e realistas (incidentes, projetos completos, ' +
      'decisões sob restrição); atividades abertas — projetos autorais, análise crítica e ' +
      'tomada de decisão justificada.\n' +
      '- Taxonomia de Bloom (alvo): analisar, avaliar e criar.\n' +
      '- Evite: gastar tempo em fundamentos, definições introdutórias e exercícios mecânicos de repetição.',
    pesquisa:
      'priorize documentação avançada e de referência, benchmarks, artigos técnicos, tendências ' +
      'de ponta e certificações profissionais avançadas da área; evite tutoriais introdutórios ' +
      'e material generalista.'
  }
};

// Bloco de diretrizes de nível (vazio para nível ausente/desconhecido —
// projetos legados não quebram). Reusa a normalização de caixa/acentos.
function nivelBlock(nivel, tipo = 'geral') {
  const d = NIVEL_DIRETRIZES[normalizeModalidade(nivel)];
  if (!d) return '';
  if (tipo === 'pesquisa') {
    return `Direcionamento da pesquisa pelo nível (${nivel}): ${d.pesquisa}\n`;
  }
  return `\n\n## Diretrizes de Nível — ${nivel}\n${d.geral}`;
}

// Declaração de peso do nível para o prompt `system` das skills geradoras
// principais (instruções em system têm mais aderência que metadado em user).
const NIVEL_PESO_ALTO =
  ' O nível configurado do curso (básico, intermediário ou avançado) é um fator de PESO ALTO ' +
  'na definição de profundidade, vocabulário e complexidade do que você produzir — subordinado ' +
  'apenas à Metodologia Pedagógica definida para o curso.';

const pesquisaWebSkill = ({ nome, nivel, publico, topicos, ementa, metodologia, bnccContext, modalidade }) => ({
  model: MODEL_RESEARCH,
  web_search_options: { search_context_size: 'medium' },
  system:
    'Você é especialista em educação tecnológica. Pesquise e sintetize ' +
    'conteúdos relevantes para cursos técnicos. Responda em português. ' +
    'Cite as fontes consultadas.',
  user:
    `Pesquise conteúdos atuais para um curso de formação tecnológica:\n` +
    `Curso: ${nome}\nNível: ${nivel}\nPúblico: ${publico}\n` +
    (modalidade ? `Modalidade: ${modalidade} — considere recursos e práticas compatíveis com essa modalidade na pesquisa.\n` : '') +
    nivelBlock(nivel, 'pesquisa') +
    (ementa ? `Ementa do curso (referência): ${ementa}\n` : '') +
    `Tópicos extras: ${topicos || 'nenhum'}\n\n` +
    `Forneça: principais tópicos do mercado, referências, ferramentas, ` +
    `tendências 2024-2025 e certificações relevantes.` +
    pedagCtxBlock(metodologia, bnccContext)
});

const pesquisaFallbackSkill = ({ nome, nivel, publico, topicos, ementa, metodologia, bnccContext, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em educação tecnológica. Com base no seu conhecimento, ' +
    'sintetize referências, tópicos de mercado e tendências relevantes para cursos ' +
    'técnicos. Responda em português. (Nota: a pesquisa web não está disponível — ' +
    'utilize exclusivamente seu conhecimento para gerar o conteúdo.)',
  user:
    `Sintetize conteúdos relevantes para um curso de formação tecnológica, ' +
    'com base no seu conhecimento sobre o tema:\n` +
    `Curso: ${nome}\nNível: ${nivel}\nPúblico: ${publico}\n` +
    (modalidade ? `Modalidade: ${modalidade} — considere recursos e práticas compatíveis com essa modalidade.\n` : '') +
    nivelBlock(nivel, 'pesquisa') +
    (ementa ? `Ementa do curso (referência): ${ementa}\n` : '') +
    `Tópicos extras: ${topicos || 'nenhum'}\n\n` +
    `Forneça: principais tópicos do mercado, referências bibliográficas recomendadas, ` +
    `ferramentas, tendências atuais e certificações relevantes. ` +
    `Indique claramente que este conteúdo foi gerado sem pesquisa web em tempo real.` +
    pedagCtxBlock(metodologia, bnccContext)
});

const ementaSkill = ({ nome, publico, carga, duracao, nivel, objetivos, metodologia, bnccContext, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional. Escreva ementas de curso ' +
    'objetivas e bem estruturadas. Responda em português, em texto corrido ' +
    '(sem JSON, sem marcações de código).' + NIVEL_PESO_ALTO,
  user:
    `Redija a EMENTA de um curso de formação tecnológica, em até 2 parágrafos, ` +
    `cobrindo: do que trata o curso, a quem se destina e o que o aluno será capaz ` +
    `de fazer ao final.\n\n` +
    `Inicie o documento com um cabeçalho de identificação em linhas curtas ` +
    `(Curso, Carga horária${modalidade ? ', Modalidade' : ''}${nivel ? ', Nível' : ''}), antes dos parágrafos da ementa.\n\n` +
    `Curso: ${nome}\nPúblico-alvo: ${publico}\nCarga horária: ${carga}h\n` +
    `Duração por aula: ${duracao} min\nNível: ${nivel}\n` +
    (modalidade ? `Modalidade: ${modalidade}\n` : '') +
    `Objetivos informados: ${objetivos || 'não especificados'}` +
    nivelBlock(nivel) +
    pedagCtxBlock(metodologia, bnccContext)
});

const planoEnsinoSkill = ({ nome, publico, carga, duracao, nivel, objetivos, ementa, pesquisa, ajustes, metodologia, bnccContext, proporcaoTeoricoPratico, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional para cursos de formação ' +
    'tecnológica. Crie planos de ensino detalhados e coerentes com a ementa ' +
    'do curso. Responda em português.' + NIVEL_PESO_ALTO,
  user:
    `Crie um plano de ensino completo para o curso a seguir, MANTENDO COERÊNCIA ` +
    `TOTAL com a ementa abaixo (não contradiga nem amplie o escopo definido nela):\n\n` +
    `Curso: ${nome}\nPúblico: ${publico}\nCarga horária: ${carga}h\n` +
    `Duração por aula: ${duracao} min\nNível: ${nivel}\n` +
    (modalidade ? `Modalidade: ${modalidade}\n` : '') +
    `Objetivos: ${objetivos || 'não especificados'}\n` +
    (proporcaoTeoricoPratico ? `Proporção teórico/prático: ${proporcaoTeoricoPratico}\n` : '') +
    `Ementa do curso: ${ementa || 'não gerada'}\n` +
    `Referências pesquisadas: ${pesquisa || 'nenhuma'}\n` +
    `Ajustes: ${ajustes || 'nenhum'}\n\n` +
    `Inicie o documento com um cabeçalho de identificação em linhas curtas ` +
    `(Curso, Carga horária${modalidade ? ', Modalidade' : ''}${nivel ? ', Nível' : ''}), antes das seções do plano.\n` +
    `Inclua: ementa, objetivos, conteúdo programático dividido em MÓDULOS bem ` +
    `delimitados (nomeie cada módulo), metodologia, recursos, avaliação e ` +
    `bibliografia. Os módulos listados aqui serão a referência oficial usada nas ` +
    `próximas etapas — não introduza, nesta etapa, temas que fujam da ementa.` +
    nivelBlock(nivel) +
    pedagCtxBlock(metodologia, bnccContext)
});

const planLessonsSkill = ({ nome, carga, duracao, nivel, publico, planoEnsino, numAulas, correcao, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional para cursos de formação ' +
    'tecnológica. Responda apenas com JSON válido, sem texto adicional.',
  user:
    (correcao
      ? `IMPORTANTE: sua resposta anterior continha ${correcao} aula(s), mas o número ` +
        `exigido é exatamente ${numAulas}. Ajuste cuidadosamente a divisão do conteúdo ` +
        `para atingir exatamente ${numAulas} aulas desta vez.\n\n`
      : '') +
    `Com base EXCLUSIVAMENTE no plano de ensino abaixo, divida o curso em ` +
    `exatamente ${numAulas} aulas que, juntas, cubram toda a carga horária e ` +
    `sigam a ordem dos módulos definidos no plano de ensino.\n\n` +
    `Curso: ${nome}\nCarga horária total: ${carga}h\nDuração por aula: ${duracao} min\n` +
    `Nível: ${nivel}\nPúblico: ${publico}\n` +
    (modalidade ? `Modalidade: ${modalidade}\n` : '') +
    nivelBlock(nivel) + `\n\n` +
    `Plano de ensino (referência oficial — use SOMENTE os módulos e tópicos ` +
    `listados aqui; não introduza temas que não constem dele):\n${planoEnsino}\n\n` +
    `Responda SOMENTE com um JSON no formato exato:\n` +
    `{"aulas": [{"titulo": "string", "modulo": "nome do módulo do plano de ensino ` +
    `ao qual esta aula pertence", "objetivos": "objetivos de aprendizagem desta ` +
    `aula, separados por ;"}]}\n` +
    `O array "aulas" deve conter exatamente ${numAulas} itens, em ordem lógica de ` +
    `progressão pedagógica e alinhados, em sequência, aos módulos do plano de ensino. ` +
    `O campo "modulo" é obrigatório e deve corresponder a um módulo realmente ` +
    `existente no plano de ensino (permite auditar a aderência ao currículo).`
});

// Estrutura o conteúdo já gerado de uma aula em slides — usada pela Etapa 8
// (Geração de Slides), que só reorganiza/resume o que já existe, sem gerar
// conteúdo pedagógico novo. Também decide, por slide, se uma imagem ajuda —
// no mesmo call, para não divergir da segmentação e não gastar uma chamada extra.
const slidesSkill = ({ nomeCurso, aula, nivel }) => ({
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
    `Para cada slide, decida também se uma imagem de apoio ajudaria a compreensão: ` +
    `conceitos concretos, processos, ferramentas ou comparações se beneficiam de ` +
    `ilustração; definições abstratas ou listas de termos geralmente não. Como ` +
    `orientação (não regra fixa), a maioria das aulas deve ter entre 3 e 6 slides ` +
    `ilustrados — nem toda aula precisa do máximo, a quantidade deve refletir quais ` +
    `tópicos realmente se beneficiam de imagem. Quando decidir por uma imagem, ` +
    `descreva SOMENTE a cena em inglês, sem palavras de estilo (nada de "cartoon", ` +
    `"flat illustration", cores, etc. — isso é definido à parte); quando não, use null.\n\n` +
    `Curso: ${nomeCurso}\nAula: ${aula.titulo}\nMódulo: ${aula.modulo || 'não especificado'}\n` +
    (nivel ? `Nível do curso: ${nivel} — adeque a densidade de informação por slide e o vocabulário a esse nível.\n` : '') +
    `Objetivos: ${aula.objetivos || 'não especificados'}` +
    nivelBlock(nivel) + `\n\n` +
    `Conteúdo completo da aula:\n${aula.texto}\n\n` +
    `Responda SOMENTE com um JSON no formato exato:\n` +
    `{"slides": [{"titulo": "string", "bullets": ["string", ...], ` +
    `"imagem": {"promptCena": "string em inglês, só a cena"} | null}]}`
});

// Propõe um menu de estilos visuais coerentes com o perfil do curso, para o
// usuário escolher antes da geração de imagens da Etapa 8. Cada opção traz
// título/descrição em português (para o usuário) e um prompt de estilo em
// inglês (para o gerador de imagens) — não inclui restrições técnicas de
// composição/ausência de texto, isso é sempre aplicado à parte (IMAGE_LAYOUT_CONSTRAINTS).
const ARQUETIPOS_ESTILO_VISUAL =
  'playful/cartoon, dynamic/modern, Pixar-style 3D animated, minimalist/geometric, ' +
  'corporate/muted, watercolor/handcrafted';

const estiloVisualSkill = ({ nome, publico, nivel, objetivos, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é diretor de arte especializado em material didático. Proponha um menu ' +
    'de estilos visuais para ilustrações de um curso, coerentes com o público-alvo, ' +
    'faixa etária e tipo de curso informados. Use como banco de inspiração (não uma ' +
    `lista fechada) arquétipos de estilo nomeados e reconhecíveis como: ${ARQUETIPOS_ESTILO_VISUAL}, ` +
    'ou outros equivalentes. Escolha e adapte de 3 a 5 desses arquétipos (ou combinações ' +
    'coerentes entre dois deles) ao perfil específico deste curso, variando de mais ' +
    'lúdico/colorido a mais sóbrio/corporativo conforme fizer sentido — o título de cada ' +
    'opção deve refletir um arquétipo reconhecível, nunca uma categoria genérica inventada ' +
    'sem referência conhecida. Responda apenas com JSON válido, sem texto adicional.',
  user:
    `Curso: ${nome}\nPúblico-alvo: ${publico}\nNível: ${nivel}\nModalidade: ${modalidade}\n` +
    `Objetivos: ${objetivos}\n` +
    nivelBlock(nivel) + `\n\n` +
    `Proponha de 3 a 5 estilos visuais distintos, ancorados em arquétipos nomeados e ` +
    `coerentes com este perfil de curso. Para cada um, dê:\n` +
    `- um título curto em português que nomeie o arquétipo (ex.: "Lúdico e Colorido", ` +
    `"Estilo Pixar 3D", "Minimalista Geométrico")\n` +
    `- uma descrição de 1-2 frases em português explicando o estilo e por que ` +
    `combina com este curso\n` +
    `- um prompt de estilo em inglês pronto para um gerador de imagens (técnica ` +
    `de ilustração, paleta de cores, tom geral) — sem mencionar composição ou ` +
    `ausência de texto, isso é tratado à parte\n\n` +
    `Responda SOMENTE com um JSON no formato exato:\n` +
    `{"estilos": [{"id": "string-slug", "titulo": "string", "descricao": "string", ` +
    `"housePrompt": "string em inglês"}]}`
});

// Restrições técnicas de layout sempre aplicadas a toda imagem gerada,
// independente do estilo estético escolhido pelo usuário — a caixa de imagem
// no pptx é quadrada (buildPptx) e não pode ter texto embutido pela própria imagem.
const IMAGE_LAYOUT_CONSTRAINTS =
  'Centered composition within a square frame, subject fully visible with generous margin on ' +
  'all sides (the image will sit in a square box beside text, not full-bleed). No text, letters, ' +
  'numbers, or logos anywhere in the image. No watermarks, no borders.';
const MODEL_IMAGE = 'gpt-image-1.5';
const IMAGE_QUALITY = 'medium';

// Gera o roteiro de vídeo com avatar de uma aula (Etapa 9) a partir do prompt já
// montado (template PromptRoteiro.docx preenchido) e revisado/aprovado pelo
// usuário — diferente das demais skills, o corpo principal do "user" já vem
// pronto, a skill só envelopa com um "system" apropriado e anexa o contexto
// pedagógico ao final, como em todas as outras skills geradoras.
const roteiroSkill = ({ promptPreenchido, metodologia, bnccContext }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é roteirista especializado em vídeos educacionais com avatar digital. ' +
    'Siga rigorosamente a estrutura, as regras de blocos e o formato pedido no ' +
    'prompt do usuário, sem adicionar seções fora do solicitado. Responda em português.',
  user: promptPreenchido + pedagCtxBlock(metodologia, bnccContext)
});

const planoAulaSkill = ({ nome, duracao, nivel, publico, aula, index, total, ementa, planoEnsino, lessonSummaries, observacoes, metodologia, bnccContext, proporcaoTeoricoPratico, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional. Crie planos de aula ' +
    'detalhados, engajantes e que respeitem rigorosamente o escopo de cada ' +
    'aula dentro da sequência do curso. Responda em português.' + NIVEL_PESO_ALTO,
  user:
    `Crie um plano de aula detalhado para:\n` +
    `Curso: ${nome}\nAula ${index + 1} de ${total}: ${aula.titulo}\n` +
    `Módulo do plano de ensino: ${aula.modulo || 'não especificado'}\n` +
    `Duração: ${duracao} min\nNível: ${nivel}\nPúblico: ${publico}\n` +
    (modalidade ? `Modalidade: ${modalidade}\n` : '') +
    `Objetivos desta aula: ${aula.objetivos || 'não especificados'}\n\n` +
    `Ementa do curso: ${ementa || 'não gerada'}\n\n` +
    `Plano de ensino (referência oficial — completo):\n${planoEnsino || 'não gerado'}\n\n` +
    `Mapa das demais aulas do curso (apenas título e objetivos — use só para se ` +
    `situar na sequência, NÃO repita o que já foi ou será coberto):\n${lessonSummaries || 'nenhuma outra aula'}\n\n` +
    `Observações complementares: ${observacoes || 'nenhuma'}\n\n` +
    `IMPORTANTE — limites de escopo: aborde ESTRITAMENTE os objetivos desta aula ` +
    `(${aula.titulo}). Mesmo que pareça pedagogicamente natural, NÃO introduza ` +
    `conceitos reservados a outras aulas listadas no mapa acima — eles serão ` +
    `tratados em seu devido momento.\n\n` +
    (proporcaoTeoricoPratico ? `Proporção teórico/prático do curso: ${proporcaoTeoricoPratico} — distribua as atividades desta aula respeitando essa proporção.\n\n` : '') +
    `Inicie o documento com um cabeçalho de identificação em linhas curtas ` +
    `(Curso, Aula, Duração${modalidade ? ', Modalidade' : ''}${nivel ? ', Nível' : ''}), antes da sequência didática.\n` +
    `Inclua: objetivos, pré-requisitos, sequência didática com tempos ` +
    `(abertura/desenvolvimento/encerramento), atividades, recursos e avaliação.` +
    nivelBlock(nivel) +
    pedagCtxBlock(metodologia, bnccContext)
});

const conteudoSkill = ({ nome, duracao, nivel, publico, aula, index, total, ementa, planoAulaTrecho, lessonSummaries, metodologia, bnccContext, proporcaoTeoricoPratico, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é um especialista técnico e educador, com profundo domínio do ' +
    'conteúdo da área. Produza material técnico robusto, preciso e ' +
    'aprofundado — referência de estudo para o instrutor, não um resumo ' +
    'superficial. Respeite rigorosamente o escopo da aula. Responda em português.' + NIVEL_PESO_ALTO,
  user:
    `Analise cuidadosamente os objetivos de aprendizagem desta aula e desenvolva ` +
    `um conteúdo técnico robusto e aprofundado, que sirva de material de apoio e ` +
    `consulta para o instrutor se preparar e embasar suas explicações:\n\n` +
    `Curso: ${nome}\nAula ${index + 1} de ${total}: ${aula.titulo}\n` +
    `Módulo do plano de ensino: ${aula.modulo || 'não especificado'}\n` +
    `Duração: ${duracao} min\nNível: ${nivel}\nPúblico: ${publico}\n` +
    (modalidade ? `Modalidade: ${modalidade}\n` : '') +
    `Objetivos de aprendizagem desta aula: ${aula.objetivos || 'não especificados'}\n\n` +
    `Ementa do curso: ${ementa || 'não gerada'}\n\n` +
    `Plano de aula desta aula (referência — trecho específico desta aula):\n${planoAulaTrecho || 'não disponível'}\n\n` +
    `Mapa das demais aulas do curso (apenas título e objetivos — para você se ` +
    `situar na sequência e EVITAR DUPLICAÇÃO; temas das aulas anteriores já foram ` +
    `cobertos e não devem ser reexplicados do zero, e temas das aulas seguintes ` +
    `ainda não devem ser antecipados):\n${lessonSummaries || 'nenhuma outra aula'}\n\n` +
    `IMPORTANTE — limites de escopo: aborde ESTRITAMENTE os objetivos desta aula. ` +
    `Não reintroduza conceitos já cobertos em aulas anteriores nem antecipe ` +
    `conceitos reservados a aulas futuras (consulte o mapa acima).\n\n` +
    (proporcaoTeoricoPratico ? `Proporção teórico/prático: ${proporcaoTeoricoPratico} — sinalize claramente no conteúdo quais seções são teóricas e quais são práticas.\n\n` : '') +
    `Para CADA objetivo listado, produza individualmente: fundamentação técnica ` +
    `aprofundada do conceito (definições, princípios de funcionamento, terminologia ` +
    `correta), exemplos práticos e analogias que facilitem o ensino, casos reais do ` +
    `mercado, erros comuns e pontos de atenção, e uma síntese consolidando o que o ` +
    `instrutor deve garantir que os alunos compreendam ao final.` +
    nivelBlock(nivel) +
    pedagCtxBlock(metodologia, bnccContext)
});

// Analisa a qualidade de uma aula individualmente comparando com os documentos
// de referência do curso. Usa Jaccard como reporte e inclui espaço para revisor.
const revisaoQualidadeSkill = ({ config, ementa, planoEnsino, planoAulaTrecho, aulaIndex, aulaTitulo, aulaObjetivos, aulaConteudo, sobreposicoes, metodologia, bnccContext }) => {
  const sobreposicoesStr = sobreposicoes && sobreposicoes.length > 0
    ? sobreposicoes.map(s => `- Aula ${s.indice}: ${s.titulo} (similaridade: ${s.similaridade}%)`).join('\n')
    : 'Nenhuma sobreposição significativa detectada.';

  return {
    model: MODEL_ECONOMY,
    system:
      'Você é um revisor pedagógico sênior especializado em design instrucional. ' +
      'Analise criticamente o conteúdo de cada aula comparando-o com os documentos ' +
      'de referência do curso. Seja preciso e objetivo. Responda em português.',
    user:
      `Analise o conteúdo da Aula ${aulaIndex + 1} do curso "${config?.nome || '?'}" e produza ` +
      `uma revisão de qualidade estruturada nas seções abaixo.\n\n` +
      `## Dados da Aula\n` +
      `Título: ${aulaTitulo}\nObjetivos: ${aulaObjetivos || 'não especificados'}\n` +
      (config?.modalidade ? `Modalidade do curso: ${config.modalidade}\n` : '') +
      (config?.nivel ? `Nível declarado do curso: ${config.nivel}\n` : '') + `\n` +
      `## Plano de Aula desta Aula (referência)\n${planoAulaTrecho || 'não disponível'}\n\n` +
      `## Plano de Ensino do Curso (referência)\n${planoEnsino || 'não disponível'}\n\n` +
      `## Ementa do Curso (referência)\n${ementa || 'não gerada'}\n\n` +
      `## Conteúdo Gerado da Aula\n${aulaConteudo}\n\n` +
      `## Sobreposições Detectadas (Jaccard ≥ 55%)\n${sobreposicoesStr}\n` +
      (bnccContext ? `\n${bnccContext}\n` : '') +
      `\nProduza a revisão com EXATAMENTE as seguintes seções:\n\n` +
      `### Compatibilidade com o Plano de Aula\n` +
      `Avalie se o conteúdo gerado cobre os objetivos definidos no plano de aula. ` +
      `Indique o que está bem coberto, o que está superficial ou ausente.\n\n` +
      `### Compatibilidade com Plano de Ensino e Ementa\n` +
      `Avalie se o conteúdo está alinhado ao módulo e aos objetivos gerais do curso ` +
      `definidos no plano de ensino e na ementa.\n\n` +
      `### Adequação à Faixa Etária e Perfil de Público\n` +
      `Avalie se linguagem, vocabulário, complexidade dos conceitos, exemplos e abordagem didática ` +
      `são adequados ao público "${config?.publico || 'não informado'}". ` +
      `Justifique pedagogicamente e proponha ajustes concretos quando houver inadequação. ` +
      `Se o público não estiver informado, indique que a avaliação não pode ser realizada.\n\n` +
      (config?.modalidade
        ? `### Adequação à Modalidade (${config.modalidade})\n` +
          `Avalie se as atividades, recursos e formas de avaliação propostos no conteúdo são ` +
          `operacionalizáveis na modalidade declarada do curso. Sinalize qualquer atividade ` +
          `incompatível (ex.: dinâmica presencial em curso EaD) e proponha substituição.\n\n`
        : '') +
      (config?.nivel
        ? `### Adequação ao Nível Declarado (${config.nivel})\n` +
          `Avalie se profundidade, vocabulário, pré-requisitos assumidos e complexidade das ` +
          `atividades correspondem ao nível declarado do curso. Sinalize desvios (ex.: jargão ` +
          `sem definição em curso básico; tempo excessivo em fundamentos em curso avançado) ` +
          `e proponha ajustes concretos.\n\n`
        : '') +
      `### Sobreposições Detectadas\n` +
      `Liste as sobreposições informadas acima e avalie se representam um problema pedagógico ` +
      `ou se são legítimas dado o contexto das aulas.\n\n` +
      (bnccContext
        ? `### Alinhamento BNCC\nAvalie quais competências/habilidades BNCC selecionadas são contempladas, ` +
          `quais estão parcialmente cobertas e quais estão ausentes nesta aula.\n\n`
        : '') +
      `### Deficiências e Melhorias Sugeridas\n` +
      `Liste as principais deficiências identificadas e proponha melhorias concretas e objetivas.\n\n` +
      `### Nota de Qualidade\n` +
      `Avalie separadamente CADA um dos 5 critérios abaixo, em escala de 0 a 10, com uma frase ` +
      `curta de justificativa por critério. Responda com uma linha isolada por critério, no ` +
      `formato EXATO "Nome do Critério: N/10" (ex.: "Aderência ao Plano de Aula: 8/10"), ` +
      `podendo incluir a justificativa na mesma linha ou logo abaixo — a nota SEMPRE no formato ` +
      `"N/10":\n\n` +
      `- Aderência ao Plano de Aula: 0-10\n` +
      `- Aderência ao Plano de Ensino e Ementa: 0-10\n` +
      `- Adequação a Nível/Público/Modalidade: 0-10\n` +
      `- Qualidade Didática: 0-10\n` +
      `- Clareza e Estrutura: 0-10\n\n` +
      `NÃO calcule nem informe uma nota final única — o sistema calcula a nota consolidada a ` +
      `partir dos 5 critérios acima.\n\n`+
      `### Resumo de Melhorias Propostas\n` +
      `Liste em bullets curtos, UM POR LINHA, cada melhoria concreta proposta nesta revisão, ` +
      `contendo apenas a ação a executar, sem prosa nem justificativa. REGRA DE PRIORIZAÇÃO ` +
      `(nivelamento): derive as melhorias EXCLUSIVAMENTE do(s) 1-2 critério(s) com MENOR nota ` +
      `na sua Nota de Qualidade acima — critérios que já estão altos não geram melhoria aqui ` +
      `(elevar um critério baixo vale mais que polir um critério já bom). Prefixe CADA melhoria ` +
      `com o critério-alvo entre colchetes, no formato exato ` +
      `"[Nome do Critério] ação a executar" (ex.: "[Adequação a Nível/Público/Modalidade] ` +
      `Reescrever a definição de edição avançada com um exemplo concreto"). ` +
      `Se TODOS os 5 critérios estiverem com nota 9 ou 10, escreva apenas "Nenhuma".\n\n` +
      `### Observações do Revisor\n`
  };
};

// Aplica melhorias a uma aula — usa gpt-4o-mini (sem busca web).
// `melhorias` (lista de itens da seção estruturada "Melhorias a serem Aplicadas")
// tem precedência sobre `observacoesRevisor` (texto livre do modo legado) e
// habilita a rastreabilidade numerada em "### Melhorias Aplicadas".
//
// Historicamente usava gpt-4o-search-preview (busca web); trocado para
// gpt-4o-mini por dois motivos concretos: (1) teste empírico mostrou que o
// search-preview não é mais confiável que o mini nesta tarefa — ambos
// declaram melhorias como "aplicadas" sem que o texto realmente mude (ver
// change verificacao-mecanica-melhorias, que cobre os dois); (2) o teto de
// tokens-por-minuto da conta para o search-preview é baixo o suficiente para
// que uma única chamada com conteúdo integral de aula + metodologia + BNCC +
// melhorias já estoure o limite (HTTP 429 "Request too large"), sem que
// nenhuma quantidade de retry resolva — é um problema de tamanho da
// requisição, não de frequência. O mini tem teto de TPM muito mais alto por
// padrão, mesmo em contas básicas, e é mais barato.
//
// Pede PATCH POR SEÇÃO (<<<SECAO: título>>>...<<<FIM_SECAO>>>), não a reescrita
// integral da aula: conteudoSkill não usa um vocabulário fixo de seções (varia
// nível de heading e organização por objetivo entre aulas), então o título é
// copiado literalmente do original em vez de depender de um heading Markdown
// previsível. Isso reduz drasticamente o volume de saída necessário — aulas
// densas (Fundamentação Técnica + Exemplos + Erros Comuns + Atividade Prática)
// facilmente excediam o teto de tokens quando a resposta precisava reproduzir
// a aula inteira. server.js (mergeSecoesConteudo) funde o patch no texto
// original; resposta sem nenhum "<<<SECAO:" é tratada como reescrita integral
// (fallback, mesmo comportamento de antes desta mudança).
const aplicarMelhoriasSkill = ({ config, aulaIndex, aulaTitulo, aulaObjetivos, conteudoAtual, observacoesRevisor, melhorias, metodologia, bnccContext }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é um especialista técnico e educador sênior. Revise e melhore o ' +
    'conteúdo didático de uma aula aplicando as melhorias indicadas. Responda em português.',
  user:
    `Revise e melhore o conteúdo técnico da Aula ${aulaIndex + 1} do curso "${config?.nome || '?'}", ` +
    `aplicando as melhorias indicadas pelo revisor humano.\n\n` +
    `## Dados da Aula\n` +
    `Título: ${aulaTitulo}\nObjetivos: ${aulaObjetivos || 'não especificados'}\n` +
    (config?.modalidade
      ? `Modalidade do curso: ${config.modalidade} — mantenha as atividades e recursos do ` +
        `conteúdo melhorado compatíveis com essa modalidade.\n`
      : '') + `\n` +
    `## Observações e Melhorias Indicadas\n` +
    (Array.isArray(melhorias) && melhorias.length
      ? melhorias.map((m, n) => `${n + 1}. ${m}`).join('\n')
      : (observacoesRevisor || 'Nenhuma observação específica. Melhore o conteúdo com base em boas práticas de ensino.')) + `\n\n` +
    `## Conteúdo Atual da Aula\n${conteudoAtual}\n\n` +
    `FORMATO DE RESPOSTA — PATCH POR SEÇÃO (MUITO IMPORTANTE):\n` +
    `NÃO reescreva a aula inteira. Produza APENAS as seções que precisam mudar para ` +
    `aplicar as melhorias indicadas, cada uma delimitada exatamente assim:\n\n` +
    `<<<SECAO: título da seção>>>\n` +
    `(conteúdo revisado completo desta seção, pronto para substituir a seção original)\n` +
    `<<<FIM_SECAO>>>\n\n` +
    `Regras do patch:\n` +
    `1. Se a seção JÁ EXISTE no "Conteúdo Atual da Aula" acima, copie o título EXATAMENTE ` +
    `como está escrito lá (mesma grafia, sem adicionar ou remover palavras) — é assim que o ` +
    `sistema localiza e substitui a seção certa.\n` +
    `2. Se a melhoria exige conteúdo novo que não existe em nenhuma seção atual, use um título ` +
    `novo e descritivo — será acrescentado à aula.\n` +
    `3. Produza um bloco <<<SECAO:>>> para CADA seção afetada; seções não mencionadas ` +
    `permanecem como estão e NÃO devem ser reproduzidas.\n` +
    `4. Só reescreva a aula INTEIRA, sem usar o formato de blocos acima, se a melhoria ` +
    `pedida genuinamente exigir refazer o texto todo (isso é exceção, não a regra).\n` +
    `5. Se uma melhoria começar com um critério entre colchetes (ex.: "[Qualidade Didática] ..."), ` +
    `esse é o critério de qualidade que a melhoria visa elevar: concentre as mudanças ` +
    `EXCLUSIVAMENTE nas seções do conteúdo relacionadas a esse critério e NÃO toque seções ` +
    `que já atendem bem os demais critérios. Melhoria sem colchetes segue as regras acima ` +
    `normalmente.` +
    nivelBlock(config?.nivel) +
    pedagCtxBlock(metodologia, bnccContext) +
    `\n\nAo final da resposta (depois do(s) bloco(s) <<<SECAO:>>>, fora deles), adicione ` +
    `obrigatoriamente a seguinte seção:\n\n` +
    `### Melhorias Aplicadas\n` +
    (Array.isArray(melhorias) && melhorias.length
      ? `Referencie CADA melhoria da lista numerada acima PELO NÚMERO, uma por linha, no ` +
        `formato exato "N. <ação tomada>" ou "N. Não aplicado: <motivo em uma frase>". ` +
        `Não omita nenhum número da lista.`
      : `Liste em bullets curtos cada melhoria aplicada. Um bullet por melhoria. ` +
        `Não inclua texto explicativo — apenas a melhoria em si. ` +
        `Se uma observação não foi aplicada, inclua um bullet indicando "Não aplicado: <motivo em uma frase>".`)
});

// Julgamento pareado original × candidato — gate de aceite do ciclo de
// melhorias (ver capability quality-scoring). Compara as duas versões da
// aula NO MESMO PROMPT, para que o viés de calibração do LLM seja
// compartilhado pelos dois julgamentos e o que sobre seja o delta real —
// comparar dois scores de chamadas separadas (uma antes, uma depois) é
// exatamente o padrão que se mostrou pouco confiável antes desta mudança.
// Machine-only: sem prosa, JSON estrito, existe só para alimentar o gate.
const scoreAulaSkill = ({ aulaTitulo, aulaObjetivos, textoOriginal, textoCandidato, planoAulaTrecho, ementa, planoEnsino, nivel, publico, modalidade }) => ({
  model: MODEL_ECONOMY,
  response_format: { type: 'json_object' },
  system:
    'Você é um avaliador pedagógico técnico. Compare duas versões do conteúdo de uma ' +
    'aula (original e candidata) nos mesmos 5 critérios, de forma objetiva e consistente ' +
    'entre as duas. Responda APENAS com JSON válido, sem texto adicional.',
  user:
    `Avalie as duas versões abaixo da Aula "${aulaTitulo}" nos mesmos 5 critérios, cada um ` +
    `em escala de 0 a 10. Seja consistente: se um trecho é igual nas duas versões, atribua ` +
    `a mesma nota para esse aspecto nas duas.\n\n` +
    `## Referências\n` +
    `Objetivos da aula: ${aulaObjetivos || 'não especificados'}\n` +
    `Trecho do Plano de Aula: ${planoAulaTrecho || 'não disponível'}\n` +
    `Ementa (resumo): ${ementa || 'não disponível'}\n` +
    `Plano de Ensino (resumo): ${planoEnsino || 'não disponível'}\n` +
    `Nível: ${nivel || 'não informado'} | Público: ${publico || 'não informado'} | ` +
    `Modalidade: ${modalidade || 'não informada'}\n\n` +
    `## Versão ORIGINAL\n${textoOriginal}\n\n` +
    `## Versão CANDIDATA (revisada)\n${textoCandidato}\n\n` +
    `Critérios (0 a 10 cada):\n` +
    `1. planoAula — aderência aos objetivos e à sequência do plano de aula\n` +
    `2. planoEnsinoEmenta — aderência ao escopo do módulo, plano de ensino e ementa\n` +
    `3. nivelPublicoModalidade — adequação a nível, público e modalidade declarados\n` +
    `4. qualidadeDidatica — fundamentação, exemplos, erros comuns, síntese\n` +
    `5. clarezaEstrutura — organização, progressão, ausência de redundância\n\n` +
    `Responda SOMENTE com um JSON no formato exato:\n` +
    `{"original": {"planoAula": N, "planoEnsinoEmenta": N, "nivelPublicoModalidade": N, ` +
    `"qualidadeDidatica": N, "clarezaEstrutura": N}, "candidato": {"planoAula": N, ` +
    `"planoEnsinoEmenta": N, "nivelPublicoModalidade": N, "qualidadeDidatica": N, ` +
    `"clarezaEstrutura": N}}`
});

// Realinha a seção do plano de aula de UMA aula com o conteúdo melhorado no
// ciclo da Etapa 6. Nunca altera ementa/plano de ensino — extrapolações de
// escopo são sinalizadas em linhas "> ⚠️ ALERTA DE ESCOPO:" que o server
// extrai para o relatório (não ficam no plano persistido).
//
// `melhorias` (mesma lista já passada a aplicarMelhoriasSkill) é opcional e
// cobre o caso em que uma melhoria descreve algo que só existe no PLANO (ex.:
// uma atividade/dinâmica incompatível com a modalidade) — aplicarMelhoriasSkill
// não tem como corrigir isso porque edita só o conteúdo; sem essa lista aqui,
// a melhoria nunca era aplicada em lugar nenhum e a mesma observação reaparecia
// em todo ciclo de revisão seguinte.
const realinharPlanoAulaSkill = ({ nome, duracao, nivel, publico, aula, index, total, planoAulaTrechoAtual, conteudoMelhorado, ementa, planoEnsinoResumo, melhorias, metodologia, bnccContext }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional. Atualize planos de aula para ' +
    'refletir o conteúdo efetivamente ministrado, sem jamais alterar objetivos, ' +
    'título ou escopo da aula. Responda em português.' + NIVEL_PESO_ALTO,
  user:
    `O conteúdo da aula abaixo foi melhorado por um ciclo de revisão e a seção ` +
    `correspondente do plano de aula ficou desatualizada. Atualize essa seção para ` +
    `refletir o conteúdo melhorado — atividades, recursos, exemplos e sequência ` +
    `didática com tempos — MANTENDO o título, os objetivos e o escopo originais ` +
    `da aula e a mesma estrutura de seções do plano atual.\n\n` +
    `Curso: ${nome}\nAula ${index + 1} de ${total}: ${aula.titulo}\n` +
    `Duração: ${duracao} min\nNível: ${nivel}\nPúblico: ${publico}\n` +
    `Objetivos (IMUTÁVEIS): ${aula.objetivos || 'não especificados'}\n\n` +
    `## Seção atual do plano de aula (base — mantenha a estrutura)\n` +
    `${planoAulaTrechoAtual || 'não disponível'}\n\n` +
    `## Conteúdo melhorado da aula (referência do que mudou)\n${conteudoMelhorado}\n\n` +
    (Array.isArray(melhorias) && melhorias.length
      ? `## Melhorias pedidas pelo revisor para esta aula\n` +
        melhorias.map((m, n) => `${n + 1}. ${m}`).join('\n') + `\n` +
        `IMPORTANTE: algumas dessas melhorias podem descrever uma atividade, dinâmica ou recurso ` +
        `que existe NESTA SEÇÃO DO PLANO (não necessariamente no conteúdo da aula) — por exemplo, ` +
        `uma dinâmica presencial incompatível com a modalidade do curso. Se identificar isso, ` +
        `corrija diretamente a atividade na seção do plano, mesmo que o conteúdo melhorado acima ` +
        `não mencione essa mudança.\n\n`
      : '') +
    `## Escopo oficial do curso (você NÃO PODE ampliá-lo)\n` +
    `Ementa: ${ementa || 'não disponível'}\n` +
    `Plano de ensino (resumo): ${planoEnsinoResumo || 'não disponível'}\n\n` +
    `REGRAS DE SAÍDA:\n` +
    `1. Responda SOMENTE com o corpo atualizado da seção, SEM a linha de título ` +
    `"# Aula ${index + 1}: ..." (ela é recomposta pelo sistema).\n` +
    `2. Se o conteúdo melhorado abordar tema que NÃO conste da ementa/plano de ensino ` +
    `acima, NÃO incorpore esse tema ao plano e acrescente ao FINAL uma linha no formato ` +
    `exato: "> ⚠️ ALERTA DE ESCOPO: <tema> não consta da ementa/plano de ensino".\n` +
    `3. Não invente atividades sem relação com o conteúdo melhorado ou com as melhorias pedidas.` +
    nivelBlock(nivel) +
    pedagCtxBlock(metodologia, bnccContext)
});

// ── Skills novas — Base Pedagógica e PPC ──────────────────────────────────────

const metodologiaSkill = ({ nome, publico, carga, nivel, proporcaoTeoricoPratico, modalidade }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é um especialista em design instrucional e pedagogia, com profundo ' +
    'conhecimento em metodologias de ensino-aprendizagem. Analise o perfil do ' +
    'curso e recomende a metodologia pedagógica mais adequada, fundamentando ' +
    'sua escolha em princípios didáticos reconhecidos. Responda em português.',
  user:
    `Analise o perfil do curso abaixo e recomende a metodologia pedagógica mais ` +
    `adequada, considerando as seguintes opções: Aprendizagem Baseada em Problemas ` +
    `(ABP), Instrução Direta, Sala de Aula Invertida, Andragogia, Aprendizagem por ` +
    `Projetos, Ensino Híbrido. Use a Taxonomia de Bloom como estrutura de objetivos.\n\n` +
    `Curso: ${nome || 'não informado'}\n` +
    `Público-alvo: ${publico || 'não informado'}\n` +
    `Carga horária: ${carga || '?'}h\n` +
    `Nível: ${nivel || 'não informado'}\n` +
    (modalidade
      ? `Modalidade: ${modalidade} — a metodologia recomendada DEVE ser compatível e ` +
        `operacionalizável nessa modalidade (não recomende dinâmicas exclusivamente ` +
        `presenciais para EaD, nem estratégias dependentes de estudo remoto para presencial).\n`
      : '') +
    `Proporção teórico/prático: ${proporcaoTeoricoPratico || 'não informada'}\n` +
    nivelBlock(nivel) + `\n\n` +
    `Responda com:\n` +
    `1. **Metodologia recomendada** (nome)\n` +
    `2. **Justificativa pedagógica** (por que essa metodologia se encaixa neste perfil)\n` +
    `3. **Como aplicar** (3 a 5 orientações práticas para o professor)\n` +
    `4. **Nível de Bloom predominante** esperado ao final do curso\n` +
    `5. **Atenção especial** (1 ponto crítico dado o perfil do público e a proporção teórico/prático)`
});

const qualidadeSkill = ({ config, ementa, planoEnsino, planoAula, resumosAulas, metodologia, bncc }) => {
  const bnccSection = bncc?.ativo && bncc.itens?.length
    ? `\n\n## Competências/Habilidades BNCC Selecionadas\n` +
      bncc.itens.map(i => `- ${i.codigo ? `[${i.codigo}] ` : ''}${i.descricao}`).join('\n')
    : '';
  return {
    model: MODEL_ECONOMY,
    system:
      'Você é um especialista sênior em design instrucional, pedagogia e avaliação ' +
      'de cursos. Sua função é analisar criticamente a qualidade pedagógica de ' +
      'materiais didáticos e emitir pareceres fundamentados em princípios didáticos ' +
      'reconhecidos. Você não apenas descreve problemas — você os justifica ' +
      'pedagogicamente e propõe melhorias concretas. Responda em português.',
    user:
      `Emita um Relatório Técnico-Pedagógico completo sobre o curso "${config?.nome || 'não informado'}".\n\n` +
      `## Perfil do Curso\n` +
      `Público: ${config?.publico || '?'} | Nível: ${config?.nivel || '?'} | ` +
      `Carga: ${config?.carga || '?'}h | Modalidade: ${config?.modalidade || '?'}\n` +
      `Proporção teórico/prático: ${config?.proporcaoTeoricoPratico || 'não informada'}\n` +
      (metodologia ? `\n## Metodologia Pedagógica Definida\n${metodologia}\n` : '') +
      bnccSection +
      `\n\n## Ementa\n${ementa || 'não gerada'}\n\n` +
      `## Plano de Ensino\n${planoEnsino || 'não gerado'}\n\n` +
      `## Plano de Aula\n${planoAula || 'não gerado'}\n\n` +
      `## Resumo do Conteúdo por Aula\n${resumosAulas || 'não gerado'}\n\n` +
      `Produza o relatório com EXATAMENTE as seguintes seções:\n\n` +
      `### 1. Parecer Geral\n` +
      `Síntese executiva (3 a 5 parágrafos) sobre a qualidade pedagógica geral do material.\n\n` +
      (bncc?.ativo ? `### 2. Alinhamento BNCC\nAvalie cada competência/habilidade selecionada: contemplada, parcialmente contemplada ou ausente. Justifique.\n\n` : '') +
      `### ${bncc?.ativo ? '3' : '2'}. Aderência à Metodologia Pedagógica\n` +
      `Boas práticas observadas e lacunas identificadas. Fundamente em princípios didáticos.\n\n` +
      `### ${bncc?.ativo ? '4' : '3'}. Coerência entre Etapas\n` +
      `Analise a relação lógica: ementa → plano de ensino → planos de aula → conteúdo das aulas.\n\n` +
      `### ${bncc?.ativo ? '5' : '4'}. Aderência à Carga Horária e Proporção Teórico/Prático\n` +
      `Avalie se o volume de conteúdo é compatível com a carga horária e se a proporção é respeitada.\n\n` +
      `### ${bncc?.ativo ? '6' : '5'}. Apontamentos Específicos\n` +
      `Lista de pontos a melhorar, cada um com: localização, problema identificado e fundamentação pedagógica.\n\n` +
      `### ${bncc?.ativo ? '7' : '6'}. Recomendações Priorizadas\n` +
      `Lista ordenada por impacto pedagógico: o que ajustar, em qual etapa e por quê.`
  };
};

const perfilEgressoSkill = ({ config, ementa, planoEnsino }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional para cursos livres. ' +
    'Redija perfis de egresso claros, objetivos e orientados a competências. ' +
    'Responda em português.',
  user:
    `Redija o Perfil do Egresso para o curso abaixo. Descreva o que o aluno ` +
    `será capaz de fazer, que competências terá desenvolvido e que áreas de ` +
    `atuação estarão abertas para ele ao concluir o curso.\n\n` +
    `Curso: ${config?.nome || '?'}\nPúblico: ${config?.publico || '?'}\n` +
    `Nível: ${config?.nivel || '?'}\nCarga: ${config?.carga || '?'}h\n\n` +
    `Ementa: ${ementa || 'não gerada'}\n\n` +
    `Plano de ensino (referência): ${planoEnsino || 'não gerado'}`
});

const competenciasSkill = ({ config, ementa, planoEnsino, bncc }) => {
  const bnccRef = bncc?.ativo && bncc.itens?.length
    ? '\n\nCompetências/Habilidades BNCC selecionadas para este curso:\n' +
      bncc.itens.map(i => `- ${i.codigo ? `[${i.codigo}] ` : ''}${i.descricao}`).join('\n')
    : '';
  return {
    model: MODEL_ECONOMY,
    system:
      'Você é especialista em design instrucional. Liste competências e habilidades ' +
      'de forma clara, estruturada e orientada a resultados de aprendizagem. ' +
      'Responda em português.',
    user:
      `Liste as competências e habilidades que o aluno desenvolverá ao longo do curso.\n\n` +
      `Curso: ${config?.nome || '?'}\nNível: ${config?.nivel || '?'}\n` +
      `Ementa: ${ementa || 'não gerada'}\n` +
      `Plano de ensino: ${planoEnsino || 'não gerado'}` +
      bnccRef +
      `\n\nOrganize em:\n` +
      `1. **Competências Gerais** (atitudes e valores)\n` +
      `2. **Competências Técnicas** (saber fazer)\n` +
      `3. **Habilidades Específicas** (por módulo)\n` +
      (bncc?.ativo ? `4. **Alinhamento BNCC** (como cada item selecionado é desenvolvido no curso)\n` : '')
  };
};

const perfilDocenteSkill = ({ config, ementa }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em gestão de cursos livres. Descreva perfis docentes ' +
    'de forma objetiva e prática. Responda em português.',
  user:
    `Descreva o Perfil do Corpo Docente recomendado para ministrar este curso.\n\n` +
    `Curso: ${config?.nome || '?'}\nPúblico: ${config?.publico || '?'}\n` +
    `Nível: ${config?.nivel || '?'}\nModalidade: ${config?.modalidade || '?'}\n` +
    `Ementa: ${ementa || 'não gerada'}\n\n` +
    `Inclua: formação mínima recomendada, experiência prática exigida, ` +
    `competências pedagógicas necessárias e perfil comportamental desejado.`
});

const infraestruturaSkill = ({ config, conteudo }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em planejamento de cursos livres. Liste recursos e ' +
    'infraestrutura de forma prática e objetiva. Responda em português.',
  user:
    `Liste os recursos e a infraestrutura necessários para ministrar este curso.\n\n` +
    `Curso: ${config?.nome || '?'}\nModalidade: ${config?.modalidade || '?'}\n` +
    `Carga: ${config?.carga || '?'}h\nPúblico: ${config?.publico || '?'}\n` +
    `Proporção teórico/prático: ${config?.proporcaoTeoricoPratico || 'não informada'}\n\n` +
    `Conteúdo do curso (referência): ${conteudo || 'não disponível'}\n\n` +
    `Organize em:\n` +
    `1. **Espaço Físico** (para modalidade presencial/híbrida)\n` +
    `2. **Equipamentos e Hardware**\n` +
    `3. **Software e Ferramentas Digitais**\n` +
    `4. **Material Didático**\n` +
    `5. **Recursos para EaD** (se aplicável à modalidade)`
});

const ppcAssemblySkill = ({ config, ementa, pesquisa, planoEnsino, planoAula, metodologia, bncc, perfilEgresso, competencias, perfilDocente, infraestrutura }) => {
  const bnccSection = bncc?.ativo && bncc.itens?.length
    ? `\nAlinhamento BNCC (${bncc.nivel}): ` +
      bncc.itens.map(i => `${i.codigo || i.titulo || i.descricao?.slice(0, 60)}`).join(', ')
    : 'Não aplicável';
  return {
    model: MODEL_ECONOMY,
    system:
      'Você é especialista em elaboração de Projetos Pedagógicos de Curso (PPC) ' +
      'para cursos livres. Monte documentos formais, bem estruturados e coerentes ' +
      'com as boas práticas institucionais. Responda em português.',
    user:
      `Monte o Projeto Pedagógico de Curso (PPC) completo para curso livre, ` +
      `organizando as informações fornecidas nas seções abaixo. ` +
      `Escreva de forma formal e institucional.\n\n` +
      `## Dados do Curso\n` +
      `Nome: ${config?.nome || '?'}\nModalidade: ${config?.modalidade || '?'}\n` +
      `Carga horária: ${config?.carga || '?'}h | Duração por aula: ${config?.duracao || '?'} min\n` +
      `Nível: ${config?.nivel || '?'} | Público-alvo: ${config?.publico || '?'}\n` +
      `Pré-requisitos: ${config?.preRequisitos || 'Nenhum'}\n` +
      `Proporção teórico/prático: ${config?.proporcaoTeoricoPratico || 'não informada'}\n` +
      `Alinhamento BNCC: ${bnccSection}\n\n` +
      `## Conteúdo Gerado (use para as seções do PPC)\n` +
      `EMENTA: ${ementa || 'não gerada'}\n\n` +
      `JUSTIFICATIVA (baseada na pesquisa de mercado): ${pesquisa || 'não disponível'}\n\n` +
      `ESTRUTURA CURRICULAR: ${planoEnsino || 'não gerado'}\n\n` +
      `METODOLOGIA: ${metodologia || 'não definida'}\n\n` +
      `PERFIL DO EGRESSO: ${perfilEgresso || 'não gerado'}\n\n` +
      `COMPETÊNCIAS E HABILIDADES: ${competencias || 'não geradas'}\n\n` +
      `PERFIL DOCENTE: ${perfilDocente || 'não gerado'}\n\n` +
      `INFRAESTRUTURA: ${infraestrutura || 'não gerada'}\n\n` +
      `Monte o PPC com as seguintes seções numeradas:\n` +
      `1. Identificação do Curso\n2. Apresentação e Justificativa\n` +
      `3. Objetivos (Geral e Específicos)\n4. Perfil do Egresso\n` +
      `5. Competências e Habilidades Desenvolvidas\n6. Estrutura Curricular\n` +
      `7. Ementas por Módulo\n8. Metodologia de Ensino\n` +
      `9. Critérios de Avaliação\n10. Perfil do Corpo Docente\n` +
      `11. Infraestrutura e Recursos\n12. Bibliografia`
  };
};

module.exports = {
  MODEL_RESEARCH,
  MODEL_ECONOMY,
  summarizeLessons,
  MODALIDADE_DIRETRIZES,
  modalidadeBlock,
  NIVEL_DIRETRIZES,
  nivelBlock,
  // Pipeline principal
  pesquisaWebSkill,
  pesquisaFallbackSkill,
  ementaSkill,
  planoEnsinoSkill,
  planLessonsSkill,
  planoAulaSkill,
  conteudoSkill,
  slidesSkill,
  estiloVisualSkill,
  IMAGE_LAYOUT_CONSTRAINTS,
  MODEL_IMAGE,
  IMAGE_QUALITY,
  roteiroSkill,
  // Ciclo de revisão e melhoria (Etapas 5★ e 6)
  revisaoQualidadeSkill,
  aplicarMelhoriasSkill,
  scoreAulaSkill,
  realinharPlanoAulaSkill,
  // Base pedagógica e PPC
  metodologiaSkill,
  qualidadeSkill,
  perfilEgressoSkill,
  competenciasSkill,
  perfilDocenteSkill,
  infraestruturaSkill,
  ppcAssemblySkill
};
