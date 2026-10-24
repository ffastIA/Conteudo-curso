'use strict';

// .docx com os elementos Markdown das aulas (change docx-markdown-completo) e
// contrato com a renderização da interface: os dois partem da mesma análise.
jest.mock('openai');

const JSZip = require('jszip');
const { Packer } = require('docx');
const app = require('../../server');
const { renderMarkdown } = require('../../public/markdown');

const CONFIG = { nome: 'Curso de Teste' };

async function xmlDe(conteudo, sites = []) {
  // buildDocx não é exportado: o caminho público é persistStage/export; aqui usamos o mesmo
  // construtor via módulo do servidor.
  const doc = app.buildDocx(CONFIG, 'Conteúdo da Aula', conteudo, sites);
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return {
    documento: await zip.file('word/document.xml').async('string'),
    numeracao: zip.file('word/numbering.xml') ? await zip.file('word/numbering.xml').async('string') : '',
    relacoes: await zip.file('word/_rels/document.xml.rels').async('string')
  };
}

describe('buildDocx com Markdown completo', () => {
  test('lista numerada: itens com numeração, não com marcador', async () => {
    const { documento, numeracao } = await xmlDe('1. passo um\n2. passo dois');
    expect(documento).toContain('passo um');
    expect(documento).toContain('passo dois');
    expect(documento.match(/<w:numPr>/g)).toHaveLength(2);
    expect(numeracao).toContain('w:numFmt w:val="decimal"');
  });

  test('duas listas numeradas separadas recomeçam a contagem (instâncias distintas)', async () => {
    const { documento } = await xmlDe('1. a\n2. b\n\ntexto\n\n1. c\n2. d');
    const ids = [...documento.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map(m => m[1]);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
  });

  test('lista com marcador continua funcionando', async () => {
    const { documento } = await xmlDe('- a\n- b');
    expect(documento.match(/<w:numPr>/g)).toHaveLength(2);
  });

  test('tabela: mesmas células, cabeçalho em negrito', async () => {
    const { documento } = await xmlDe('| Nome | Valor |\n|---|---|\n| alfa | 1 |\n| beta | 2 |');
    expect(documento).toContain('<w:tbl>');
    expect(documento.match(/<w:tr[ >]/g)).toHaveLength(3);
    expect(documento.match(/<w:tc>/g)).toHaveLength(6);
    for (const c of ['Nome', 'Valor', 'alfa', 'beta']) expect(documento).toContain(`>${c}<`);
    expect(documento).toMatch(/<w:b\/>[^]*?Nome/);
  });

  test('bloco de código: fonte monoespaçada e sombreamento, uma linha por parágrafo', async () => {
    const { documento } = await xmlDe('```js\nconst a = 1;\nconsole.log(a);\n```');
    expect(documento).toContain('Courier New');
    expect(documento).toContain('w:fill="F2F2F2"');
    expect(documento).toContain('const a = 1;');
    expect(documento).toContain('console.log(a);');
  });

  test('itálico, código inline e negrito', async () => {
    const { documento } = await xmlDe('um *grifo* e **forte** e `cod`');
    expect(documento).toMatch(/<w:i\/>[^]*?grifo/);
    expect(documento).toMatch(/<w:b\/>[^]*?forte/);
    expect(documento).toContain('Courier New');
  });

  test('link [texto](url) e URL solta viram hiperlinks clicáveis', async () => {
    const { documento, relacoes } = await xmlDe('veja [o site](https://exemplo.com/a) e https://exemplo.org/b.');
    expect(documento.match(/<w:hyperlink /g)).toHaveLength(2);
    expect(relacoes).toContain('Target="https://exemplo.com/a"');
    expect(relacoes).toContain('Target="https://exemplo.org/b"');
    expect(relacoes).toContain('TargetMode="External"');
  });

  test('referências da aula (- [F1] Título — URL) saem com a URL clicável', async () => {
    const { documento, relacoes } = await xmlDe('### Referências da aula\n\n- [F1] Guia oficial — https://docs.exemplo.com/guia');
    expect(documento).toContain('[F1]');
    expect(documento).toContain('<w:hyperlink ');
    expect(relacoes).toContain('Target="https://docs.exemplo.com/guia"');
  });

  test('fontes consultadas da pesquisa: título e hiperlink para a URL', async () => {
    const { documento, relacoes } = await xmlDe('# Pesquisa', [
      { title: 'Relatório do setor', url: 'https://setor.example/relatorio' },
      { title: 'Sem URL válida', url: '' }
    ]);
    expect(documento).toContain('Fontes Consultadas');
    expect(documento).toContain('Relatório do setor');
    expect(relacoes).toContain('Target="https://setor.example/relatorio"');
    expect(documento).toContain('Sem URL válida');
  });

  test('títulos de nível 4, régua e quebra de página não quebram o documento', async () => {
    const { documento } = await xmlDe('#### Subtítulo\n---\n<!--PAGEBREAK-->\nfim');
    expect(documento).toContain('Subtítulo');
    expect(documento).toContain('w:pageBreakBefore');
  });

  test('mantém o comportamento anterior: títulos, negrito e parágrafos', async () => {
    const { documento } = await xmlDe('# Título\n\ntexto **forte**');
    expect(documento).toContain('Título');
    expect(documento).toContain('Heading1');
    expect(documento).toContain('forte');
  });
});

describe('contrato .docx × interface', () => {
  const AMOSTRA = [
    '# Aula 1: Introdução',
    '',
    '1. instalar o programa',
    '2. abrir o projeto',
    '3. exportar o vídeo',
    '',
    '- ferramenta A',
    '- ferramenta B',
    '',
    '| Atalho | Função |',
    '|---|---|',
    '| Ctrl+B | dividir |',
    '| Ctrl+Z | desfazer |',
    '',
    '```',
    'passo = 1',
    '```',
    '',
    'Veja [a documentação](https://docs.exemplo.com) e *pratique*.'
  ].join('\n');

  test('mesmos elementos nos dois formatos', async () => {
    const { documento, relacoes } = await xmlDe(AMOSTRA);
    const html = renderMarkdown(AMOSTRA);

    // tabela: 3 linhas × 2 colunas nos dois
    expect(documento.match(/<w:tr[ >]/g)).toHaveLength(3);
    expect(documento.match(/<w:tc>/g)).toHaveLength(6);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html.match(/<t[hd]>/g)).toHaveLength(6);

    // listas: 3 itens numerados + 2 com marcador
    expect(documento.match(/<w:numPr>/g)).toHaveLength(5);
    expect(html.match(/<ol>.*?<\/ol>/s)[0].match(/<li>/g)).toHaveLength(3);
    expect(html.match(/<ul>.*?<\/ul>/s)[0].match(/<li>/g)).toHaveLength(2);

    // código, itálico e link presentes nos dois
    expect(documento).toContain('Courier New');
    expect(html).toContain('<pre><code>passo = 1</code></pre>');
    expect(documento).toMatch(/<w:i\/>[^]*?pratique/);
    expect(html).toContain('<em>pratique</em>');
    expect(relacoes).toContain('Target="https://docs.exemplo.com"');
    expect(html).toContain('href="https://docs.exemplo.com"');
  });
});
