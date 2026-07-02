## Context

A Etapa 6 tem dois handlers críticos em `server.js`:

- `POST /api/aplicar-melhorias` — recebe o `.docx` anotado e extrai as observações por aula
- `GET /api/aplicar-melhorias/confirmar` — aplica as melhorias geradas pela IA

Ambos dependem de `sess.conteudoPorAula` (array em memória com título, objetivos e texto de cada aula). Esse array é populado em dois momentos: ao completar a Etapa 5 (`GET /api/conteudo`) ou ao carregar um projeto existente (`POST /api/carregar-projeto`).

O problema: sessões são in-memory. Qualquer evento que quebre a sessão (refresh, restart do servidor, nova aba) zera o array. Os dados estão em disco (`scr/aula{NN}_conteudo.txt`, `scr/projeto.json`) mas o código não tem fallback para buscá-los.

## Goals / Non-Goals

**Goals:**
- Handlers da Etapa 6 devem funcionar mesmo com sessão vazia, desde que os dados existam em disco
- Fallback transparente: nenhuma mudança de contrato de API ou de UX
- Erro claro quando o projeto não puder ser inferido de nenhuma fonte

**Non-Goals:**
- Não resolve o Gap G04 para outras etapas — escopo restrito aos handlers da Etapa 6
- Não adiciona persistência de sessão real (ex.: Redis, arquivo de sessão)
- Não altera a lógica de extração de observações nem os prompts de IA

## Decisions

### Decisão 1: Restaurar via `sess.aulas` → `projeto.json` (dois estágios)

O fallback opera em cascata:

1. Se `sess.conteudoPorAula` já existe → usa diretamente (caminho normal)
2. Se `sess.aulas` existe mas `conteudoPorAula` está vazio → popula lendo `aula{NN}_conteudo.txt` do disco via `readMemory`
3. Se nem `sess.aulas` existe mas `sess.config.nome` está disponível → relê `projeto.json` do disco, popula `sess.aulas` e depois `conteudoPorAula`
4. Se nenhum fallback funcionar → erro 400

**Alternativa considerada:** extrair número de aulas diretamente do texto do `.docx` (contando ocorrências de `Aula N:`). Descartada porque os handlers de confirmação também precisam de `aula.objetivos` e `aula.texto` para o prompt da IA — não apenas do título.

### Decisão 2: Extração helper `restoreConteudoPorAula(sess)`

A lógica de restauração é idêntica nos dois handlers. Extrair para uma função síncrona evita duplicação:

```js
function restoreConteudoPorAula(sess) {
  if (sess.conteudoPorAula?.length) return; // já OK

  if (!sess.aulas?.length && sess.config?.nome) {
    try {
      const p = JSON.parse(fs.readFileSync(
        path.join(courseScrDir(sess), 'projeto.json'), 'utf-8'
      ));
      if (p.aulas?.length) {
        sess.aulas = p.aulas;
        if (p.config) Object.assign(sess.config, p.config);
      }
    } catch { /* projeto.json indisponível */ }
  }

  if (sess.aulas?.length) {
    sess.conteudoPorAula = sess.aulas.map((aula, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return { ...aula, texto: readMemory(sess, `aula${idx}_conteudo`) };
    });
  }
}
```

Chamada no início de cada handler, antes de qualquer lógica de negócio.

### Decisão 3: `Object.assign` com prioridade para dados já na sessão

Ao reler `projeto.json`, mergeamos com `sess.config` já existente usando `Object.assign(sess.config, p.config)` — dessa forma os campos já presentes na sessão têm precedência (ex.: `pastaProjeto` pode ter sido definido pelo usuário na sessão atual).

## Risks / Trade-offs

| Risco | Mitigação |
|---|---|
| `projeto.json` corrompido causa silêncio | O `try/catch` garante que o handler não quebra; se `conteudoPorAula` seguir vazio, o erro 400 é retornado |
| `readMemory` lê arquivos grandes (conteúdo por aula) de forma síncrona | Já é o padrão existente em `carregar-projeto`; impacto aceitável dado que é chamado uma vez por sessão |
| Sessão sem `config.nome` e sem `config.pastaProjeto` não consegue localizar o projeto em disco | O erro 400 orienta o usuário a carregar o projeto primeiro — comportamento mais correto que silêncio |

## Migration Plan

- Mudança não-breaking: handlers existentes são apenas enriquecidos com lógica de fallback no início
- Deploy: substituição direta de `server.js`, sem migração de dados ou schema
- Rollback: reverter as linhas adicionadas em cada handler
