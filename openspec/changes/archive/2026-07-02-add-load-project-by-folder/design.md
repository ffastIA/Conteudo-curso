## Context

A aplicação roda como um servidor Node/Express local (`localhost:3000`, sem autenticação — gap conhecido G02), acessado por um navegador na mesma máquina. Isso é uma restrição fundamental para o design deste change: qualquer mecanismo de "escolher uma pasta" precisa lidar com o fato de que **navegadores não expõem caminhos absolutos de arquivos/pastas ao JavaScript da página**, por design de segurança:

- `<input type="file" webkitdirectory>` dá acesso a uma lista de `File` com `webkitRelativePath` (relativo à pasta escolhida), mas nunca ao caminho absoluto real no disco.
- A File System Access API (`showDirectoryPicker()`) dá um `FileSystemDirectoryHandle`, útil para ler/escrever arquivos a partir do PRÓPRIO navegador, mas não fornece uma string de caminho absoluto utilizável por um processo Node separado (o backend) para `fs.writeFileSync`.
- `File.path` (que exporia o caminho absoluto) só existe em builds do Electron, não em navegadores comuns.

Como o backend Node é quem efetivamente grava os arquivos em disco (`courseRootDir`/`persistStage`), ele precisa de uma string de caminho absoluto real, não um handle do navegador. A solução viável, dado que servidor e navegador rodam na mesma máquina/sessão de usuário, é o **próprio servidor Node abrir o diálogo nativo do sistema operacional** — não o navegador — e devolver o caminho escolhido ao cliente via API.

## Goals / Non-Goals

**Goals:**
- Um diálogo nativo de seleção de pasta do Windows, disparado a partir do clique de um botão na página, retornando um caminho absoluto real utilizável pelo backend.
- Um fluxo de carregamento de projeto por caminho de pasta explícito, substituindo a lista automática baseada em índice.
- `pastaProjeto` obrigatória, sem fallback silencioso para pasta interna.
- Cards de arquivos refletindo o estado real do disco no momento do carregamento.

**Non-Goals:**
- Suporte a sistemas operacionais além do Windows para o diálogo nativo.
- Qualquer forma de deploy remoto/multi-usuário para este mecanismo (ver Riscos).

## Decisions

### Diálogo nativo via PowerShell + System.Windows.Forms, disparado pelo servidor

Novo endpoint `GET /api/escolher-pasta`: o servidor executa (via `child_process.execFile` ou `spawn`) um comando PowerShell em modo `-STA` (obrigatório para diálogos do WinForms funcionarem corretamente) que instancia `System.Windows.Forms.FolderBrowserDialog`, exibe o diálogo e escreve o caminho escolhido em stdout:

