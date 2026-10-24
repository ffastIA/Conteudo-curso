'use strict';

// Converte o Markdown das aulas em elementos do pacote `docx` (v9). Usa a mesma
// análise da interface (public/markdown.js), então .docx e tela mostram os
// mesmos elementos: títulos, listas (marcador e numeradas), tabelas, blocos de
// código, negrito, itálico, código inline e links clicáveis.

const {
  Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, AlignmentType, UnderlineType
} = require('docx');
const { analisarBlocos, analisarInline } = require('./public/markdown');

const FONTE_CODIGO = 'Courier New';
const FUNDO_CODIGO = 'F2F2F2';
const COR_LINK = '0563C1';
const REFERENCIA_NUMERACAO = 'lista-numerada';

const NIVEIS_TITULO = {
  1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4
};

// Configuração de numeração do Document (necessária para listas numeradas).
const configNumeracao = () => ({
  config: [{
    reference: REFERENCIA_NUMERACAO,
    levels: [0, 1, 2].map(level => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } }
    }))
  }]
});

function linkDocx(url, texto, opcoes = {}) {
  return new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text: texto, color: COR_LINK, underline: { type: UnderlineType.SINGLE }, ...opcoes })]
  });
}

// Trechos inline → runs/hiperlinks. `base` repassa estilo (ex.: negrito do cabeçalho da tabela).
function runsInline(texto, base = {}) {
  return analisarInline(texto).map(p => {
    switch (p.t) {
      case 'negrito': return new TextRun({ ...base, text: p.texto, bold: true });
      case 'italico': return new TextRun({ ...base, text: p.texto, italics: true });
      case 'codigo': return new TextRun({ ...base, text: p.texto, font: FONTE_CODIGO, shading: { type: ShadingType.CLEAR, fill: FUNDO_CODIGO } });
      case 'link': return linkDocx(p.url, p.texto, base);
      default: return new TextRun({ ...base, text: p.texto });
    }
  });
}

function tabelaDocx(b) {
  const colunas = b.cabecalho.length;
  const celula = (texto, cabecalho) => new TableCell({
    children: [new Paragraph({ children: runsInline(texto, cabecalho ? { bold: true } : {}) })],
    ...(cabecalho ? { shading: { type: ShadingType.CLEAR, fill: 'E8E8F4' } } : {}),
    width: { size: Math.floor(100 / colunas), type: WidthType.PERCENTAGE }
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: b.cabecalho.map(c => celula(c, true)) }),
      ...b.linhas.map(l => new TableRow({ children: b.cabecalho.map((_, k) => celula(l[k] || '', false)) }))
    ]
  });
}

// Markdown → lista de elementos (Paragraph/Table) para o corpo do documento.
function blocosParaDocx(conteudo) {
  const elementos = [];
  let instancia = 0; // cada lista numerada recomeça em 1
  for (const b of analisarBlocos(conteudo)) {
    switch (b.tipo) {
      case 'quebra':
        elementos.push(new Paragraph({ text: '', pageBreakBefore: true }));
        break;
      case 'vazio':
        elementos.push(new Paragraph({ text: '' }));
        break;
      case 'titulo':
        elementos.push(new Paragraph({ children: runsInline(b.texto), heading: NIVEIS_TITULO[b.nivel] }));
        break;
      case 'paragrafo':
        elementos.push(new Paragraph({ children: runsInline(b.texto) }));
        break;
      case 'lista': {
        instancia += 1;
        for (const it of b.itens) {
          elementos.push(new Paragraph({
            children: runsInline(it.texto),
            ...(it.ordenada
              ? { numbering: { reference: REFERENCIA_NUMERACAO, level: it.nivel, instance: instancia } }
              : { bullet: { level: it.nivel } })
          }));
        }
        break;
      }
      case 'tabela':
        elementos.push(tabelaDocx(b), new Paragraph({ text: '' }));
        break;
      case 'codigo':
        // Uma linha de código por parágrafo, fonte monoespaçada e sombreamento contínuo.
        for (const linha of (b.linhas.length ? b.linhas : [''])) {
          elementos.push(new Paragraph({
            children: [new TextRun({ text: linha, font: FONTE_CODIGO, size: 20 })],
            shading: { type: ShadingType.CLEAR, fill: FUNDO_CODIGO },
            spacing: { after: 0 }
          }));
        }
        elementos.push(new Paragraph({ text: '' }));
        break;
      case 'regua':
        elementos.push(new Paragraph({
          text: '',
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA', space: 1 } }
        }));
        break;
      default:
        break;
    }
  }
  return elementos;
}

// Lista "Fontes Consultadas": título + hiperlink para a URL de cada fonte.
function fontesParaDocx(sites = []) {
  const elementos = [];
  for (const site of sites) {
    if (!site?.url && !site?.title) continue;
    const children = [new TextRun({ text: '• ' })];
    if (site.url && /^https?:\/\//.test(site.url)) {
      children.push(site.title && site.title !== site.url
        ? new TextRun({ text: `${site.title} — ` })
        : new TextRun({ text: '' }));
      children.push(linkDocx(site.url, site.url));
    } else {
      children.push(new TextRun({ text: site.title || site.url, color: '4A3B8C' }));
    }
    elementos.push(new Paragraph({ children }));
  }
  return elementos;
}

module.exports = { blocosParaDocx, fontesParaDocx, configNumeracao, runsInline };
