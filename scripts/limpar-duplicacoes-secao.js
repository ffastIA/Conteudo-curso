// Script de execução única: higieniza as Aulas 1, 2 e 3 do curso "Capcut
// Oficina", corrompidas por ciclos de melhorias rodados antes da correção de
// corrigir-duplicacao-patch-secional. Reaproveita parseSecoesFixas (mesma
// função usada pelo merge corrigido) para identificar seções e usa
// similaridade de CONTEÚDO (não só título) contra a última ocorrência mantida
// do mesmo título para decidir se é uma duplicata de cascata (corrupção) ou
// uma repetição legítima do mesmo título genérico em outro objetivo/subtópico
// (ex.: "Fundamentação Técnica" existe uma vez por objetivo, por desenho —
// dedup por título sozinho apagaria conteúdo real de objetivos 2 e 3). Não é
// chamado pelo pipeline em produção.
const fs = require('fs');
const path = require('path');
const { parseSecoesFixas, textSimilarity, buildDocx, Packer } = require('../server');

const PROJETO_DIR = 'C:\\Users\\usuario\\OneDrive - Engine Tecnologia\\Projetos\\Claude\\Projetos\\Cursos\\Capcut Oficina';
const SCR_DIR = path.join(PROJETO_DIR, 'scr');
const NOME_CURSO = 'Capcut Oficina';

// Acima deste valor, duas seções de mesmo título são tratadas como a mesma
// seção duplicada por corrupção (mantém-se a primeira do par); abaixo,
// tratadas como conteúdo legitimamente distinto (ambas mantidas). Calibrado
// empiricamente: repetições de corrupção real medem 0.7-1.0 de similaridade;
// o mesmo título em objetivos/subtópicos diferentes mede 0.0-0.36.
const LIMIAR_DUPLICATA = 0.45;

const AULAS = [
  { numero: '01', titulo: 'Ferramentas Avançadas do Capcut' },
  { numero: '02', titulo: 'Edição Multicamada e Composição em Vídeo' },
  { numero: '03', titulo: 'Animações e Efeitos Dinâmicos' }
];

function limparDuplicatas(texto) {
  const linhas = texto.split('\n');
  const secoes = parseSecoesFixas(texto);

  const ultimoCorpoPorTitulo = new Map(); // tituloNorm -> corpo da última ocorrência MANTIDA
  const manterIdx = [];

  secoes.forEach((s, idx) => {
    const corpo = linhas.slice(s.inicioCorpo, s.fimCorpo).join('\n').trim();
    const ultimo = ultimoCorpoPorTitulo.get(s.tituloNorm);
    const ehDuplicata = ultimo !== undefined && textSimilarity(ultimo, corpo) >= LIMIAR_DUPLICATA;
    if (ehDuplicata) return; // descarta: duplicata de cascata da ocorrência anterior mantida
    ultimoCorpoPorTitulo.set(s.tituloNorm, corpo);
    manterIdx.push(idx);
  });

  const fimPreambulo = secoes.length ? secoes[0].inicioHeading : linhas.length;
  const resultado = linhas.slice(0, fimPreambulo);
  manterIdx.forEach(idx => {
    const s = secoes[idx];
    resultado.push(linhas[s.inicioHeading]);
    resultado.push(...linhas.slice(s.inicioCorpo, s.fimCorpo));
  });

  const texto2 = resultado.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return {
    texto: texto2,
    totalOriginal: secoes.length,
    totalFinal: manterIdx.length,
    duplicatasRemovidas: secoes.length - manterIdx.length
  };
}

async function main() {
  for (const aula of AULAS) {
    const txtPath = path.join(SCR_DIR, `aula${aula.numero}_conteudo.txt`);
    const docxPath = path.join(PROJETO_DIR, `aula${aula.numero}_conteudo.docx`);

    const original = fs.readFileSync(txtPath, 'utf-8');
    const { texto, totalOriginal, totalFinal, duplicatasRemovidas } = limparDuplicatas(original);

    console.log(
      `Aula ${aula.numero} (${aula.titulo}): ${totalOriginal} seção(ões) -> ${totalFinal} ` +
      `(${duplicatasRemovidas} duplicata(s) removida(s)); ${original.length} -> ${texto.length} caracteres`
    );

    fs.writeFileSync(txtPath, texto, 'utf-8');

    const numeroAula = parseInt(aula.numero, 10);
    const doc = buildDocx({ nome: NOME_CURSO }, `Conteúdo — Aula ${numeroAula}: ${aula.titulo}`, texto);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(docxPath, buffer);
  }
  console.log('Limpeza concluída.');
}

main().catch(err => {
  console.error('Erro na limpeza:', err);
  process.exit(1);
});
