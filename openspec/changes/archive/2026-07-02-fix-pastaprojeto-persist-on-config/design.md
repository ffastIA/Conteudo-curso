## Context

`POST /api/config` (`server.js:466-514`) é o único endpoint que recebe o campo `pastaProjeto` do formulário da Etapa 1. Hoje ele:

1. Valida e cria a pasta (se preenchida) — `server.js:473-485`.
2. Calcula `conteudoMudou` a partir de campos pedagógicos, deliberadamente SEM incluir `pastaProjeto` (`server.js:488-489`).
3. Substitui `sess.config` inteiro pelo body recebido (`server.js:491`) — atualização em memória, sempre acontece.
4. Só chama `persistStage('ementa', ...)` → `saveProject()` dentro do `if (!sess.ementa || conteudoMudou)` (`server.js:495-511`) — ou seja, só grava em disco quando a ementa precisa ser (re)gerada.

`saveProject(sess, stageInfo)` (`server.js:209-249`) é a função que grava `projeto.json` (dentro de `courseScrDir(sess)`) e atualiza o índice global `saídas/index.json` com `{ nome, pastaProjeto, ultimaModificacao }`. Ela não depende de `stageInfo` (pode ser chamada com `saveProject(sess)`, sem segundo argumento) e já é usada dessa forma implicitamente sempre que qualquer etapa é persistida.

`POST /api/carregar-projeto` (`server.js:1014-1090`) decide de qual diretório ler o projeto EXCLUSIVAMENTE a partir de `saídas/index.json[slug].pastaProjeto` (`server.js:1022-1026`) — nunca a partir do `projeto.json` do próprio curso (que só é lido depois de `baseDir` já escolhido). Isso significa que, se o índice nunca foi atualizado com o valor real, a sessão restaurada sempre volta a usar `saídas/{slug}/`, mesmo que o usuário tenha configurado uma pasta externa em algum momento.

## Goals / Non-Goals

**Goals:**
- Qualquer alteração de `pastaProjeto` via `POST /api/config` é refletida em `projeto.json` e `saídas/index.json` imediatamente, na mesma requisição, sem depender de uma regeneração de ementa ou de qualquer outra etapa rodar depois.
- Isso vale tanto para a primeira configuração de um curso novo (pastaProjeto preenchida desde o início) quanto para uma alteração posterior num curso que já tem ementa.

**Non-Goals:**
- Não implementa retry/fallback caso a escrita em disco falhe (comportamento de erro segue o mesmo padrão já usado em `saveProject`, que apenas loga o erro via `console.error` e não interrompe a resposta ao cliente — consistente com o resto do código).
- Não migra registros já existentes de `saídas/index.json` que ficaram com `pastaProjeto` vazio por este bug — o usuário precisa reconfigurar a pasta desses projetos afetados uma vez, o que já vai disparar a correção.
- Não resolve o gap G04 (persistência de sessão em memória) de forma geral.

## Decisions

### Persistir `pastaProjeto` de forma incondicional, comparando com o valor anterior

Capturar o valor anterior de `sess.config.pastaProjeto` ANTES de `sess.config = req.body` sobrescrever a config, e comparar com o novo valor recebido. Se mudou, chamar `saveProject(sess)` imediatamente — antes do bloco de regeneração de ementa, para não depender do resultado (sucesso/falha) dessa chamada à OpenAI.

```javascript
const pastaProjetoAnterior = (sess.config.pastaProjeto || '').trim();

// ...validação existente (linhas 473-485)...

const camposConteudo = ['nome', 'publico', 'carga', 'duracao', 'nivel', 'objetivos'];
const conteudoMudou = camposConteudo.some(k => (req.body[k] || '') !== (sess.config[k] || ''));

sess.config = req.body;

if ((pastaProjeto || '').trim() !== pastaProjetoAnterior) {
  saveProject(sess);
}

if (!sess.ementa || conteudoMudou) {
  // ...bloco existente de geração de ementa (chama persistStage/saveProject de novo, sem problema)...
}
```

- *Por que:* é a correção mínima e direta na origem do problema — `pastaProjeto` passa a ter seu próprio gatilho de persistência, independente do fluxo de regeneração de ementa, preservando a intenção original (documentada no comentário existente) de não reprocessar o pipeline inteiro só por causa dessa mudança.
- *Alternativa considerada:* incluir `pastaProjeto` na lista `camposConteudo`, forçando `conteudoMudou = true` e regenerando a ementa sempre que a pasta mudar. Rejeitada por contradizer a intenção original do código (gastar uma chamada à OpenAI desnecessária só para persistir um caminho de pasta) e por ser mais custoso (tempo + tokens) sem necessidade.
- *Alternativa considerada:* fazer `POST /api/carregar-projeto` também considerar o `pastaProjeto` salvo dentro do `projeto.json` de `saídas/{slug}/scr/`, além do índice global, como uma segunda fonte de verdade. Rejeitada por adicionar complexidade de resolução de conflito (qual fonte prevalece?) para tratar um sintoma, quando a causa raiz (índice nunca atualizado) é simples de corrigir na origem.

### Chamar `saveProject(sess)` mesmo quando `sess.config.nome` ainda não existia antes desta requisição

Como `saveProject` já tem sua própria guarda (`if (!sess.config?.nome) return;`, `server.js:210`), não é necessário nenhum cuidado extra: se o `nome` vier vazio nesta submissão (não deveria, já que é campo obrigatório no formulário), a chamada simplesmente não faz nada, sem erro.

## Risks / Trade-offs

- [Risco] Chamar `saveProject` em toda submissão onde `pastaProjeto` muda adiciona uma escrita de disco síncrona extra a mais no caminho de `POST /api/config` → Mitigação: é uma operação rápida (dois `writeFileSync` pequenos) e só ocorre quando o valor realmente muda, não em toda submissão.
- [Risco] Usuários com projetos já afetados (índice já gravado com `pastaProjeto` vazio antes desta correção) continuam com o registro antigo até reconfigurarem a pasta uma vez → Mitigação: aceitável (ver Non-Goals); a primeira vez que reconfigurarem, a correção entra em vigor e o registro é corrigido permanentemente.

## Migration Plan

Mudança server-only, sem alteração de schema. Deploy como atualização normal de `server.js`; nenhuma migração de dados necessária (arquivos `index.json`/`projeto.json` existentes continuam válidos, apenas passam a ser atualizados corretamente daqui em diante). Rollback trivial: reverter o diff.
