## 1. Frontend (public/app.js)

- [x] 1.1 Extrair `clearSpinner(panel)` da lógica duplicada em `addLog`/`finishLog`
- [x] 1.2 `addLog`/`finishLog` passam a chamar `clearSpinner(panel)`
- [x] 1.3 Chamar `clearSpinner(logPanel)` no handler `done` do `streamSSE()` genérico
- [x] 1.4 Chamar `clearSpinner(logPanel)` no handler `done` customizado de Slides (`btnGerarSlidesAula`)
- [x] 1.5 Chamar `clearSpinner(logPanel)` no handler `done` customizado do envio ao HeyGen (`btnEnviarHeygen`)

## 2. Verificação

- [x] 2.1 `node -c public/app.js` sem erro de sintaxe
- [x] 2.2 `npm test` completo — 291/291 passando (mudança de UI pura, sem teste automatizado dedicado, ver Non-Goals)
- [x] 2.3 Confirmado servidor local servindo o `app.js` atualizado
