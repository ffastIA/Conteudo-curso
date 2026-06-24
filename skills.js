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

const pesquisaWebSkill = ({ nome, nivel, publico, topicos, ementa, metodologia, bnccContext }) => ({
  model: MODEL_RESEARCH,
  web_search_options: { search_context_size: 'medium' },
  system:
    'Você é especialista em educação tecnológica. Pesquise e sintetize ' +
    'conteúdos relevantes para cursos técnicos. Responda em português. ' +
    'Cite as fontes consultadas.',
  user:
    `Pesquise conteúdos atuais para um curso de formação tecnológica:\n` +
    `Curso: ${nome}\nNível: ${nivel}\nPúblico: ${publico}\n` +
    (ementa ? `Ementa do curso (referência): ${ementa}\n` : '') +
    `Tópicos extras: ${topicos || 'nenhum'}\n\n` +
    `Forneça: principais tópicos do mercado, referências, ferramentas, ` +
    `tendências 2024-2025 e certificações relevantes.` +
    pedagCtxBlock(metodologia, bnccContext)
});

const ementaSkill = ({ nome, publico, carga, duracao, nivel, objetivos, metodologia, bnccContext }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional. Escreva ementas de curso ' +
    'objetivas e bem estruturadas. Responda em português, em texto corrido ' +
    '(sem JSON, sem marcações de código).',
  user:
    `Redija a EMENTA de um curso de formação tecnológica, em até 2 parágrafos, ` +
    `cobrindo: do que trata o curso, a quem se destina e o que o aluno será capaz ` +
    `de fazer ao final.\n\n` +
    `Curso: ${nome}\nPúblico-alvo: ${publico}\nCarga horária: ${carga}h\n` +
    `Duração por aula: ${duracao} min\nNível: ${nivel}\n` +
    `Objetivos informados: ${objetivos || 'não especificados'}` +
    pedagCtxBlock(metodologia, bnccContext)
});

const planoEnsinoSkill = ({ nome, publico, carga, duracao, nivel, objetivos, ementa, pesquisa, ajustes, metodologia, bnccContext, proporcaoTeoricoPratico }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional para cursos de formação ' +
    'tecnológica. Crie planos de ensino detalhados e coerentes com a ementa ' +
    'do curso. Responda em português.',
  user:
    `Crie um plano de ensino completo para o curso a seguir, MANTENDO COERÊNCIA ` +
    `TOTAL com a ementa abaixo (não contradiga nem amplie o escopo definido nela):\n\n` +
    `Curso: ${nome}\nPúblico: ${publico}\nCarga horária: ${carga}h\n` +
    `Duração por aula: ${duracao} min\nNível: ${nivel}\n` +
    `Objetivos: ${objetivos || 'não especificados'}\n` +
    (proporcaoTeoricoPratico ? `Proporção teórico/prático: ${proporcaoTeoricoPratico}\n` : '') +
    `Ementa do curso: ${ementa || 'não gerada'}\n` +
    `Referências pesquisadas: ${pesquisa || 'nenhuma'}\n` +
    `Ajustes: ${ajustes || 'nenhum'}\n\n` +
    `Inclua: ementa, objetivos, conteúdo programático dividido em MÓDULOS bem ` +
    `delimitados (nomeie cada módulo), metodologia, recursos, avaliação e ` +
    `bibliografia. Os módulos listados aqui serão a referência oficial usada nas ` +
    `próximas etapas — não introduza, nesta etapa, temas que fujam da ementa.` +
    pedagCtxBlock(metodologia, bnccContext)
});

const planLessonsSkill = ({ nome, carga, duracao, nivel, publico, planoEnsino, numAulas }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional para cursos de formação ' +
    'tecnológica. Responda apenas com JSON válido, sem texto adicional.',
  user:
    `Com base EXCLUSIVAMENTE no plano de ensino abaixo, divida o curso em ` +
    `exatamente ${numAulas} aulas que, juntas, cubram toda a carga horária e ` +
    `sigam a ordem dos módulos definidos no plano de ensino.\n\n` +
    `Curso: ${nome}\nCarga horária total: ${carga}h\nDuração por aula: ${duracao} min\n` +
    `Nível: ${nivel}\nPúblico: ${publico}\n\n` +
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

const planoAulaSkill = ({ nome, duracao, nivel, publico, aula, index, total, ementa, planoEnsino, lessonSummaries, observacoes, metodologia, bnccContext, proporcaoTeoricoPratico }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é especialista em design instrucional. Crie planos de aula ' +
    'detalhados, engajantes e que respeitem rigorosamente o escopo de cada ' +
    'aula dentro da sequência do curso. Responda em português.',
  user:
    `Crie um plano de aula detalhado para:\n` +
    `Curso: ${nome}\nAula ${index + 1} de ${total}: ${aula.titulo}\n` +
    `Módulo do plano de ensino: ${aula.modulo || 'não especificado'}\n` +
    `Duração: ${duracao} min\nNível: ${nivel}\nPúblico: ${publico}\n` +
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
    `Inclua: objetivos, pré-requisitos, sequência didática com tempos ` +
    `(abertura/desenvolvimento/encerramento), atividades, recursos e avaliação.` +
    pedagCtxBlock(metodologia, bnccContext)
});

