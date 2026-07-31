## 1. Config

- [x] 1.1 Em `server.js`, junto de `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` (`server.js:60-61`), ler `const GAMMA_TEMPLATE_IDS = parseCsvEnv(process.env.GAMMA_TEMPLATE_IDS);`, reaproveitando `parseCsvEnv` (`server.js:53`) — sem duplicar a função.
- [x] 1.2 Em `.env.example`, adicionar `GAMMA_TEMPLATE_IDS` comentada (opcional) logo abaixo do bloco de `GAMMA_API_KEY`, no mesmo estilo de comentário de `HEYGEN_AVATAR_IDS`/`HEYGEN_VOICE_IDS` (formato `g_xxxxxxxxxxxx,g_yyyyyyyyyyyy`).

## 2. Resolver nomes dos templates (server.js)

- [x] 2.1 Implementar `async function listarTemplatesGamma()` em `server.js`, próxima das outras funções auxiliares do Gamma (`server.js:963-1010`): para cada ID em `GAMMA_TEMPLATE_IDS`, chamar `GET ${GAMMA_API_BASE}/gammas/${id}` com header `X-API-KEY: GAMMA_API_KEY`; em caso de sucesso, coletar `{ id, title: data.title }`; em caso de erro (status não-ok ou falha de rede), logar `console.warn` e omitir esse ID do resultado (Decisão 2 do design). Retornar a lista na mesma ordem de `GAMMA_TEMPLATE_IDS`. Se `GAMMA_TEMPLATE_IDS` estiver vazia, retornar `[]` sem chamar a API.
- [x] 2.2 Adicionar `app.get('/api/slides/templates', async (req, res) => { ... })` (próximo de `/api/estilos-visuais`, `server.js:1526-1555`) que chama `listarTemplatesGamma()` e retorna `res.json({ templates })`.

## 3. Seleção de template por curso (server.js)

- [x] 3.1 Adicionar `app.post('/api/slides/template', (req, res) => { ... })` (próximo de `/api/estilos-visuais/selecionar`, `server.js:1556-1567`): valida `templateId` presente em `GAMMA_TEMPLATE_IDS` (400 caso contrário), resolve o `title` correspondente (via `listarTemplatesGamma()` ou por uma chamada individual a `GET /gammas/{templateId}`), grava `sess.slidesTemplate = { id: templateId, title }`, chama `saveProject(sess)`, responde `{ ok: true, template: sess.slidesTemplate }`.
- [x] 3.2 Em `saveProject` (perto de `server.js:918-924`, junto de `estiloVisual`/`heygenConfig`), adicionar `projeto.slidesTemplate = sess.slidesTemplate || null;`.
- [x] 3.3 No carregamento de projeto (perto de `server.js:2725-2731`, junto da restauração de `estiloVisual`/`heygenConfig`), adicionar `sess.slidesTemplate = p.slidesTemplate || null;`. (Também foi necessário incluir `slidesTemplate` na resposta JSON de `POST /api/carregar-projeto`, `server.js:~2890`, que devolve os campos restaurados ao frontend — não estava listado explicitamente na tarefa, mas é indispensável para a tarefa 5.5 funcionar.)
- [x] 3.4 Em `GET /api/slides/parametros` (perto do guard de `estiloVisual`, `server.js:1630`), adicionar: se `GAMMA_TEMPLATE_IDS.length` e `!sess.slidesTemplate`, retornar 400 pedindo para escolher um template antes de continuar.

## 4. Payload do modo template (server.js)

- [x] 4.1 Adicionar a instrução fixa de preservação de marca como constante de módulo em `server.js` (texto literal fornecido pelo usuário: preservar as logos nos cantos superior direito e inferior esquerdo, alterar só os textos dos cards, inserir imagens relacionadas ao tema nos quadros reservados, com a explicação de cada imagem na caixa de texto abaixo dela).
- [x] 4.2 Alterar `criarGeracaoGamma(payload, client)` (`server.js:963-977`) para aceitar um terceiro parâmetro (ex.: `endpointPath = '/generations'`) e usar `${GAMMA_API_BASE}${endpointPath}` na chamada `fetch`, mantendo o comportamento atual como padrão quando o parâmetro não é passado.
- [x] 4.3 Em `GET /api/slides/gerar` (`server.js:1670-1739`), antes de montar o `payload` atual (`server.js:1685-1704`), ramificar em `if (sess.slidesTemplate)`: montar um `payload` alternativo com `gammaId: sess.slidesTemplate.id`, `prompt` (instrução fixa + público-alvo/tom/nível + instrução de quantidade de cards + `aula.texto` + observação da aula, quando preenchida) e `exportAs: 'pptx'`; caso contrário, manter o `payload` existente sem alterações.
- [x] 4.4 Chamar `criarGeracaoGamma(payload, client, sess.slidesTemplate ? '/generations/from-template' : '/generations')`, mantendo `aguardarGeracaoGamma` e todo o fluxo de persistência (`server.js:1709-1728`) inalterados.

## 5. Frontend — seleção de template na Etapa 8

