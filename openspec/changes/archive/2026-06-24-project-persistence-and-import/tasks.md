## 1. Helper saveProject e persistência automática (server.js)

- [x] 1.1 Criar helper `saveProject(sess)` em `server.js`: serializa `{ config, bncc, metodologia, aulas, stages }` e grava em `saídas/{slug}/projeto.json`; ignorar silenciosamente se `sess.config.nome` estiver vazio
- [x] 1.2 Chamar `saveProject(sess)` ao final de `persistStage()` em `server.js`, após gravar o `.txt` e o `.docx`, para que `projeto.json` seja sempre atualizado junto
- [x] 1.3 Atualizar `saveProject(sess)` para receber parâmetro `{ baseName, fonte }` e registrar `stages[baseName] = { fonte, geradoEm: new Date().toISOString() }` no `projeto.json`

## 2. Endpoint GET /api/projetos (server.js)

- [x] 2.1 Criar `GET /api/projetos` em `server.js`: escanear subdiretórios de `saídas/` com `fs.readdirSync`, filtrar os que possuem `projeto.json`, ler cada um e retornar `{ projetos: [{ slug, nome, etapas, ultimaModificacao }] }`; retornar `{ projetos: [] }` se `saídas/` não existir

## 3. Endpoint POST /api/carregar-projeto (server.js)

- [x] 3.1 Criar `POST /api/carregar-projeto` em `server.js`: recebe `{ slug }`, valida existência da pasta, lê `projeto.json` (se existir) e popula `sess.config`, `sess.bncc`, `sess.metodologia`, `sess.aulas`
- [x] 3.2 No mesmo endpoint, carregar campos textuais via `readMemory()` para: `ementa`, `pesquisa`, `planoEnsino`, `planoAula`, `conteudo`, `revisaoQualidade`, `relatorioQualidade`
- [x] 3.3 Retornar `{ ok: true, etapasCarregadas: [...], camposFaltantes: [...] }` listando o que foi carregado e o que faltou (bncc/metodologia/aulas ausentes do `projeto.json`)
- [x] 3.4 Tratar `projeto.json` corrompido (JSON inválido): carregar apenas `.txt` e incluir `aviso` na resposta; tratar slug inexistente com status 404

## 4. Endpoint POST /api/importar (server.js)

- [x] 4.1 Criar `POST /api/importar` em `server.js` com `upload.single('arquivo')`: validar extensão `.docx`; extrair texto com `mammoth.extractRawText({ buffer })`
- [x] 4.2 Implementar lógica de identificação do estágio: (1) mapear nome do arquivo para stage conhecido (`aula03_conteudo.docx` → `aula03_conteudo`); (2) se não reconhecido, extrair primeiro título H1 e buscar correspondência em `sess.aulas` ou lista de stages fixos; (3) se ambíguo, retornar `{ candidatos: [...] }` para seletor manual
- [x] 4.3 Retornar `{ ok: true, stagioDetectado, titulo, chars, requerConfirmacao: true, detectadoPor: "nome"|"titulo"|"ambiguo" }` sem sobrescrever ainda

## 5. Endpoint POST /api/importar/confirmar (server.js)

- [x] 5.1 Criar `POST /api/importar/confirmar` em `server.js`: recebe `{ stage, texto }`; validar que `stage` é um stage conhecido; sobrescrever `saídas/{slug}/{stage}.txt` com o texto recebido
- [x] 5.2 Atualizar o campo correspondente na sessão (`sess.planoEnsino`, `sess.conteudoPorAula[i].texto`, etc.) conforme o `stage` confirmado
- [x] 5.3 Chamar `saveProject(sess, { baseName: stage, fonte: 'usuario' })` para registrar a origem no `projeto.json`

## 6. Frontend — Card "Abrir projeto existente" (index.html + app.js)

- [x] 6.1 Adicionar card "Abrir projeto existente" em `public/index.html` na Etapa 0, antes do formulário de novo projeto, com área de listagem (`#listaProjetos`) e estado vazio ("Nenhum projeto encontrado")
- [x] 6.2 Implementar em `public/app.js` chamada a `GET /api/projetos` no carregamento da página: se retornar projetos, renderizar cards clicáveis com nome, data e etapas; ocultar card se lista vazia
- [x] 6.3 Implementar em `public/app.js` handler de clique no projeto: chamar `POST /api/carregar-projeto`, exibir banner "Projeto carregado: {nome}", avançar para a última etapa concluída e marcar `doneSteps` com as etapas encontradas

## 7. Frontend — Badge de origem e botão de importação por etapa (index.html + app.js)

- [x] 7.1 Adicionar em `public/index.html` um badge `<span class="badge-origem" id="origemEtapaN">` e um botão `<button class="btn-importar">Importar versão editada (.docx)</button>` em cada seção de etapa (visível apenas após conclusão)
- [x] 7.2 Implementar em `public/app.js` função `atualizarBadgeOrigem(step, fonte, data)`: exibe `🤖 Gerado pela IA` (cinza) ou `✏️ Versão do usuário` (verde) + data conforme `fonte`
- [x] 7.3 Implementar em `public/app.js` handler do botão de importação: abrir file picker `.docx`, fazer `POST /api/importar`, exibir resultado da detecção (stage identificado ou seletor de candidatos) e aguardar confirmação do usuário
- [x] 7.4 Implementar em `public/app.js` a confirmação de importação: chamar `POST /api/importar/confirmar`, atualizar badge de origem da etapa e exibir toast "Conteúdo da Aula X atualizado com sua versão"
- [x] 7.5 Implementar em `public/app.js` modal de aviso ao tentar regenerar etapa com `fonte === "usuario"`: exibir confirmação antes de prosseguir com a regeneração

## 8. Estilos CSS (style.css)

- [x] 8.1 Adicionar em `public/style.css` estilos para: card de projetos existentes (`.card-projetos`), item de projeto (`.projeto-item`), badge de origem IA (`.badge-ia`) e badge de origem usuário (`.badge-usuario`), estado "carregado do disco" (`.banner-projeto-carregado`)

## 9. Testes Manuais

- [ ] 9.1 Testar ciclo completo: gerar curso → reiniciar servidor → abrir projeto pelo card → verificar que todas as etapas são marcadas como concluídas e `bncc`/`metodologia` estão corretos
- [ ] 9.2 Testar importação de `.docx` com nome original: baixar `plano_de_ensino.docx`, editar, fazer upload → verificar badge "Versão do usuário" e que a Etapa 5 usa o novo texto
- [ ] 9.3 Testar importação de `.docx` renomeado: renomear `aula03_conteudo.docx` para `"Aula 3 editada.docx"`, fazer upload → verificar que a detecção por título H1 funciona e o seletor aparece quando ambíguo
- [ ] 9.4 Testar carregamento de projeto legado (sem `projeto.json`): criar pasta em `saídas/` só com `.txt` → verificar que `camposFaltantes` é retornado e o sistema não quebra
- [ ] 9.5 Testar aviso ao regenerar etapa de origem usuário: importar uma etapa → tentar regenerar → verificar que o modal de confirmação aparece antes de sobrescrever
