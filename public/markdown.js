'use strict';

// Markdown usado nas aulas, em dois passos: analisarBlocos() transforma o texto
// numa lista de blocos e analisarInline() quebra uma linha em trechos (negrito,
// itálico, código, link). A UI (renderMarkdown, abaixo) e o gerador de .docx do
// servidor (docx-markdown.js) consomem a MESMA análise, então os dois formatos
// não divergem. Carregado como <script> no navegador e via require no Node.
//
// Suportado: títulos (# a ####), listas com marcador e numeradas (com níveis por
// indentação), tabelas GFM, blocos de código cercados por ``` , régua horizontal,
// quebra de página <!--PAGEBREAK-->, **negrito**, *itálico*, `código`,
// [texto](url) e URLs soltas. Não é CommonMark completo.

(function (raiz) {
  const RE_TITULO = /^(#{1,4})\s+(.*)$/;
  const RE_ITEM = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
  const RE_REGUA = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const RE_SEPARADOR_TABELA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  const ehLinhaTabela = (l) => l.trim().startsWith('|') && l.includes('|', l.indexOf('|') + 1);

  function celulas(linha) {
    let t = linha.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
    return t.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
  }

  function analisarBlocos(texto) {
    const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
    const blocos = [];
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];

      if (linha.trim() === '<!--PAGEBREAK-->') { blocos.push({ tipo: 'quebra' }); continue; }

      if (/^\s*```/.test(linha)) {
        const codigo = [];
        i++;
        while (i < linhas.length && !/^\s*```/.test(linhas[i])) codigo.push(linhas[i++]);
        blocos.push({ tipo: 'codigo', linhas: codigo });
        continue;
      }

      if (!linha.trim()) { blocos.push({ tipo: 'vazio' }); continue; }

      const titulo = RE_TITULO.exec(linha);
      if (titulo) { blocos.push({ tipo: 'titulo', nivel: titulo[1].length, texto: titulo[2] }); continue; }

      if (ehLinhaTabela(linha) && i + 1 < linhas.length && RE_SEPARADOR_TABELA.test(linhas[i + 1]) && linhas[i + 1].includes('-')) {
        const cabecalho = celulas(linha);
        const corpo = [];
        i += 2;
        while (i < linhas.length && linhas[i].trim() && ehLinhaTabela(linhas[i])) corpo.push(celulas(linhas[i++]));
        i--;
        blocos.push({ tipo: 'tabela', cabecalho, linhas: corpo });
        continue;
      }

      if (RE_REGUA.test(linha)) { blocos.push({ tipo: 'regua' }); continue; }

      const item = RE_ITEM.exec(linha);
      if (item) {
        const itens = [];
        let j = i;
        for (; j < linhas.length; j++) {
          const m = RE_ITEM.exec(linhas[j]);
          if (!m || RE_REGUA.test(linhas[j])) break;
          itens.push({ nivel: Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), ordenada: /\d/.test(m[2]), texto: m[3] });
        }
        i = j - 1;
        blocos.push({ tipo: 'lista', itens });
        continue;
      }

      blocos.push({ tipo: 'paragrafo', texto: linha });
    }
    return blocos;
  }

  // Trechos: { t: 'texto' | 'negrito' | 'italico' | 'codigo' | 'link', texto, url? }
  const RE_INLINE = new RegExp([
    '`([^`\\n]+)`',                                                 // 1 código
    '\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)',              // 2,3 link
    '\\*\\*(.+?)\\*\\*',                                             // 4 negrito
    '(?<![\\w*])\\*(?![\\s*])([^*\\n]+?)(?<!\\s)\\*(?![\\w*])',      // 5 itálico *
    '(?<!\\w)_(?![\\s_])([^_\\n]+?)(?<!\\s)_(?!\\w)',                // 6 itálico _
    '(https?:\\/\\/[^\\s<>\\]]+)'                                    // 7 URL solta
  ].join('|'), 'g');

  function analisarInline(texto) {
    const s = String(texto || '');
    const trechos = [];
    let ultimo = 0;
    RE_INLINE.lastIndex = 0;
    let m;
    while ((m = RE_INLINE.exec(s))) {
      if (m.index > ultimo) trechos.push({ t: 'texto', texto: s.slice(ultimo, m.index) });
      if (m[1] !== undefined) trechos.push({ t: 'codigo', texto: m[1] });
      else if (m[2] !== undefined) trechos.push({ t: 'link', texto: m[2], url: m[3] });
      else if (m[4] !== undefined) trechos.push({ t: 'negrito', texto: m[4] });
      else if (m[5] !== undefined) trechos.push({ t: 'italico', texto: m[5] });
      else if (m[6] !== undefined) trechos.push({ t: 'italico', texto: m[6] });
      else {
        // URL solta: pontuação final não faz parte do endereço
        const url = m[7].replace(/[.,;:!?)]+$/, '');
        trechos.push({ t: 'link', texto: url, url });
        if (url.length < m[7].length) trechos.push({ t: 'texto', texto: m[7].slice(url.length) });
      }
      ultimo = m.index + m[0].length;
    }
    if (ultimo < s.length) trechos.push({ t: 'texto', texto: s.slice(ultimo) });
    return trechos;
  }

  // ── Renderização HTML (UI) ─────────────────────────────────────────────────
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inlineHtml(texto) {
    return analisarInline(texto).map(p => {
      switch (p.t) {
        case 'negrito': return `<strong>${esc(p.texto)}</strong>`;
        case 'italico': return `<em>${esc(p.texto)}</em>`;
        case 'codigo': return `<code>${esc(p.texto)}</code>`;
        case 'link': return `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.texto)}</a>`;
        default: return esc(p.texto);
      }
    }).join('');
  }

  function listaHtml(itens) {
    // Pilha por nível: abre <ul>/<ol> ao descer, fecha ao subir.
    let html = '';
    const pilha = [];
    for (const it of itens) {
      const tag = it.ordenada ? 'ol' : 'ul';
      while (pilha.length > it.nivel + 1) html += `</li></${pilha.pop()}>`;
      if (pilha.length === it.nivel + 1) {
        html += '</li>';
        if (pilha[pilha.length - 1] !== tag) { html += `</${pilha.pop()}><${tag}>`; pilha.push(tag); }
      } else {
        while (pilha.length < it.nivel + 1) { html += `<${tag}>`; pilha.push(tag); }
      }
      html += `<li>${inlineHtml(it.texto)}`;
    }
    while (pilha.length) html += `</li></${pilha.pop()}>`;
    return html;
  }

  function renderMarkdown(texto) {
    const blocos = analisarBlocos(texto);
    let html = '';
    let ultimoFoiTexto = false; // parágrafos consecutivos viram linhas separadas por <br>
    for (const b of blocos) {
      if (b.tipo === 'paragrafo') {
        html += (ultimoFoiTexto ? '<br>' : '') + inlineHtml(b.texto);
        ultimoFoiTexto = true;
        continue;
      }
      if (b.tipo === 'vazio') { if (ultimoFoiTexto) html += '<br><br>'; ultimoFoiTexto = false; continue; }
      ultimoFoiTexto = false;
      switch (b.tipo) {
        case 'quebra': break;
        case 'titulo': html += `<h${Math.min(b.nivel, 4)}>${inlineHtml(b.texto)}</h${Math.min(b.nivel, 4)}>`; break;
        case 'lista': html += listaHtml(b.itens); break;
        case 'codigo': html += `<pre><code>${esc(b.linhas.join('\n'))}</code></pre>`; break;
        case 'regua': html += '<hr>'; break;
        case 'tabela':
          html += '<table><thead><tr>' + b.cabecalho.map(c => `<th>${inlineHtml(c)}</th>`).join('') + '</tr></thead><tbody>' +
            b.linhas.map(l => '<tr>' + b.cabecalho.map((_, k) => `<td>${inlineHtml(l[k] || '')}</td>`).join('') + '</tr>').join('') +
            '</tbody></table>';
          break;
        default: break;
      }
    }
    return html;
  }

  const api = { analisarBlocos, analisarInline, renderMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(raiz, api);
})(typeof window !== 'undefined' ? window : globalThis);
