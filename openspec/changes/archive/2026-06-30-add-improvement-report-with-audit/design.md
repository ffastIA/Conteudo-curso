## Context

`GET /api/aplicar-melhorias/confirmar` já:
- Calcula `metricasPorAula` com similaridade Jaccard por aula (adicionado em `improvement-cycle-audit`)
- Emite aviso SSE por aula quando similaridade > 90%
- Chama `persistStage(sess, 'conteudo', ..., fullText)` que grava `scr/conteudo.txt` + `conteudo.docx`
- A variável `fullText` contém todas as aulas com seção `### Melhorias Aplicadas`

`buildDocx(config, label, content, sites)` e `Packer.toBuffer(doc)` já estão disponíveis no escopo do handler — mesma função usada por `persistStage`.

## Goals / Non-Goals

**Goals:**
- Produzir um arquivo docx imutável por ciclo com timestamp no nome
- Registrar no documento a auditoria Jaccard quando similaridade > 90%
- Não modificar `conteudo.docx`, `conteudo.txt` nem `sess.conteudo`

**Non-Goals:**
- Não enviar o arquivo ao frontend via download
- Não listar os relatórios históricos na interface
- Não alterar o formato das seções "Melhorias Aplicadas" geradas pelo modelo

## Decisions

**Geração do timestamp: `Date` nativo, formato `YYYYMMDD_HHmmss` local**

```js
const now = new Date();
const ts = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0')
].join('') + '_' + [
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
  String(now.getSeconds()).padStart(2, '0')
].join('');
```

Sem dependência externa. Formato legível no explorador de arquivos do Windows (sem `:` inválidos).

**Construção da seção de auditoria: texto Markdown antes de `buildDocx`**

```js
function buildAuditSection(metricasPorAula) {
  const afetadas = metricasPorAula.filter(m => m.similaridade > 0.90);
  if (afetadas.length === 0) return '';
  const todasAfetadas = afetadas.length === metricasPorAula.length;
  const simMedia = Math.round(
    metricasPorAula.reduce((s, m) => s + m.similaridade, 0) / metricasPorAula.length * 100
  );
  let txt = '\n\n---\n\n## Auditoria do Ciclo\n\n';
  if (todasAfetadas) {
    txt += `**Nenhuma nova implementação detectada neste ciclo** (similaridade média: ${simMedia}%).\n\n`;
  } else {
    txt += `As seguintes aulas tiveram pouca alteração (similaridade > 90%):\n\n`;
  }
  afetadas.forEach(a => {
    txt += `- **Aula ${a.aulaIndex} — ${a.titulo}**: ${Math.round(a.similaridade * 100)}% similar ao ciclo anterior\n`;
  });
  return txt;
}
```

A seção é appendada ao `fullText` apenas no relatório timestampado — `sess.conteudo` não é alterado.

**Onde gravar: `rootDir`, não `scrDir`**

O `rootDir` é o diretório entregável (mesma pasta de `conteudo.docx`). O `scrDir` é para memória interna (`.txt`). O relatório timestampado é um entregável, não memória.

**Falha não bloqueia o fluxo**

Toda a geração do relatório timestampado é envolvida em `try/catch` isolado. Se `buildDocx` ou `Packer.toBuffer` falhar, o ciclo já concluiu com sucesso — o erro é apenas logado.

## Risks / Trade-offs

**Acúmulo de arquivos** → cada ciclo gera um arquivo (~100–500 KB). Para 10 ciclos: ~5 MB. Volume irrelevante. Sem limpeza automática necessária.

**`fullText` com auditoria não atualiza `sess.conteudo`** → intencional. O conteúdo de sessão deve refletir apenas o conteúdo puro das aulas, não a auditoria. A auditoria é exclusiva do arquivo histórico.
