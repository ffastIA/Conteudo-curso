/**
 * Gera um .docx de revisão com "Observações do Revisor" preenchidas,
 * simulando o arquivo que o revisor humano devolveria após anotar a Etapa 5★.
 *
 * Uso:
 *   node scripts/gerar-docx-teste.js
 *
 * Saída: scripts/revisao_anotada_teste.docx
 */

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel
} = require('docx');
const path = require('path');
const fs = require('fs');

const aulas = [
  {
    titulo: 'Aula 1: Introdução ao Python e Ambiente',
    observacoes: 'Incluir referência ao Google Colab como alternativa de ambiente sem instalação. Adicionar um exemplo prático de erro de sintaxe e como corrigir.'
  },
  {
    titulo: 'Aula 2: Condicionais e Entrada do Usuário',
    observacoes: '' // sem observações — testa aula ignorada
  },
  {
    titulo: 'Aula 3: Listas e Laços',
    observacoes: 'Adicionar exemplo com enumerate() e zip(). Incluir comparação entre for e while com casos de uso reais.'
  },
  {
    titulo: 'Aula 4: Funções e Mini-Projeto',
    observacoes: 'Expandir o mini-projeto para incluir tratamento de erros com try/except. Mencionar o conceito de escopo de variáveis.'
  }
];

const children = [];

children.push(
  new Paragraph({
    text: 'Revisão de Qualidade — Python para Iniciantes',
    heading: HeadingLevel.HEADING_1
  })
);

children.push(
  new Paragraph({
    children: [new TextRun({ text: 'Documento de revisão pedagógica gerado para testes.', italics: true })],
    spacing: { after: 300 }
  })
);

for (const aula of aulas) {
  children.push(
    new Paragraph({ text: aula.titulo, heading: HeadingLevel.HEADING_2, spacing: { before: 400 } })
  );

  children.push(
    new Paragraph({ text: '1. Compatibilidade com o Plano de Aula', heading: HeadingLevel.HEADING_3 })
  );
  children.push(new Paragraph({ text: 'Conteúdo alinhado com os objetivos do plano de aula.' }));

  children.push(
    new Paragraph({ text: '2. Deficiências e Melhorias Sugeridas', heading: HeadingLevel.HEADING_3 })
  );
  children.push(new Paragraph({ text: 'Ver seção de observações abaixo.' }));

  children.push(
    new Paragraph({ text: '3. Observações do Revisor', heading: HeadingLevel.HEADING_3 })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: aula.observacoes || '(sem observações)',
          italics: !aula.observacoes
        })
      ],
      spacing: { after: 200 }
    })
  );
}

const doc = new Document({ sections: [{ children }] });

const outPath = path.join(__dirname, 'revisao_anotada_teste.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log(`✔ Arquivo gerado: ${outPath}`);
  console.log('  Aulas com observações:',
    aulas.filter(a => a.observacoes).map(a => a.titulo).join(', ')
  );
});
