## Why

Os botões "📁 Procurar..." (Etapa 1) e "📁 Selecionar pasta do projeto" (Etapa 0) — que abrem o seletor nativo de pasta do Windows — não parecem executar nenhuma ação quando clicados. Investigação e testes diretos neste ambiente confirmaram a causa: `escolherPastaWindows()` chama `$f.ShowDialog()` sem especificar uma janela "owner". Como o diálogo é aberto por um processo PowerShell filho do servidor Node (sem nenhuma janela em primeiro plano associada), o mecanismo de "focus stealing prevention" do Windows impede que ele apareça sobre o navegador — o diálogo é criado e fica esperando interação, mas abre invisível atrás da janela do navegador (ou piscando na barra de tarefas). Do ponto de vista do usuário isso é indistinguível de "o botão não faz nada".

## What Changes

- `escolherPastaWindows()` (server.js) passa a capturar a janela em primeiro plano no momento da chamada (via P/Invoke `user32.dll GetForegroundWindow`) e usá-la como "owner" do diálogo (`$f.ShowDialog($owner)`), garantindo que o Windows o traga para frente, associado à janela do navegador que estava ativa quando o usuário clicou no botão.
- Fallback defensivo: se a captura da janela em primeiro plano falhar por qualquer motivo, o código degrada graciosamente para o comportamento atual (`ShowDialog()` sem owner) em vez de quebrar a funcionalidade inteira.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `native-folder-picker`: o diálogo nativo de seleção de pasta passa a ser exibido em primeiro plano de forma confiável, associado à janela ativa no momento da chamada.

## Impact

- `server.js`: função `escolherPastaWindows()` (~linhas 180-200) — script PowerShell reescrito para capturar e usar a janela em primeiro plano como owner do diálogo.
- Nenhuma mudança de contrato: `GET /api/escolher-pasta` continua retornando `{ pasta: caminho | null }` exatamente como hoje; nenhuma mudança necessária em `public/app.js` (`escolherPasta()`, `btnSelecionarPastaProjeto`, `btnProcurarPastaProjeto` continuam funcionando com a mesma interface).
- Sem dependências npm novas — usa apenas PowerShell/.NET já disponíveis no Windows (P/Invoke para `user32.dll`, já uma prática padrão em scripts PowerShell).

## Non-goals

- Não altera a arquitetura de "servidor abre o diálogo nativo" nem introduz suporte a outros sistemas operacionais (continua Windows-only, com fallback de texto manual já existente para qualquer falha).
- Não resolve, se existir, o caso extremo em que o usuário troca o foco para outra janela entre o clique no botão e o momento em que o script PowerShell efetivamente executa (janela de tempo muito curta, na prática imperceptível).
