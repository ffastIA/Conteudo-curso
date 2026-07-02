## 1. Função auxiliar de auditoria (server.js)

- [x] 1.1 Antes do handler `GET /api/aplicar-melhorias/confirmar`, adicionar a função `buildAuditSection`:
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

## 2. Geração do relatório timestampado (server.js)

- [x] 2.1 Em `GET /api/aplicar-melhorias/confirmar`, após o bloco de `meta.json` e antes do `send(res, { type: 'done' })`, adicionar a geração do relatório timestampado:
  ```js
  try {
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
    const auditSection = buildAuditSection(metricasPorAula);
    const reportText = fullText + auditSection;
    const reportDoc = buildDocx(sess.config, 'Relatório de Melhorias Aplicadas', reportText, []);
    const reportBuffer = await Packer.toBuffer(reportDoc);
    fs.writeFileSync(path.join(courseRootDir(sess), `melhorias_aplicadas_${ts}.docx`), reportBuffer);
  } catch (e) { console.error('Erro ao gerar relatório timestampado:', e.message); }
  ```

## 3. Verificação manual

- [ ] 3.1 Executar um ciclo de aplicação de melhorias e confirmar que `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` é criado em `saídas/<curso>/`
- [ ] 3.2 Confirmar que `conteudo.docx` permanece sem a seção de auditoria
- [ ] 3.3 Executar o ciclo novamente **sem novas observações** (mesmo docx) e confirmar que o relatório gerado inclui `## Auditoria do Ciclo` com "Nenhuma nova implementação detectada neste ciclo"
- [ ] 3.4 Confirmar que dois arquivos `melhorias_aplicadas_*.docx` com timestamps diferentes coexistem em disco sem sobrescrever um ao outro
