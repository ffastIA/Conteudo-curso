## Why

O sistema gera um arquivo `conteudo.docx` / `conteudo.txt` consolidado que agrupa todo o conteúdo de todas as aulas em um único documento. Esse arquivo é redundante: o usuário já dispõe dos arquivos individuais de cada aula (`aula01_conteudo.docx`, `aula02_conteudo.docx`, etc.) e do `conteudo_final.docx` gerado ao concluir. Manter o arquivo consolidado desperdiça I/O, ocupa espaço e cria confusão sobre qual documento é o "oficial".

## What Changes

- **Remover** a chamada `persistStage(sess, 'conteudo', ...)` de `GET /api/conteudo` (Etapa 5 — geração inicial)
- **Remover** a chamada `persistStage(sess, 'conteudo', ...)` de `GET /api/aplicar-melhorias/confirmar` (Etapa 6 — aplicação de melhorias)
- **Remover** `sess.conteudo = fullText` das etapas acima (o campo de sessão consolidado deixa de ser necessário como referência de arquivo; mantido apenas internamente para `finalizar-conteudo`)
- **Manter** intactas as chamadas de `persistStage` dos arquivos individuais de aula (`aula{NN}_conteudo`)
- **Manter** `POST /api/finalizar-conteudo` inalterado — ele lê `sess.conteudo` (in-memory) para gerar o `conteudo_final.docx` e deve continuar funcionando
- **Remover** `'conteudo'` da lista de stages exportáveis/baixáveis no painel lateral (linha ~1885, `restoreStages`)

## Capabilities

### New Capabilities
_(nenhuma — esta mudança é uma remoção de comportamento existente)_

### Modified Capabilities
- `content-generation`: o ciclo de geração de conteúdo por aula não persiste mais o arquivo consolidado em disco; apenas os arquivos individuais por aula são gravados

## Non-goals

- Não alterar a geração do `conteudo_final.docx` pelo `POST /api/finalizar-conteudo`
- Não remover `sess.conteudo` da sessão em memória (necessário para `finalizar-conteudo`)
- Não alterar os arquivos individuais por aula

## Impact

- **`server.js`**: remover 2 chamadas a `persistStage(sess, 'conteudo', ...)` e remover `'conteudo'` da lista `restoreStages`
- **Disco**: `saídas/{slug}/conteudo.docx` e `saídas/{slug}/scr/conteudo.txt` deixam de ser criados
- **Frontend**: se houver referência ao download de `conteudo.docx` no painel lateral, remover o item
