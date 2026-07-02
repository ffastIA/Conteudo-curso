## Context

O sistema usa sessões in-memory (Gap G04). A função `restoreConteudoPorAula(sess)` foi introduzida pelo change `fix-aplicar-melhorias-session-fallback` e implementa uma cascata de restauração:

1. Se `sess.conteudoPorAula` já está populado → retorna imediatamente (sem custo)
2. Se `sess.aulas` está disponível → lê `aula{NN}_conteudo.txt` do disco e reconstrói `conteudoPorAula`
3. Se `sess.aulas` também está vazio mas `sess.config.nome` existe → lê `projeto.json` do disco, popula `sess.aulas` e depois repete o passo 2
4. Se nenhuma fonte encontrada → retorna sem modificar a sessão (o guard subsequente emite o erro correto)

Essa função já era chamada nos dois handlers da Etapa 6. O handler da Etapa 5★ (`GET /api/revisao-qualidade`) simplesmente não tinha a chamada.

## Goals / Non-Goals

**Goals:**
- Tornar `GET /api/revisao-qualidade` resiliente à perda de sessão, com o mesmo padrão já usado na Etapa 6

**Non-Goals:**
- Alterar `restoreConteudoPorAula` — funciona corretamente como está
- Aplicar restauração em outros endpoints que ainda não têm esse tratamento

## Decisions

**Reutilizar `restoreConteudoPorAula` sem modificação:** A função já cobre todos os cenários necessários (sessão parcial, sessão vazia com projeto.json, projeto não encontrado). Criar uma variação seria duplicação desnecessária.

**Uma linha de mudança:** Inserir `restoreConteudoPorAula(sess)` imediatamente antes do guard `if (!sess.conteudoPorAula?.length)`, seguindo o padrão idêntico dos handlers de Etapa 6.

## Risks / Trade-offs

**Leitura de disco em toda requisição com sessão vazia** → custo mínimo; ocorre apenas quando a sessão está realmente vazia, e o acesso é a arquivos locais já existentes. Mitigação: a função retorna imediatamente se `conteudoPorAula` já está populado.
