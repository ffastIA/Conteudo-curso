## Context

`persistStage(sess, baseName, label, content)` grava dois arquivos: `scr/{baseName}.txt` e `{rootDir}/{baseName}.docx`. É chamada com `baseName = 'conteudo'` em dois handlers:

- **`GET /api/conteudo` (Etapa 5, linha ~890)**: após o loop de geração de aulas, grava `scr/conteudo.txt` e `conteudo.docx`
- **`GET /api/aplicar-melhorias/confirmar` (Etapa 6, linha ~1574)**: após o loop de melhorias, faz o mesmo

`sess.conteudo` em memória é necessário para:
- `GET /api/ppc`: verifica `if (!sess.conteudo)` para bloquear o PPC antes da Etapa 5
- `POST /api/finalizar-conteudo`: usa `sess.conteudo` para gerar `conteudo_final.docx`
- `POST /api/download-step` (passo `conteudo`): serve o texto via download

## Goals / Non-Goals

**Goals:**
- Eliminar a gravação de `conteudo.docx` e `scr/conteudo.txt` em Etapa 5 e Etapa 6
- Manter `sess.conteudo` in-memory intacto para que PPC e `finalizar-conteudo` continuem funcionando
- Remover `'conteudo'` da lista de restore a partir do disco (o arquivo não existirá mais)
- Remover `'conteudo'` da lista do endpoint de seed (`/api/seed`)

**Non-Goals:**
- Não alterar `POST /api/finalizar-conteudo`
- Não remover `sess.conteudo` da sessão em memória
- Não alterar os arquivos individuais de aula (`aula{NN}_conteudo.docx/.txt`)
- Não alterar `POST /api/download-step` (o campo `conteudo` pode ser removido do textMap ou mantido para compatibilidade — opção: remover para evitar confusão)

## Decisions

**Manter `sess.conteudo = fullText` em ambos os handlers, mas remover apenas a chamada `persistStage`**

O campo de sessão continua sendo populado para que os consumidores downstream (`/api/ppc`, `/api/finalizar-conteudo`) funcionem sem alteração. Apenas o efeito colateral de escrita em disco é eliminado.

**Remover `['conteudo', 'conteudo']` da lista `textuais` no restore de sessão**

Se o arquivo não é mais gerado, a tentativa de restore retornaria `null` de qualquer forma. Remover a entrada evita I/O desnecessário no restore e torna explícito que `conteudo` não é mais um stage persistido.

**Remover `'conteudo'` de `STAGES_FIXOS`**

O `STAGES_FIXOS` é usado em `POST /api/importar` para detectar o stage de um `.docx` importado pelo usuário. Como o arquivo consolidado não é mais gerado pelo sistema, removê-lo evita que o usuário importe por engano um consolidado obsoleto. Se necessário no futuro, pode ser readicionado.

**Remover `conteudo` do endpoint `/api/seed`**

O seed de desenvolvimento (linha ~1885) grava `conteudo.txt` diretamente em `scr/`. Com a mudança, não faz mais sentido incluir o consolidado no seed — o conteúdo em memória é suficiente para os consumidores.

## Risks / Trade-offs

**Restore de sessão após restart** → Se o servidor restartar após Etapa 5 mas antes de `finalizar-conteudo`, `sess.conteudo` estará vazio. O restore atual tentava ler `conteudo.txt` do disco; sem ele, o conteúdo precisará ser reconstruído a partir dos arquivos individuais de aula. Mitigação: ao fazer restore, montar `sess.conteudo` concatenando os `aula{NN}_conteudo.txt` existentes (já carregados em `sess.conteudoPorAula`).

**`POST /api/download-step` com `step=conteudo`** → Se o frontend ainda envia esse passo, a resposta será 400 ("Conteúdo não encontrado"). O campo pode ser mantido no `textMap` apontando para `sess.conteudo` (que continua em memória), ou o botão de download do consolidado pode ser removido do frontend. Decisão: manter `sess.conteudo` no `textMap` para não quebrar o download-step.

## Migration Plan

Não há migração de dados. Projetos existentes com `conteudo.docx` em disco não são afetados — os arquivos existentes permanecem, apenas não serão mais gerados em novas execuções.
