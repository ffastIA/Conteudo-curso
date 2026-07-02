## Why

Na Etapa 6, o upload do `.docx` de revisão retorna "0 aulas identificadas" quando a sessão em memória não tem `conteudoPorAula` populado — o que acontece sempre que o usuário recarrega a página, o servidor reinicia, ou acessa a etapa diretamente sem passar por "Carregar Projeto". O arquivo enviado pode conter observações válidas para todas as aulas, mas nenhuma é processada. Resolve parcialmente o Gap G04 (sessão in-memory perdida ao reiniciar).

## What Changes

- `POST /api/aplicar-melhorias`: adiciona fallback que auto-popula `sess.conteudoPorAula` a partir do disco antes de processar o `.docx`, usando `sess.aulas` se disponível ou relendo `projeto.json` caso contrário.
- `GET /api/aplicar-melhorias/confirmar`: aplica o mesmo fallback para garantir que a aplicação das melhorias também funcione sem sessão pré-carregada.
- Ambos os handlers retornam erro 400 claro (`"Carregue o projeto antes de aplicar melhorias."`) se o projeto não puder ser inferido de nenhuma fonte.

## Capabilities

### New Capabilities

- `session-auto-restore`: Capacidade de restaurar automaticamente `conteudoPorAula` a partir do disco nos handlers da Etapa 6, sem exigir que o usuário passe explicitamente por "Carregar Projeto".

### Modified Capabilities

- `improvement-application-cycle`: O ciclo de aplicação de melhorias passa a tolerar sessão vazia, recuperando estado do disco antes de processar o `.docx` enviado.

## Impact

- **`server.js`**: handlers `POST /api/aplicar-melhorias` e `GET /api/aplicar-melhorias/confirmar`
- **Sem mudanças no cliente** (`public/app.js`, `public/index.html`)
- **Sem novos endpoints** ou alterações de contrato da API
- **Sem dependências novas**

## Non-goals

- Não resolve o Gap G04 completamente — sessões seguem in-memory; o fallback cobre apenas os handlers da Etapa 6.
- Não adiciona persistência de sessão entre reinicializações para outras etapas.
- Não altera a lógica de extração de observações do `.docx` nem o prompt da skill `aplicarMelhoriasSkill`.
