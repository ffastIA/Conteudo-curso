## Context

`escolherPastaWindows()` (`server.js:180-200`) executa, via `child_process.execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script], ...)`, um script que abre `System.Windows.Forms.FolderBrowserDialog` e retorna o caminho escolhido. O script atual:

```powershell
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Selecione a pasta do projeto'
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $f.SelectedPath
}
```

`$f.ShowDialog()` sem argumento cria uma janela sem "owner" (proprietária). Como o processo PowerShell que a cria é um filho do processo Node do servidor — não tem nenhuma relação com o processo do navegador nem está em primeiro plano no momento em que é lançado —, o Windows aplica seu mecanismo de "focus stealing prevention": a janela é criada e aceita entrada normalmente, mas não é trazida automaticamente para frente. Ela fica atrás do navegador (ou apenas pisca na barra de tarefas), tornando a funcionalidade, na prática, invisível ao usuário.

Isso foi confirmado neste ambiente antes de qualquer alteração:
- `Add-Type -AssemblyName System.Windows.Forms` e a instanciação de `FolderBrowserDialog` funcionam sem erro (não é problema de carregamento de assembly).
- A técnica de capturar a janela em primeiro plano via P/Invoke e usá-la como owner do diálogo compila e executa corretamente através do mesmo mecanismo de invocação já usado em produção (`execFile` com `-Command` recebendo um script multilinha).

## Goals / Non-Goals

**Goals:**
- O diálogo nativo de seleção de pasta aparece de forma confiável em primeiro plano, sobre o navegador.
- Nenhuma mudança de contrato de API ou de código cliente.

**Non-Goals:**
- Suporte a múltiplos monitores/cenários exóticos de foco além do caso comum (navegador em primeiro plano no momento do clique).
- Suporte a sistemas operacionais além do Windows.

## Decisions

### (Histórico — substituído em 2026-07-02) Capturar a janela em primeiro plano via P/Invoke

A primeira versão desta correção usava `GetForegroundWindow()` (P/Invoke `user32.dll`, compilado inline via `Add-Type -TypeDefinition`) para obter o HWND do navegador e usá-lo como `owner` cross-process do `FolderBrowserDialog`. Essa abordagem se mostrou **frágil em produção**: um usuário reportou que o clique no botão passou a travar o servidor por 120s e retornar `Command failed: ...` sem nenhuma mensagem de erro real. Investigação reproduziu o problema isoladamente: com um `owner` cross-process, `ShowDialog(owner)` tem comportamento inconsistente — em alguns casos retorna quase instantaneamente sem exibir nada de fato (o bug original que esta mudança tentava corrigir), em outros abre e bloqueia corretamente, mas de forma invisível ao usuário (que nunca vê o diálogo para fechá-lo), até estourar o timeout de 120s do `execFile`. Ou seja, a técnica documentada de "capturar a janela em primeiro plano" depende de um timing e de uma relação entre processos (PowerShell dono de um diálogo cujo owner é uma janela de OUTRO processo, o navegador) que não se comportou de forma confiável neste ambiente.

### Form invisível TopMost como owner (decisão atual)

```powershell
Add-Type -AssemblyName System.Windows.Forms

$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = 'CenterScreen'
$owner.Width = 0
$owner.Height = 0
$owner.ShowInTaskbar = $false
[void]$owner.Show()
[void]$owner.Focus()

$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Selecione a pasta do projeto'

$result = $f.ShowDialog($owner)
$owner.Close()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $f.SelectedPath
}
```

- *Por que:* em vez de depender de identificar e possuir corretamente o HWND de um processo externo (o navegador), cria-se um `Form` invisível de tamanho zero, pertencente ao PRÓPRIO processo PowerShell que exibe o diálogo, com `TopMost = $true`. `TopMost` é uma propriedade nativa do Win32/WinForms que força a janela (e qualquer diálogo por ela possuído) a ficar acima de todas as outras janelas do sistema, independentemente de qual processo está em foco no instante em que o script roda — elimina totalmente a dependência de timing/foreground-window que causava o comportamento inconsistente da abordagem anterior.
- *Vantagem adicional:* não exige mais compilar código C# inline via `Add-Type -TypeDefinition` (nem o parâmetro `-ReferencedAssemblies` que isso exigia) — apenas `Add-Type -AssemblyName System.Windows.Forms`, já usado no restante do script. Menos superfície de falha (sem P/Invoke, sem compilação just-in-time do compilador C#).
- *`[void]` em `.Show()`/`.Focus()`:* esses métodos retornam valores (`Focus()` retorna `bool`) que, sem supressão, vazariam para o stdout capturado pelo servidor via `execFile` — poderiam ser confundidos com o caminho de pasta selecionado. `[void]` descarta esses retornos.
- *Reavaliação da alternativa antes rejeitada:* esta técnica havia sido considerada e descartada na primeira versão desta mudança por "forçar o diálogo a ficar sempre no topo, em vez de posicioná-lo especificamente sobre a janela de onde a ação partiu" — na prática, esse é exatamente o comportamento desejado (o diálogo deve aparecer visível para o usuário, custe o que custar, mesmo que isso signifique ficar acima de outras janelas não relacionadas por um instante) e, ao contrário do receio original, não há nenhum efeito colateral perceptível: o form dono é invisível (0x0, sem taskbar) e é fechado (`$owner.Close()`) assim que o diálogo retorna.

## Risks / Trade-offs

- [Risco] O erro observado em produção (`err.killed`/`SIGTERM` após 120s sem stderr) é difícil de diferenciar de outras falhas silenciosas só pela mensagem de erro → Mitigação: `GET /api/escolher-pasta` agora anexa `stderr` (quando presente) a `err.message` antes de logar, e o padrão "mensagem termina exatamente no fim do script, sem texto após" é agora um sinal reconhecível de timeout/kill em vez de erro de sintaxe.
- [Risco] Se `execFile` matar o processo via timeout (usuário nunca interage com o diálogo em 120s), o `powershell.exe` pode ocasionalmente permanecer como processo órfão em vez de encerrar de fato (observado durante os testes desta correção) → Aceito como trade-off não resolvido nesta mudança; documentado como follow-up em `tasks.md` (considerar `taskkill /T` para matar a árvore de processos, se isso se mostrar um problema recorrente na prática).

## Migration Plan

Mudança server-only, isolada a uma função. Sem alteração de schema/contrato. Deploy como atualização normal de `server.js`. Rollback trivial: reverter o diff.
