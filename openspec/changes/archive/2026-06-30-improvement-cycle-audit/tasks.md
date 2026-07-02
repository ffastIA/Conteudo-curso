## 1. Persistência de observações no upload (server.js)

- [x] 1.1 Em `POST /api/aplicar-melhorias`, após popular `sess.observacoesMelhorias`, adicionar bloco de persistência em disco:
  ```js
  try {
    const scrDir = courseScrDir(sess);
    fs.writeFileSync(
      path.join(scrDir, 'observacoes_pendentes.json'),
      JSON.stringify({ dataUpload: new Date().toISOString(), aulas: observacoesPorAula }, null, 2),
      'utf-8'
    );
  } catch (e) { console.error('Erro ao gravar observacoes_pendentes.json:', e.message); }
  ```

## 2. Snapshot de ciclos (server.js)

- [x] 2.1 Em `GET /api/aplicar-melhorias/confirmar`, antes do loop de aulas, adicionar função auxiliar inline ou topo do handler para determinar o número do próximo ciclo:
  ```js
  const scrDir = courseScrDir(sess);
  const ciclosExistentes = fs.readdirSync(scrDir).filter(n => /^ciclo_\d{3}$/.test(n)).length;
  const numeroCiclo = String(ciclosExistentes + 1).padStart(3, '0');
  const cicloDir = path.join(scrDir, `ciclo_${numeroCiclo}`);
  ```
- [x] 2.2 Criar o diretório do ciclo e copiar os arquivos de conteúdo atuais dentro de um bloco try/catch que não bloqueia o fluxo:
  ```js
  try {
    fs.mkdirSync(cicloDir, { recursive: true });
    const aulas = sess.conteudoPorAula;
    aulas.forEach((_, i) => {
      const num = String(i + 1).padStart(2, '0');
      const src = path.join(scrDir, `aula${num}_conteudo.txt`);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(cicloDir, `aula${num}_conteudo.txt`));
    });
    fs.writeFileSync(
      path.join(cicloDir, 'observacoes.json'),
      JSON.stringify({ aulas: observacoes }, null, 2), 'utf-8'
    );
  } catch (e) { console.error(`Erro ao criar snapshot ciclo_${numeroCiclo}:`, e.message); }
  ```

## 3. Métrica Jaccard por aula (server.js)

- [x] 3.1 No loop de processamento de aulas em `GET /api/aplicar-melhorias/confirmar`, guardar `textoAntigo` antes de chamar `streamSkillToClient`:
  ```js
  const textoAntigo = aula.texto;
  const texto = await streamSkillToClient(res, skill);
  const similaridade = textSimilarity(textoAntigo, texto);
  ```
- [x] 3.2 Emitir aviso SSE quando similaridade > 0.90:
  ```js
  if (similaridade > 0.90) {
    send(res, { type: 'progress', message: `Aula ${i + 1}: conteúdo pouco alterado (${Math.round(similaridade * 100)}% similar ao original) — verifique se as observações foram aplicadas` });
  }
  ```
- [x] 3.3 Acumular métricas por aula e ao final do loop gravar `meta.json` no diretório do ciclo:
  ```js
  const metricasPorAula = []; // declarar antes do loop
  // dentro do loop: metricasPorAula.push({ aulaIndex: i + 1, titulo: aula.titulo, similaridade });
  // após o loop:
  const simMedia = metricasPorAula.reduce((s, m) => s + m.similaridade, 0) / metricasPorAula.length;
  try {
    fs.writeFileSync(path.join(cicloDir, 'meta.json'), JSON.stringify({
      ciclo: Number(numeroCiclo),
      dataHora: new Date().toISOString(),
      totalAulas: aulas.length,
      totalComObservacoes: observacoes.filter(o => o.observacoes?.length > 0).length,
      similaridadeMedia: Math.round(simMedia * 100) / 100,
      similaridadePorAula: metricasPorAula
    }, null, 2), 'utf-8');
  } catch (e) { console.error('Erro ao gravar meta.json:', e.message); }
  ```

## 4. Auto-auditoria no prompt (skills.js)

- [x] 4.1 Em `aplicarMelhoriasSkill`, ao final do template `user`, adicionar instrução de auto-auditoria após o bloco de instrução principal:
  ```js
  `\n\nAo final do conteúdo revisado, adicione obrigatoriamente a seguinte seção:\n\n` +
  `### Melhorias Aplicadas\n` +
  `Para cada observação do revisor listada acima, indique em um bullet: a observação e como foi tratada no conteúdo. ` +
  `Se uma observação não foi aplicada, justifique o motivo.`
  ```

## 5. Verificação manual

- [ ] 5.1 Executar ciclo completo de upload + confirmação e verificar que `scr/observacoes_pendentes.json` é criado imediatamente após o upload, antes de clicar em "Aplicar Melhorias"
- [ ] 5.2 Verificar que `scr/ciclo_001/` existe com os arquivos `aula{NN}_conteudo.txt` (snapshots do antes) e `observacoes.json` após a conclusão do ciclo
- [ ] 5.3 Verificar que `scr/ciclo_001/meta.json` contém `ciclo`, `dataHora`, `similaridadeMedia` e `similaridadePorAula` por aula
- [ ] 5.4 Executar um segundo ciclo e confirmar que `scr/ciclo_002/` é criado (numeração sequencial)
- [ ] 5.5 Verificar que o `.docx` gerado pelo ciclo contém a seção `### Melhorias Aplicadas` no final de cada aula
- [ ] 5.6 (Opcional) Forçar situação de conteúdo pouco alterado e confirmar que o aviso SSE é emitido no frontend
