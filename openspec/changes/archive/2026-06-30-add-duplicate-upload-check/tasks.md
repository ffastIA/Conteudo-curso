## 1. Check de similaridade no handler de upload (server.js)

- [x] 1.1 Logo antes do bloco `try { const { value: textoExtraido }...` em `POST /api/aplicar-melhorias`, adicionar a constante de threshold no topo do handler (ou como constante de módulo próxima de outras constantes):
  ```js
  const DUPLICATE_OBS_THRESHOLD = 0.85;
  ```

- [x] 1.2 Após popular `observacoesPorAula` (após o `.map(...)`) e ANTES de `sess.observacoesMelhorias = observacoesPorAula`, adicionar o check de duplicata:
  ```js
  let avisoResposta = null;
  const juntarObs = lista => lista.map(o => o.observacoes || '').join(' ');
  const novasObsText = juntarObs(observacoesPorAula);
  if (novasObsText.length > 50) {
    try {
      const scrDir = courseScrDir(sess);
      const obsAnteriorPath = path.join(scrDir, 'observacoes_pendentes.json');
      if (fs.existsSync(obsAnteriorPath)) {
        const obsAnteriores = JSON.parse(fs.readFileSync(obsAnteriorPath, 'utf-8'));
        const obsAntText = juntarObs(obsAnteriores.aulas || []);
        if (obsAntText.length > 50) {
          const simObs = textSimilarity(novasObsText, obsAntText);
          if (simObs > DUPLICATE_OBS_THRESHOLD) {
            avisoResposta = {
              aviso: 'possivel_duplicata',
              similaridadeObservacoes: Math.round(simObs * 100) / 100,
              dataUltimoUpload: obsAnteriores.dataUpload || null
            };
          }
        }
      }
    } catch (e) { console.error('Erro ao verificar duplicata de upload:', e.message); }
  }
  ```

- [x] 1.3 Alterar o `res.json(...)` no final do handler para incluir `avisoResposta` quando presente:
  ```js
  // era:
  res.json({ ok: true, aulas: observacoesPorAula, totalComObservacoes: comObservacoes.length });
  // passa a ser:
  res.json({ ok: true, aulas: observacoesPorAula, totalComObservacoes: comObservacoes.length, ...avisoResposta });
  ```

## 2. Banner de alerta no HTML (index.html)

- [x] 2.1 Em `index.html`, logo após `<div id="resumoMelhorias" ...>`, adicionar o elemento de banner de duplicata:
  ```html
  <div id="bannerDuplicata" style="display:none;margin-top:12px;padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:.85rem;"></div>
  ```

## 3. Tratamento do aviso no frontend (app.js)

- [x] 3.1 No handler do upload em `app.js`, substituir o trecho que habilita `aplicarBtn` pelo tratamento condicional:
  ```js
  // era:
  aplicarBtn.disabled = false;

  // passa a ser:
  if (data.aviso === 'possivel_duplicata') {
    const pct = Math.round((data.similaridadeObservacoes || 0) * 100);
    const dtUpload = data.dataUltimoUpload
      ? new Date(data.dataUltimoUpload).toLocaleString('pt-BR')
      : 'data desconhecida';
    const bannerDup = document.getElementById('bannerDuplicata');
    bannerDup.innerHTML =
      `⚠️ <strong>Possível duplicata detectada.</strong> Este documento é ` +
      `<strong>${pct}% similar</strong> ao último carregado (${escHtml(dtUpload)}). ` +
      `Você pode estar aplicando as mesmas melhorias duas vezes.<br>` +
      `<div style="margin-top:8px;display:flex;gap:8px">` +
        `<button class="btn btn-ghost btn-sm" id="btnCancelarDuplicata">Cancelar</button>` +
        `<button class="btn btn-primary btn-sm" id="btnConfirmarDuplicata">Aplicar mesmo assim</button>` +
      `</div>`;
    bannerDup.style.display = 'block';
    document.getElementById('btnCancelarDuplicata').onclick = () => {
      bannerDup.style.display = 'none';
      document.getElementById('resumoMelhorias').style.display = 'none';
    };
    document.getElementById('btnConfirmarDuplicata').onclick = () => {
      bannerDup.style.display = 'none';
      aplicarBtn.disabled = false;
    };
  } else {
    aplicarBtn.disabled = false;
  }
  ```

## 4. Verificação manual

- [ ] 4.1 Carregar um relatório de revisão pela primeira vez — confirmar que não aparece nenhum aviso e o botão "Aplicar Melhorias" fica habilitado normalmente
- [ ] 4.2 Sem aplicar, carregar o MESMO arquivo novamente — confirmar que o banner âmbar aparece com percentual ≥ 85% e o botão "Aplicar Melhorias" fica desabilitado
- [ ] 4.3 Clicar "Cancelar" — confirmar que banner e resumo desaparecem
- [ ] 4.4 Carregar o mesmo arquivo novamente e clicar "Aplicar mesmo assim" — confirmar que o botão "Aplicar Melhorias" é habilitado e o ciclo executa normalmente
- [ ] 4.5 Carregar um arquivo diferente (com observações distintas) — confirmar que não aparece aviso
