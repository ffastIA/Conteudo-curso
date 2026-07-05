# Design: corrigir-duplicacao-patch-secional

## Context

`mergeSecoesConteudo(textoOriginal, patchTexto)` (`server.js:285-341`) processa cada bloco `<<<SECAO:>>>` do patch sequencialmente, buscando o título em `texto` (uma variável que é reatribuída após cada substituição) com `linhaNorm === alvo || linhaNorm.includes(alvo)`. Essa busca por substring, contra **todas** as linhas do documento (não só cabeçalhos), é a causa raiz confirmada da duplicação observada nas Aulas 1, 2 e 3 do curso Capcut Oficina.

## Goals / Non-Goals

**Goals:** eliminar a possibilidade de o merge duplicar ou fragmentar uma seção; tornar visível qualquer ambiguidade que o merge não consiga resolver com segurança; higienizar os documentos já afetados.

**Non-Goals:** redesenhar o formato do patch (`<<<SECAO:>>>...<<<FIM_SECAO>>>`) em si; resolver ambiguidade de título por conta própria quando ela é genuinamente indecidível (ex.: repetição legítima por objetivo) — nesses casos o sistema sinaliza e aplica uma regra conservadora, não adivinha.

## Decisions

### 1. Lista fixa de cabeçalhos, extraída uma única vez do original

Todo cabeçalho de seção gerado pelo pipeline (`conteudoSkill`, e as próprias respostas de melhoria bem-sucedidas de ciclos anteriores) aparece como uma linha isolada por linha em branco antes e depois — confirmado inspecionando os documentos reais. Uma função `parseSecoesFixas(texto)` percorre `texto.split('\n')` **uma vez** e identifica candidatos a cabeçalho como linhas que são: não vazias, precedidas por linha vazia (ou início do documento), seguidas por linha vazia, com menos de 90 caracteres, começando por maiúscula/dígito/`#`/`*`, e **sem terminar em pontuação de frase** (`.,:;!?`). Cada candidato define o início de uma seção; o fim é o próximo candidato (ou o fim do documento). Essa lista é **congelada** antes de qualquer substituição — nenhuma busca subsequente reexamina o texto sendo montado.

Isso mata os dois vetores de bug ao mesmo tempo: `.includes()` contra frases de corpo deixa de existir (só cabeçalhos isolados entram na lista), e não há mais "buscar de novo num texto que já mudou" (a lista é fixa, calculada uma vez).

### 2. Correspondência exata contra a lista fixa, com deduplicação de blocos do patch

Blocos do patch são extraídos primeiro (mesmo regex atual `<<<SECAO:...>>>...<<<FIM_SECAO>>>`) e agrupados por título normalizado. Se dois ou mais blocos do mesmo patch tiverem o mesmo título normalizado — o caso concreto observado é uma continuação por truncamento reescrevendo uma seção que já havia sido fechada na tentativa anterior —, mantém-se **apenas o último bloco** (é a versão mais completa/final que o modelo produziu) e os descartados entram em `suspeitas` com um motivo explícito (`duplicado_no_patch`).

Cada bloco (já deduplicado) é então comparado contra a lista fixa por **igualdade normalizada exata**, nunca substring.

### 3. Reconstrução em um único passe

Em vez de recortar e reatribuir `texto` a cada bloco, a função percorre a lista fixa de seções, em ordem, e monta o resultado de uma vez: para cada seção original, emite o corpo do bloco correspondente (se houver) ou o corpo original (se não). Seções do patch sem correspondência na lista fixa (título genuinamente novo) são anexadas ao final, na ordem em que aparecem no patch — mesmo comportamento visível de hoje, só que implementado sem o recorte incremental que hoje causa o desalinhamento.

### 4. Título ambíguo no original: aplicar à primeira ocorrência, sinalizar sempre

Se a lista fixa tiver mais de uma seção com o mesmo título normalizado (corrupção pré-existente nos documentos já afetados, ou repetição legítima por objetivo em aulas como a Aula 3), a substituição é aplicada apenas à **primeira** ocorrência — é a opção menos destrutiva, já que nunca risca misturar conteúdo de objetivos diferentes. A ambiguidade entra em `suspeitas` com o motivo `titulo_ambiguo` e a contagem de ocorrências, para revisão humana. O sistema nunca tenta adivinhar qual ocorrência o patch pretendia.

### 5. Rede de segurança pós-merge

Depois de montar o resultado, conta-se quantas vezes cada título normalizado aparece nele e compara-se com o esperado (contagem original + seções genuinamente novas). Se o resultado tiver **mais** ocorrências de algum título do que o esperado — sinal de que a própria lógica de merge falhou de um jeito não previsto —, o merge inteiro é rejeitado: a função retorna o texto original inalterado com uma marca de erro, e o chamador (`server.js`, ciclo de melhorias) trata isso exatamente como já trata a falha do julgamento de score — preserva o conteúdo anterior e registra no relatório. Consistente com o princípio já estabelecido nesta sessão: nunca persistir uma regressão, mesmo quando a causa é uma falha interna do próprio sistema, não do LLM.

### 6. Reforço de prompt (defesa em profundidade)

O prompt de continuação (`server.js`, guarda de truncamento) ganha uma frase explícita: "Se você já fechou um bloco `<<<SECAO:>>>...<<<FIM_SECAO>>>` na tentativa anterior, NÃO o reescreva — continue apenas o que ficou incompleto." Isso reduz a chance de o cenário do item 2 acontecer, mas não é a proteção principal — a deduplicação mecânica (item 2) já cobre o caso mesmo que o modelo ignore a instrução.

### 7. Script de limpeza é separado do pipeline, não uma função permanente

A higienização dos documentos já corrompidos (Aulas 1/2/3, Capcut Oficina) usa a MESMA função `parseSecoesFixas` (reuso, não duplicação de lógica), mas roda como script avulso: lê `scr/aulaNN_conteudo.txt`, identifica títulos com múltiplas ocorrências, mantém a primeira (mais recente — confirmado pela investigação: cada duplicação empilhada empurrou a versão anterior para baixo) e descarta as demais, regrava o `.txt` e reconstrói o `.docx` correspondente reaproveitando `buildDocx` + `Packer.toBuffer` (mesma função usada por `persistStage`, para manter a formatação idêntica ao resto do pipeline). Não vira uma rota HTTP nem uma função chamada em produção — é remediação pontual dos dados já afetados.

## Risks / Trade-offs

- [Cabeçalho real que não segue o padrão "isolado por linha em branco"] → não seria reconhecido como seção; o bloco correspondente do patch cairia no caminho de "seção nova" (comportamento já existente, apenas acrescenta ao final) em vez de substituir — degradação segura, não corrupção.
- [Rejeitar o merge inteiro quando a rede de segurança dispara pode descartar melhorias legítimas de outras seções da mesma aula] → aceito conscientemente: é a mesma troca já validada nesta sessão (preferir preservar a versão anterior a arriscar persistir uma regressão); o ciclo seguinte tenta de novo.
- [Script de limpeza mexe em dados de produção do usuário] → escopo restrito às 3 aulas identificadas, com backup implícito (o `.txt` de cada `ciclo_NNN/` já preserva versões anteriores para eventual recuperação manual).

## Migration Plan

Sem migração de schema. A correção no merge vale a partir do próximo ciclo de melhorias rodado em qualquer curso. O script de limpeza é executado uma vez, ao final desta mudança, apenas sobre o curso Capcut Oficina.

## Open Questions

Nenhuma.
