## Context

`POST /api/aplicar-melhorias` (`server.js:1382`) extrai observações do `.docx` e salva em `observacoes_pendentes.json`. O arquivo existente é sobrescrito sem qualquer comparação com o upload anterior. `textSimilarity()` já está disponível no mesmo arquivo (`server.js:134`). O frontend (`app.js:480`) lê a resposta JSON e habilita `btnAplicarMelhorias` — este é o ponto de intervenção para bloquear o botão quando duplicata é detectada.

## Goals / Non-Goals

**Goals:**
- Detectar quando o usuário carregou um relatório idêntico ou quase idêntico ao anterior
- Exibir aviso com percentual de similaridade e data do upload anterior antes de deixar o usuário prosseguir
- Permitir que o usuário confirme e prossiga mesmo assim ("Aplicar mesmo assim")

**Non-Goals:**
- Não bloquear automaticamente sem confirmação do usuário
- Não comparar com snapshots de ciclos anteriores (só com o último upload)
- Não alterar `GET /api/aplicar-melhorias/confirmar`

## Decisions

**Onde comparar: concatenação de todos os textos de observações**

```js
const juntarObs = aulas => aulas.map(o => o.observacoes || '').join(' ');
const simObs = textSimilarity(juntarObs(observacoesPorAula), juntarObs(obsAnteriores.aulas));
```

Alternativa considerada: comparar por aula individualmente e usar média. Rejeitado: mais complexo, e o caso crítico (mesmo arquivo carregado duas vezes) é capturado igualmente pela concatenação.

**Threshold: constante `DUPLICATE_OBS_THRESHOLD = 0.85` no topo do handler**

Valor conservador que tolera pequenas edições mas captura o upload idêntico. Constante nomeada para facilitar ajuste sem buscar a lógica.

**Ação: aviso não-bloqueante com confirmação do usuário**

Backend retorna HTTP 200 com `{ aviso: 'possivel_duplicata', similaridadeObservacoes, dataUltimoUpload }`. `btnAplicarMelhorias` permanece desabilitado. Frontend exibe `bannerDuplicata` (fundo âmbar) com dois botões:
- **Cancelar**: oculta o banner e o resumo, reabilita o botão de upload
- **Aplicar mesmo assim**: oculta o banner e habilita `btnAplicarMelhorias`

**Novo elemento HTML: `bannerDuplicata`**

Inserido logo após `resumoMelhorias` em `index.html`, `display:none` por padrão, estilo âmbar para distinguir do verde de sucesso.

**Ordem das operações no handler:**

```
1. Extrair observacoesPorAula do docx
2. Ler observacoes_pendentes.json existente (se houver)
3. Calcular similaridade
4. Se duplicata → incluir aviso na resposta (NÃO salvar ainda? ← salvar normalmente)
5. Salvar observacoes_pendentes.json com as novas observações
6. Retornar JSON (com ou sem aviso)
```

Salvar antes de retornar é correto: se o usuário clicar "Aplicar mesmo assim", `confirmar` lê `sess.observacoesMelhorias` (em memória), não o arquivo. O arquivo salvo é apenas para recuperação de sessão.

## Risks / Trade-offs

**Falso positivo em edições pequenas** → um usuário que corrigiu uma palavra no relatório pode ver o aviso (85% de similaridade). Mitigação: o aviso é informativo e "Aplicar mesmo assim" está a um clique — não interrompe o fluxo.

**Primeiro upload nunca dispara aviso** → `observacoes_pendentes.json` não existe → nenhuma comparação → comportamento atual mantido. Correto.

**Observações vazias não disparam aviso** → se `juntarObs` resultar em string vazia, `textSimilarity` retorna 1.0 (dois conjuntos vazios são idênticos). A condição `novasObsText.length > 50` previne falso positivo com upload sem observações.