```javascript
const { execFile } = require('child_process');

function escolherPastaWindows() {
  return new Promise((resolve, reject) => {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $f = New-Object System.Windows.Forms.FolderBrowserDialog
      $f.Description = 'Selecione a pasta do projeto'
      if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $f.SelectedPath
      }
    `;
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { timeout: 120_000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim() || null); // null = usuário cancelou
    });
  });
}
```

`GET /api/escolher-pasta` chama essa função e responde `{ pasta: caminho ou null }`. Em caso de erro (PowerShell indisponível, política de execução bloqueada, timeout), responde com um erro claro (ex.: `{ error: 'Não foi possível abrir o seletor de pasta. Digite o caminho manualmente.' }`), e o cliente mantém o campo de texto editável normalmente — nunca bloqueia o usuário.

- *Por que:* é a única forma de obter um caminho absoluto real a partir de um clique na página, dado que o servidor roda localmente na mesma máquina do usuário. Não requer nenhuma dependência npm nova (PowerShell e `System.Windows.Forms` já fazem parte do Windows).
- *Alternativa considerada:* `<input type="file" webkitdirectory>` no navegador. Rejeitada — não fornece caminho absoluto, apenas nomes relativos, inutilizável para o backend gravar arquivos no local certo.
- *Alternativa considerada:* migrar a aplicação para Electron, que exporia `dialog.showOpenDialog` nativamente. Rejeitada por ser uma mudança de arquitetura desproporional ao problema (reescrever o empacotamento inteiro da aplicação só para um seletor de pasta).
- *Alternativa considerada:* pacote npm de diálogo nativo (ex. wrappers de Electron/Tauri para Node puro). Rejeitados — não há um pacote maduro e leve que funcione de forma confiável em Node puro sem trazer um runtime adicional; o script PowerShell inline é mais simples e não adiciona dependências.

### `POST /api/carregar-projeto` aceita caminho de pasta, não mais slug

```javascript
app.post('/api/carregar-projeto', (req, res) => {
  const sess = getSession(req, res);
  const { pasta } = req.body || {};
  if (!pasta?.trim()) return res.status(400).json({ error: 'pasta obrigatória' });
  const baseDir = path.resolve(pasta.trim());
  if (!fs.existsSync(baseDir)) return res.status(404).json({ error: 'Pasta não encontrada' });

  // mesma lógica de leitura de projeto.json / fallback legado já existente,
  // SEM nenhuma consulta a índice global.
  ...
  sess.config.pastaProjeto = baseDir; // a pasta escolhida É a pastaProjeto, sempre
  ...
  const arquivos = listarArquivosDoProjeto(baseDir); // novo: escaneamento real do disco
  res.json({ ok: true, ..., arquivos });
});
```

- *Por que `sess.config.pastaProjeto = baseDir` incondicionalmente:* a pasta que o usuário acabou de selecionar é, por definição, onde o projeto está — não importa o que o `projeto.json` daquela pasta diga sobre si mesmo (poderia estar vazio, por causa do bug já corrigido em `fix-pastaprojeto-persist-on-config`, ou desatualizado por qualquer outro motivo). Isso torna o carregamento autocurativo: basta o usuário reabrir um projeto antigo afetado pela `pastaProjeto` vazia para que, a partir dali, tudo volte a ser salvo no lugar certo.

### Cards de arquivos a partir de escaneamento real do disco, não de `stages`

Nova função `listarArquivosDoProjeto(baseDir)`: lista os `.docx` na raiz de `baseDir` e os `.txt` em `baseDir/scr`, mapeando para os nomes de etapa conhecidos (`ementa`, `pesquisa`, `plano_de_ensino`, `plano_de_aula`, `revisao_qualidade`, `aula{NN}_conteudo`, etc.) e retornando essa lista para o cliente renderizar como cards.

- *Por que não usar `projeto.json.stages`:* essa lição já foi aprendida nesta sessão — metadados gravados em um momento podem divergir do que realmente existe em disco (arquivos apagados manualmente, projeto.json desatualizado). Escanear o disco de verdade é a única fonte que não pode mentir.

### `pastaProjeto` obrigatória em `POST /api/config`

```javascript
if (!pastaProjeto?.trim()) return res.status(400).json({ error: 'O campo pasta do projeto é obrigatório.' });
```
Adicionado junto às validações já existentes de `modalidade`/`proporcaoTeoricoPratico` (mesmo padrão). O fallback `courseRootDir(sess) = pastaProjeto?.trim() || saídas/{slug}` (`server.js:163-167`) permanece no código por segurança/compatibilidade com projetos legados já carregados numa sessão sem essa validação ter passado (ex.: projetos "legado" carregados via o fallback de `projeto.json` ausente), mas se torna inatingível para qualquer projeto NOVO criado a partir deste change.

## Risks / Trade-offs

- [Risco] O mecanismo de diálogo nativo só funciona porque servidor e navegador estão na mesma máquina; se a aplicação for um dia exposta remotamente (multi-usuário), o diálogo abriria no desktop do SERVIDOR, não do usuário remoto → Mitigação: documentar essa constraint explicitamente (ligada ao gap G02, ausência de autenticação/deploy remoto); se um dia a aplicação for multi-usuário, este endpoint precisa ser revisto/removido antes.
- [Risco] PowerShell com política de execução restritiva (`Restricted`) pode bloquear o script → Mitigação: o comando usa `-Command` inline (não um arquivo `.ps1` salvo em disco), o que geralmente não é afetado pela política de execução de scripts (que se aplica a arquivos `.ps1`); mesmo assim, qualquer falha cai no fallback de texto manual.
- [Risco] Tornar `pastaProjeto` obrigatória é uma mudança que quebra o fluxo de quem já estava acostumado a deixá-la em branco → Mitigação: é exatamente o comportamento antigo que causou a confusão relatada pelo usuário; a obrigatoriedade é intencional.
- [Risco] Usuários perdem a visão "todos os meus projetos de uma vez" que a lista automática oferecia → Mitigação: aceito conscientemente (mesmo trade-off documentado em `remove-projects-index-json`); cabe ao usuário organizar suas pastas de projeto.

## Migration Plan

Mudança server + client. Sem alteração de schema. Deploy como atualização normal. Projetos legados (pastaProjeto vazia) continuam abríveis pelo fallback "legado" já existente; ao serem abertos pela nova interface, sua `pastaProjeto` é corrigida automaticamente a partir da pasta selecionada, sem necessidade de migração manual de dados.

## Open Questions

- Deve haver um limite de timeout mais curto para o processo PowerShell (hoje sugerido 120s) para não deixar a requisição HTTP pendurada indefinidamente se o usuário demorar para interagir com o diálogo? Recomenda-se manter um valor alto (o usuário pode demorar para navegar até a pasta certa), mas vale revisitar com uso real.