const conteudoSkill = ({ nome, duracao, nivel, publico, aula, index, total, ementa, planoAulaTrecho, lessonSummaries, metodologia, bnccContext, proporcaoTeoricoPratico }) => ({
  model: MODEL_ECONOMY,
  system:
    'Você é um especialista técnico e educador, com profundo domínio do ' +
    'conteúdo da área. Produza material técnico robusto, preciso e ' +
    'aprofundado — referência de estudo para o instrutor, não um resumo ' +
    'superficial. Respeite rigorosamente o escopo da aula. Responda em português.',
  user:
    `Analise cuidadosamente os objetivos de aprendizagem desta aula e desenvolva ` +
    `um conteúdo técnico robusto e aprofundado, que sirva de material de apoio e ` +
    `consulta para o instrutor se preparar e embasar suas explicações:\n\n` +
    `Curso: ${nome}\nAula ${index + 1} de ${total}: ${aula.titulo}\n` +
    `Módulo do plano de ensino: ${aula.modulo || 'não especificado'}\n` +
    `Duração: ${duracao} min\nNível: ${nivel}\nPúblico: ${publico}\n` +
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
      `Título: ${aulaTitulo}\nObjetivos: ${aulaObjetivos || 'não especificados'}\n\n` +
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
      `### Sobreposições Detectadas\n` +
      `Liste as sobreposições informadas acima e avalie se representam um problema pedagógico ` +
      `ou se são legítimas dado o contexto das aulas.\n\n` +
      (bnccContext
        ? `### Alinhamento BNCC\nAvalie quais competências/habilidades BNCC selecionadas são contempladas, ` +
          `quais estão parcialmente cobertas e quais estão ausentes nesta aula.\n\n`
        : '') +
      `### Deficiências e Melhorias Sugeridas\n` +
      `Liste as principais deficiências identificadas e proponha melhorias concretas e objetivas.\n\n` +
      `### Observações do Revisor\n`
  };
};

// Aplica melhorias a uma aula com acesso à web — usa gpt-4o-search-preview.
const aplicarMelhoriasSkill = ({ config, aulaIndex, aulaTitulo, aulaObjetivos, conteudoAtual, observacoesRevisor, metodologia, bnccContext }) => ({
  model: MODEL_RESEARCH,
  web_search_options: { search_context_size: 'medium' },
  system:
    'Você é um especialista técnico e educador sênior. Revise e melhore o ' +
    'conteúdo didático de uma aula aplicando as melhorias indicadas e buscando ' +
    'referências atualizadas na web quando necessário. Responda em português.',
  user:
    `Revise e melhore o conteúdo técnico da Aula ${aulaIndex + 1} do curso "${config?.nome || '?'}", ` +
    `aplicando as melhorias indicadas pelo revisor humano e complementando com pesquisa ` +
    `na web quando necessário para enriquecer o conteúdo.\n\n` +
    `## Dados da Aula\n` +
    `Título: ${aulaTitulo}\nObjetivos: ${aulaObjetivos || 'não especificados'}\n\n` +
    `## Observações e Melhorias Indicadas\n` +
    `${observacoesRevisor || 'Nenhuma observação específica. Melhore o conteúdo com base em boas práticas e pesquisa web.'}\n\n` +
    `## Conteúdo Atual da Aula\n${conteudoAtual}\n\n` +
    `Produza a versão melhorada do conteúdo, mantendo a estrutura original onde ` +
    `estiver boa e aplicando as melhorias indicadas. Use a busca na web para ` +
    `complementar com exemplos, referências e informações atualizadas quando pertinente.` +
    pedagCtxBlock(metodologia, bnccContext)
});

// ── Skills novas — Base Pedagógica e PPC ──────────────────────────────────────

const metodologiaSkill = ({ nome, publico, carga, nivel, proporcaoTeoricoPratico }) => ({
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
    `Proporção teórico/prático: ${proporcaoTeoricoPratico || 'não informada'}\n\n` +
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
  // Pipeline principal
  pesquisaWebSkill,
  ementaSkill,
  planoEnsinoSkill,
  planLessonsSkill,
  planoAulaSkill,
  conteudoSkill,
  // Ciclo de revisão e melhoria (Etapas 5★ e 6)
  revisaoQualidadeSkill,
  aplicarMelhoriasSkill,
  // Base pedagógica e PPC
  metodologiaSkill,
  qualidadeSkill,
  perfilEgressoSkill,
  competenciasSkill,
  perfilDocenteSkill,
  infraestruturaSkill,
  ppcAssemblySkill
};
