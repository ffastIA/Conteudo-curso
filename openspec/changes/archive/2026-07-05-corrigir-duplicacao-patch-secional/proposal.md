# Proposal: corrigir-duplicacao-patch-secional

## Why

Investigação sobre as Aulas 1, 2 e 3 do curso "Capcut Oficina" (15 ciclos de melhorias aplicados) confirmou que o mecanismo de patch por seção (`mergeSecoesConteudo`, `server.js`) está duplicando conteúdo em vez de substituí-lo — a mesma seção conceitual ("Fundamentação Técnica", "Exemplos Práticos", "Erros Comuns e Pontos de Atenção") aparece repetida de 2 a 13 vezes no documento final, cada cópia uma variante diferente de texto, empilhadas sem remoção da versão anterior.

Causa raiz identificada no código (`server.js:307-310`): a busca pelo título da seção-alvo percorre **todas as linhas** do texto e casa por `linhaNorm === alvo || linhaNorm.includes(alvo)` — ou seja, qualquer linha cujo texto normalizado **contenha** o título como substring é aceita como o cabeçalho da seção, mesmo que seja uma frase de corpo de texto que apenas menciona esse termo de passagem. Combinado a uma heurística de fim de seção (`server.js:322-329`) que também não distingue de forma confiável um cabeçalho real de uma frase curta e coincidentemente sem pontuação final, o resultado é que a substituição pode: (a) localizar a linha errada como início da seção, deixando a seção-alvo real intocada em outro ponto do documento; e/ou (b) cortar a seção antiga incompleta, deixando o restante do texto anterior como sobra colada logo após o conteúdo novo. Isso se agrava a cada novo ciclo, porque o ciclo seguinte opera sobre um documento que já carrega as sobras do ciclo anterior.

Esse problema não é exclusivo de aulas com estrutura repetida por objetivo (Aula 3) — ocorre igualmente na Aula 1, que tem títulos de seção únicos por desenho, confirmando que a causa é estrutural ao mecanismo de busca, não à repetição legítima de títulos.

## What Changes

- `mergeSecoesConteudo` passa a localizar seções por uma **lista fixa de cabeçalhos**, extraída uma única vez do texto original antes de qualquer substituição — um cabeçalho válido é uma linha isolada por linha em branco antes e depois, curta, e sem terminar em pontuação de frase. Nunca mais compara por substring contra qualquer linha do documento.
- A correspondência de título usa **igualdade exata** (normalizada) contra essa lista fixa, não mais `.includes()` contra texto arbitrário.
- Blocos `<<<SECAO:>>>` do mesmo patch com o **mesmo título normalizado** (ex.: quando uma continuação por truncamento reescreve uma seção já enviada) são deduplicados antes da aplicação — mantém-se apenas o último, e o descarte é sinalizado.
- A reconstrução do texto passa a ser feita em **um único passe** sobre a lista fixa de seções originais (emite o corpo novo ou o original, seção a seção, na ordem), eliminando o recorte incremental sucessivo que hoje reabre o texto já modificado a cada bloco.
- Título do patch que corresponde a **mais de uma seção no original** (corrupção pré-existente ou repetição legítima por objetivo) é aplicado apenas à primeira ocorrência, e a ambiguidade é sinalizada no relatório em vez de resolvida silenciosamente.
- Verificação pós-merge: se alguma seção aparecer mais vezes no resultado do que no original (além do esperado por seções novas), o merge é rejeitado e o conteúdo anterior é preservado — mesma filosofia de "nunca persistir uma regressão" já usada na guarda de truncamento e no gate de score.
- Reforço (defesa em profundidade, não a correção principal): o prompt de continuação por truncamento passa a instruir explicitamente a não reescrever seções já fechadas com `<<<FIM_SECAO>>>` na tentativa anterior.
- Script de limpeza (execução única, fora do pipeline): higieniza os documentos já corrompidos das Aulas 1, 2 e 3 do curso "Capcut Oficina", removendo as duplicatas e mantendo a primeira ocorrência de cada seção (a mais recente, conforme confirmado pela investigação — os ciclos mais antigos foram empurrados para o fim do documento a cada duplicação).

## Non-goals

- Não reprocessa nem reaplica melhorias antigas — a limpeza apenas remove duplicatas mecânicas, não reavalia o conteúdo.
- Não altera a decisão de aceite por score (`quality-scoring`) nem a guarda de truncamento — esta mudança opera estritamente na camada de merge de texto, entre a resposta do modelo já validada como completa e a persistência.
- Não cobre eventuais duplicações fora do padrão "cabeçalho isolado por linha em branco" (ex.: se um curso usar headings Markdown `#`/`##` de forma diferente da observada); a lista fixa de cabeçalhos é construída com a mesma convenção já usada por todo o pipeline de geração de conteúdo.

## Impact

- **Código**: `server.js` (`mergeSecoesConteudo` reescrito; ajuste no consumo de `suspeitas`/novo campo de ambiguidade em `/api/aplicar-melhorias/confirmar`); `skills.js` (reforço no prompt de continuação).
- **Dados existentes**: as Aulas 1, 2 e 3 do curso "Capcut Oficina" (`scr/aulaNN_conteudo.txt` e `aulaNN_conteudo.docx`) são corrigidas por um script de execução única ao final desta mudança.
- **Compatibilidade**: mesma assinatura e mesmo formato de retorno de `mergeSecoesConteudo` (`{texto, substituidas, novas, suspeitas}`), apenas com itens adicionais possíveis em `suspeitas`; nenhuma mudança de contrato para os chamadores existentes além do necessário para exibir os novos avisos.
- **Testes**: a reescrita é inteiramente testável com funções puras (sem chamada de API) — casos de título-substring-falso-positivo, seção curta sem pontuação, blocos duplicados no mesmo patch, título ambíguo no original, e o caso feliz de substituição limpa.
