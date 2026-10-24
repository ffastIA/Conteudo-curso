'use strict';

const { analisarBlocos, analisarInline, renderMarkdown } = require('../../public/markdown');

describe('analisarInline', () => {
  test('negrito, itálico, código e link', () => {
    const t = analisarInline('a **forte** b *suave* c `x = 1` d [site](https://exemplo.com/p)');
    expect(t.filter(p => p.t !== 'texto').map(p => [p.t, p.texto, p.url])).toEqual([
      ['negrito', 'forte', undefined],
      ['italico', 'suave', undefined],
      ['codigo', 'x = 1', undefined],
      ['link', 'site', 'https://exemplo.com/p']
    ]);
  });

  test('URL solta vira link sem a pontuação final', () => {
    const t = analisarInline('veja https://exemplo.com/a, depois');
    expect(t.find(p => p.t === 'link').url).toBe('https://exemplo.com/a');
    expect(t.map(p => p.texto).join('')).toBe('veja https://exemplo.com/a, depois');
  });

  test('não confunde snake_case, multiplicação nem [F1] com itálico/link', () => {
    for (const texto of ['use snake_case_nome aqui', '2 * 3 * 4', 'fonte [F1] citada']) {
      expect(analisarInline(texto)).toEqual([{ t: 'texto', texto }]);
    }
  });

  test('só aceita links http(s)', () => {
    expect(analisarInline('[x](javascript:alert(1))').some(p => p.t === 'link')).toBe(false);
  });
});

describe('analisarBlocos', () => {
  test('títulos de 1 a 4 níveis', () => {
    const b = analisarBlocos('# a\n## b\n### c\n#### d');
    expect(b.map(x => [x.tipo, x.nivel])).toEqual([['titulo', 1], ['titulo', 2], ['titulo', 3], ['titulo', 4]]);
  });

  test('lista numerada e com marcador, com níveis por indentação', () => {
    const [lista] = analisarBlocos('1. um\n2. dois\n  - sub\n3. três');
    expect(lista.tipo).toBe('lista');
    expect(lista.itens.map(i => [i.ordenada, i.nivel, i.texto])).toEqual([
      [true, 0, 'um'], [true, 0, 'dois'], [false, 1, 'sub'], [true, 0, 'três']
    ]);
  });

  test('tabela GFM com cabeçalho e linhas', () => {
    const [tabela] = analisarBlocos('| Nome | Valor |\n|---|:--:|\n| a | 1 |\n| b | 2 |');
    expect(tabela.tipo).toBe('tabela');
    expect(tabela.cabecalho).toEqual(['Nome', 'Valor']);
    expect(tabela.linhas).toEqual([['a', '1'], ['b', '2']]);
  });

  test('linha com barra mas sem separador não é tabela', () => {
    expect(analisarBlocos('| só uma linha |')[0].tipo).toBe('paragrafo');
  });

  test('bloco de código cercado preserva linhas e ignora marcação interna', () => {
    const b = analisarBlocos('```js\nconst a = **1**;\n  # não é título\n```\ndepois');
    expect(b[0]).toEqual({ tipo: 'codigo', linhas: ['const a = **1**;', '  # não é título'] });
    expect(b[1]).toEqual({ tipo: 'paragrafo', texto: 'depois' });
  });

  test('cerca sem fechamento vai até o fim do texto', () => {
    expect(analisarBlocos('```\nlinha 1\nlinha 2')[0].linhas).toEqual(['linha 1', 'linha 2']);
  });

  test('quebra de página, régua e linhas vazias', () => {
    expect(analisarBlocos('<!--PAGEBREAK-->\n---\n\n').map(b => b.tipo)).toEqual(['quebra', 'regua', 'vazio', 'vazio']);
  });

  test('aceita CRLF', () => {
    expect(analisarBlocos('# a\r\n- b').map(b => b.tipo)).toEqual(['titulo', 'lista']);
  });
});

describe('renderMarkdown (UI)', () => {
  test('tabela vira <table> com as mesmas células', () => {
    const html = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html.match(/<th>/g)).toHaveLength(2);
    expect(html.match(/<td>/g)).toHaveLength(2);
    expect(html).toContain('<td>2</td>');
  });

  test('lista numerada vira <ol>', () => {
    const html = renderMarkdown('1. passo um\n2. passo dois');
    expect(html).toBe('<ol><li>passo um</li><li>passo dois</li></ol>');
  });

  test('lista com marcador e sublista aninhada', () => {
    const html = renderMarkdown('- a\n  - b\n- c');
    expect(html).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  });

  test('bloco de código vira <pre><code> com HTML escapado', () => {
    const html = renderMarkdown('```\n<div>&</div>\n```');
    expect(html).toBe('<pre><code>&lt;div&gt;&amp;&lt;/div&gt;</code></pre>');
  });

  test('itálico, código inline e link com rel seguro', () => {
    const html = renderMarkdown('um *grifo*, `cod` e [site](https://exemplo.com)');
    expect(html).toContain('<em>grifo</em>');
    expect(html).toContain('<code>cod</code>');
    expect(html).toContain('<a href="https://exemplo.com" target="_blank" rel="noopener noreferrer">site</a>');
  });

  test('escapa HTML do texto (sem injeção)', () => {
    const html = renderMarkdown('<script>alert(1)</script> **x**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('mantém títulos, negrito e quebras de linha como antes', () => {
    const html = renderMarkdown('# Título\n\nlinha 1\nlinha 2\n\n**forte**');
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('linha 1<br>linha 2');
    expect(html).toContain('<strong>forte</strong>');
  });

  test('esconde o marcador de quebra de página', () => {
    expect(renderMarkdown('a\n<!--PAGEBREAK-->\nb')).not.toContain('PAGEBREAK');
  });
});
