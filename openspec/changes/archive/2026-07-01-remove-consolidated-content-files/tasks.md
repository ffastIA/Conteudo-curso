## 1. Remover persistStage do consolidado — Etapa 5 (server.js)

- [x] 1.1 Em `GET /api/conteudo` (~linha 890), remover a linha:
  ```js
  await persistStage(sess, 'conteudo', 'Conteúdo de Todas as Aulas (consolidado)', fullText);
  ```
  Manter `sess.conteudo = fullText` e `sess.conteudoPorAula = conteudoPorAula` inalterados.

## 2. Remover persistStage do consolidado — Etapa 6 (server.js)

- [x] 2.1 Em `GET /api/aplicar-melhorias/confirmar` (~linha 1574), remover a linha:
  ```js
  await persistStage(sess, 'conteudo', 'Conteúdo de Todas as Aulas (consolidado)', fullText);
  ```
  Manter `sess.conteudoPorAula = novasPorAula` e `sess.conteudo = fullText` inalterados.

## 3. Remover 'conteudo' do restore de sessão (server.js)

- [x] 3.1 Na lista `textuais` (~linha 1021), remover a entrada `['conteudo', 'conteudo']`.

- [x] 3.2 Após o bloco de restore dos textuais, adicionar reconstrução de `sess.conteudo` a partir de `sess.conteudoPorAula` quando o arquivo de disco não existir mais:
  ```js
  if (!sess.conteudo && sess.conteudoPorAula?.length) {
    sess.conteudo = sess.conteudoPorAula.map((a, i) =>
      `${i === 0 ? '' : '\n\n'}# Aula ${i + 1}: ${a.titulo}\n\n${a.texto || ''}`
    ).join('');
  }
  ```

## 4. Remover 'conteudo' de STAGES_FIXOS (server.js)

- [x] 4.1 Em `STAGES_FIXOS` (~linha 1054), remover a entrada:
  ```js
  'conteudo': { sessField: 'conteudo', label: 'Conteúdo Consolidado' },
  ```

## 5. Remover 'conteudo' do seed de desenvolvimento (server.js)

- [x] 5.1 No endpoint `/api/seed` (~linha 1885), remover `'conteudo'` da lista e `sess.conteudo` do array de conteúdos:
  ```js
  // era:
  ['ementa','pesquisa','plano_de_ensino','plano_de_aula','conteudo'].forEach((baseName, i) => {
    const conteudos = [sess.ementa, sess.pesquisa, sess.planoEnsino, sess.planoAula, sess.conteudo];
  // passa a ser:
  ['ementa','pesquisa','plano_de_ensino','plano_de_aula'].forEach((baseName, i) => {
    const conteudos = [sess.ementa, sess.pesquisa, sess.planoEnsino, sess.planoAula];
  ```

## 6. Verificação manual

- [ ] 6.1 Executar a Etapa 5 de geração de conteúdo e confirmar que `conteudo.docx` e `scr/conteudo.txt` NÃO são criados na pasta do projeto
- [ ] 6.2 Confirmar que os arquivos individuais `aula01_conteudo.docx`, `aula02_conteudo.docx`, etc. continuam sendo gerados normalmente
- [ ] 6.3 Executar um ciclo de melhorias (Etapa 6) e confirmar que `conteudo.docx` também não é (re)criado
- [ ] 6.4 Após restart do servidor, carregar um projeto existente e confirmar que o PPC e `finalizar-conteudo` ainda funcionam (sess.conteudo reconstruído via conteudoPorAula)