- [x] 5.1 Em `public/index.html`, adicionar uma seção de seleção de template (ex.: `#slidesTemplateContainer` com lista `#slidesTemplateList` de itens rádio + botão de confirmação), seguindo o mesmo padrão visual de `#heygenAvataresList`/`#heygenVozesList` (`public/index.html:596-620`).
- [x] 5.2 Em `public/app.js`, implementar `carregarSlidesTemplates()` (análoga a `carregarHeygenConfig()`, `public/app.js:1086-1137`): chama `GET /api/slides/templates`; se a lista vier vazia, mantém a seção oculta e segue o fluxo atual sem alterações; se vier com itens, exibe a seção e renderiza os rádios (`id` como `value`, `title` como rótulo), pré-marcando o item já selecionado (`state.slidesTemplate`), se houver.
- [x] 5.3 Disparar `carregarSlidesTemplates()` no mesmo ponto em que a Etapa 8 é ativada/aberta (junto do carregamento do menu de estilos visuais).
- [x] 5.4 Implementar o handler de confirmação (equivalente a `btnConfirmarHeygenConfig`, `public/app.js:1139-1170`): lê o rádio selecionado, `POST /api/slides/template` com `{ templateId }`, atualiza `state.slidesTemplate` com a resposta.
- [x] 5.5 Restaurar `state.slidesTemplate` a partir dos dados do projeto ao recarregar (mesmo ponto de `state.heygenConfig`, `public/app.js:1472`).

## 6. Testes

- [x] 6.1 Em `tests/integration/`, criar um teste no padrão de `tests/integration/heygen-avatares-vozes-filtro-env.test.js` (env var setada antes do `require('../../server')`): com `GAMMA_TEMPLATE_IDS` definida, mocka `global.fetch` para `GET /v1.0/gammas/{id}` de cada ID configurado e verifica que `GET /api/slides/templates` retorna `{ id, title }` na ordem correta, e que um ID que falha na API é omitido sem quebrar a resposta. (`tests/integration/slides-template-gamma.test.js`)
- [x] 6.2 Testar `POST /api/slides/template`: seleção válida persiste em sessão/`projeto.json`; `templateId` fora de `GAMMA_TEMPLATE_IDS` retorna 400.
- [x] 6.3 Testar `GET /api/slides/parametros`: retorna 400 quando `GAMMA_TEMPLATE_IDS` está configurada e nenhum template foi selecionado; segue o fluxo normal quando `GAMMA_TEMPLATE_IDS` está vazia (comportamento atual). (O caso "vazia" já era coberto pela suíte pré-existente `tests/integration/slides-gamma.test.js`, que não define `GAMMA_TEMPLATE_IDS` e continuou passando sem alterações.)
- [x] 6.4 Testar `GET /api/slides/gerar`: com `sess.slidesTemplate` definido, chama `POST /generations/from-template` com `gammaId` e `prompt` esperados (incluindo a instrução fixa, conteúdo da aula e observação); sem `sess.slidesTemplate`, mantém exatamente o payload/endpoint atuais (`POST /generations` — já coberto pela suíte pré-existente `tests/integration/slides-gamma.test.js`).
- [x] 6.5 Rodar `npm test` e `npm run test:coverage` e confirmar suíte verde e gate de 40% de cobertura mantido. (305/305 testes, cobertura de linhas 71.89% — acima do gate de 40%.)

## 7. Correção pós-uso: nunca cachear "sem templates" no cliente + controle "Trocar template"

Reportado pelo usuário: a Etapa 8 gerou os slides direto, sem abrir a tela
de seleção, mesmo com `GAMMA_TEMPLATE_IDS` configurada. Causa raiz dupla:
(1) o servidor Node precisa ser reiniciado depois de editar `.env` para
`GAMMA_TEMPLATE_IDS` ser lida (comportamento já existente do projeto para
qualquer variável de ambiente, não específico desta feature); (2)
`carregarSlidesTemplates()` cacheava `state.slidesTemplatesIndisponiveis`
no primeiro resultado vazio e nunca mais consultava o servidor de novo na
mesma sessão do navegador — se o usuário configurasse o `.env` e
reiniciasse o servidor sem recarregar a página, o cliente continuava
pulando a tela mesmo com templates já disponíveis. Também não havia
nenhuma forma de trocar um template já selecionado (diferente do padrão já
existente para avatar/voz do HeyGen, `btnTrocarHeygenConfig`).

- [x] 7.1 Em `public/app.js`, remover o cache `state.slidesTemplatesIndisponiveis`: o clique em "Gerar Slides" volta a consultar `GET /api/slides/templates` sempre que não há template selecionado nesta sessão (`state.slidesTemplate` ausente), em vez de confiar em um resultado vazio obtido anteriormente.
- [x] 7.2 Em `public/index.html`, adicionar o botão `#btnTrocarSlidesTemplate` no cabeçalho de `#slidesParametrosCard`, mesmo padrão de `#btnTrocarHeygenConfig` (Etapa 10).
- [x] 7.3 Em `public/app.js`, implementar o handler de `#btnTrocarSlidesTemplate`: reabre `carregarSlidesTemplates({ interativo: true })` (que agora aceita esse modo — avisa em vez de pular a etapa quando não há templates configurados) e, ao confirmar, `prosseguirParaEstiloVisual(state.slidesIndex ?? 0)` retorna à mesma aula em revisão, não reinicia da aula 1.
- [x] 7.4 Em `abrirParametrosSlides()`, exibir `#btnTrocarSlidesTemplate` somente quando `state.slidesTemplate` estiver definido (funcionalidade configurada).
- [x] 7.5 Atualizar `specs/slides-generation/spec.md` desta change com a nova requirement "Troca do template selecionado durante o curso" e um cenário reforçando que o cliente nunca assume "sem templates" sem reconsultar o servidor.
- [x] 7.6 Rodar `npm test` (305/305 verde) e verificação manual: `node --check` em `public/app.js`/`server.js` sem erros; servidor sobe e `GET /api/slides/templates` responde. **Não foi feita verificação end-to-end em navegador** (fluxo completo até a Etapa 8 exige percorrer as Etapas 1–5 com chamadas reais de IA) — recomenda-se o usuário testar manualmente após reiniciar o servidor.
