'use strict';

// Teste estático: toda chamada ao SDK da OpenAI precisa passar por
// chamarOpenAI (ponto único de instrumentação). Se alguém chamar
// openai.chat.completions.create / openai.responses.create / openai.images.generate
// direto, a chamada ficaria fora do trace e do cálculo de custo.

const fs = require('fs');
const path = require('path');

const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf-8');

function corpoDaFuncao(codigo, assinatura) {
  const inicio = codigo.indexOf(assinatura);
  if (inicio < 0) throw new Error(`função não encontrada: ${assinatura}`);
  let nivel = 0;
  let abriu = false;
  // começa no `{` do corpo (depois dos parâmetros, que podem ter `{}` de default)
  const corpo = inicio + codigo.slice(inicio).search(/\)\s*\{\r?\n/);
  for (let i = codigo.indexOf('{', corpo); i < codigo.length; i++) {
    if (codigo[i] === '{') { nivel++; abriu = true; }
    if (codigo[i] === '}') { nivel--; if (abriu && nivel === 0) return { inicio, fim: i + 1 }; }
  }
  throw new Error('corpo não fechado');
}

describe('ponto único de instrumentação das chamadas à OpenAI', () => {
  const { inicio, fim } = corpoDaFuncao(fonte, 'async function chamarOpenAI(');
  const foraDoWrapper = fonte.slice(0, inicio) + fonte.slice(fim);

  test.each([
    'openai.chat.completions.create(',
    'openai.responses.create(',
    'openai.images.generate(',
    'openai.completions.create(',
    'openai.embeddings.create('
  ])('nenhuma chamada direta a %s fora de chamarOpenAI', (chamada) => {
    expect(foraDoWrapper).not.toContain(chamada);
  });

  test('o wrapper contém as chamadas ao SDK e existe um único cliente OpenAI', () => {
    const wrapper = fonte.slice(inicio, fim);
    expect(wrapper).toContain('openai.chat.completions.create(');
    expect(wrapper).toContain('openai.responses.create(');
    const semComentarios = fonte.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
    expect(semComentarios.match(/new OpenAI\(/g)).toHaveLength(1);
  });

  test('há chamadas instrumentadas (a refatoração não deixou o wrapper órfão)', () => {
    expect((foraDoWrapper.match(/chamarOpenAI\(/g) || []).length).toBeGreaterThanOrEqual(15);
  });

  test('o módulo de observabilidade não é sombreado por variáveis locais chamadas obs', () => {
    // `obs` já foi usado como nome de variável local (observações do revisor);
    // o módulo é importado como `observabilidade` para evitar colisão.
    expect(fonte).toMatch(/const \{ obs: observabilidade \} = require\('\.\/observabilidade'\)/);
  });
});
