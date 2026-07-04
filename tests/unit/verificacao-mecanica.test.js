const {
  mergeSecoesConteudo,
  extrairTermosEsperados,
  termoAusente,
  LIMIAR_SECAO_SUSPEITA
} = require('../../server');

// Textos calibrados na investigação real (ver design.md do change
// verificacao-mecanica-melhorias): seção idêntica → 1.000; seção alongada mas
// declarada "resumida" → 0.931; reescrita genuína de controle → 0.431.
const ORIGINAL_CONCEITOS =
  'Antes de explorarmos as ferramentas avançadas, é fundamental relembrar alguns conceitos básicos de edição de vídeo:\n' +
  '- Importação de Mídia: Adicionar vídeos, imagens e áudios ao projeto.\n' +
  '- Corte e Divisão: Remover partes indesejadas ou dividir clipes para reorganização.\n' +
  '- Transições Simples: Aplicar efeitos suaves entre clipes para melhorar o fluxo do vídeo.\n' +
  '- Adição de Texto: Inserir títulos, legendas ou outros textos informativos.\n' +
  '- Ajustes Básicos de Áudio: Controlar o volume e adicionar trilhas sonoras.\n' +
  'Compreender esses fundamentos é essencial para aproveitar plenamente as ferramentas avançadas que serão apresentadas a seguir.';

const AULA_ORIGINAL =
  '# Aula 1: Ferramentas Avançadas do CapCut\n\n' +
  'Revisão dos Conceitos Básicos\n\n' + ORIGINAL_CONCEITOS + '\n\n' +
  'Exemplos Práticos\n\n' +
  'Para ilustrar a aplicação das ferramentas avançadas do CapCut, consideremos os seguintes exemplos:\n' +
  '- Edição Multicâmera: Ao gravar uma entrevista com duas câmeras, utilize a função de edição multicâmera.\n' +
  '- Keyframes: Crie uma animação onde um texto se move da esquerda para a direita na tela.\n' +
  '- Correção de Cor: Ajuste um clipe gravado em ambiente interno para que as cores fiquem mais vibrantes.\n';

describe('mergeSecoesConteudo — suspeitas (similaridade calibrada empiricamente)', () => {
  test('seção substituída IDÊNTICA é sinalizada como suspeita', () => {
    const patch = `<<<SECAO: Revisão dos Conceitos Básicos>>>\n${ORIGINAL_CONCEITOS}\n<<<FIM_SECAO>>>\n`;
    const { suspeitas, substituidas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(substituidas).toEqual(['Revisão dos Conceitos Básicos']);
    expect(suspeitas).toHaveLength(1);
    expect(suspeitas[0].titulo).toBe('Revisão dos Conceitos Básicos');
    expect(suspeitas[0].similaridade).toBeGreaterThanOrEqual(LIMIAR_SECAO_SUSPEITA);
  });

  test('seção alongada mas sem mudança real (caso "resumida" falsa) é sinalizada', () => {
    const alongado =
      'Antes de explorarmos as ferramentas avançadas, é fundamental relembrar alguns conceitos básicos de edição de vídeo que servirão como base para a aplicação das técnicas mais elaboradas:\n' +
      '- Importação de Mídia: Adicionar vídeos, imagens e áudios ao projeto, essencial para iniciar qualquer edição.\n' +
      '- Corte e Divisão: Remover partes indesejadas ou dividir clipes para reorganização, visando um fluxo mais harmônico.\n' +
      '- Transições Simples: Aplicar efeitos suaves entre clipes, como fade in e fade out, melhorando a continuidade visual.\n' +
      '- Adição de Texto: Inserir títulos e legendas, fundamentais para dar contexto e informação ao espectador.\n' +
      '- Ajustes Básicos de Áudio: Controlar o volume e adicionar trilhas sonoras, pois o áudio é crucial para a narrativa do vídeo.\n' +
      'Compreender esses fundamentos é essencial para aproveitar plenamente as ferramentas avançadas que serão apresentadas a seguir, como uma base sólida.';
    const patch = `<<<SECAO: Revisão dos Conceitos Básicos>>>\n${alongado}\n<<<FIM_SECAO>>>\n`;
    const { suspeitas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(suspeitas).toHaveLength(1);
    expect(suspeitas[0].similaridade).toBeGreaterThanOrEqual(LIMIAR_SECAO_SUSPEITA);
  });

  test('reescrita genuína e substancial NÃO é sinalizada', () => {
    const reescrito =
      'Para ilustrar a aplicação das ferramentas avançadas do CapCut, consideremos os seguintes exemplos:\n' +
      '- Keyframes: Imagine que você deseja que um texto se mova da esquerda para a direita na tela.\n' +
      '- Máscaras: Suponha que você queira destacar um objeto específico em uma cena.\n' +
      '- Curva de Velocidade: Para dar ênfase a um momento de ação, aplique uma curva de velocidade.\n';
    const patch = `<<<SECAO: Exemplos Práticos>>>\n${reescrito}\n<<<FIM_SECAO>>>\n`;
    const { suspeitas, substituidas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(substituidas).toEqual(['Exemplos Práticos']);
    expect(suspeitas).toHaveLength(0);
  });

  test('seção NOVA nunca entra em suspeitas, mesmo com texto repetido', () => {
    const patch = `<<<SECAO: Discussão Online>>>\n${ORIGINAL_CONCEITOS}\n<<<FIM_SECAO>>>\n`;
    const { novas, suspeitas } = mergeSecoesConteudo(AULA_ORIGINAL, patch);
    expect(novas).toEqual(['Discussão Online']);
    expect(suspeitas).toEqual([]);
  });

  test('fallback (sem marcadores) retorna suspeitas vazio', () => {
    const { suspeitas } = mergeSecoesConteudo(AULA_ORIGINAL, 'Reescrita integral qualquer.');
    expect(suspeitas).toEqual([]);
  });
});

describe('extrairTermosEsperados', () => {
  test('extrai termo entre aspas', () => {
    expect(extrairTermosEsperados('Substituir o "Círculo de Histórias" por fórum.')).toContain('Círculo de Histórias');
  });

  test('extrai sigla em maiúsculas', () => {
    expect(extrairTermosEsperados('Incorporar competências da BNCC ausentes.')).toContain('BNCC');
  });

  test('extrai os dois quando presentes', () => {
    const termos = extrairTermosEsperados('Adaptar "Círculo de Histórias" alinhado à BNCC.');
    expect(termos).toEqual(expect.arrayContaining(['Círculo de Histórias', 'BNCC']));
  });

  test('melhoria sem termo/sigla retorna lista vazia', () => {
    expect(extrairTermosEsperados('Simplificar a linguagem dos exemplos.')).toEqual([]);
  });
});

describe('termoAusente', () => {
  test('termo presente só no conteúdo não é ausente', () => {
    expect(termoAusente('BNCC', 'Texto com BNCC mencionada.', 'Plano sem o termo.')).toBe(false);
  });

  test('termo presente só no plano não é ausente', () => {
    expect(termoAusente('BNCC', 'Conteúdo sem o termo.', 'Plano com BNCC mencionada.')).toBe(false);
  });

  test('ausente dos dois é ausente', () => {
    expect(termoAusente('BNCC', 'Conteúdo qualquer.', 'Plano qualquer.')).toBe(true);
  });

  test('tolerante a acento e caixa', () => {
    expect(termoAusente('Círculo de Histórias', 'texto menciona circulo de historias em minúsculo', '')).toBe(false);
    expect(termoAusente('bncc', 'Conteúdo com BNCC em maiúsculas.', '')).toBe(false);
  });
});
