## ADDED Requirements

### Requirement: Prefixo estável nas skills repetitivas
As skills chamadas várias vezes com o mesmo contexto SHALL montar o prompt com o conteúdo estável primeiro (instruções, dados do curso, plano de ensino, plano de aula, ementa, dossiê de fontes, nível e contexto pedagógico) e o conteúdo variável por último (seção a redigir, resumo do que já foi escrito, texto a avaliar), sem alterar o conteúdo do prompt, apenas a ordem dos blocos. Isso se aplica a `secaoConteudoSkill`, `expandirSecaoSkill`, `revisaoSecaoSkill`, `revisaoQualidadeSkill`, `scoreAulaSkill` e à skill de roteiro por aula. O texto de `system` SHALL permanecer idêntico entre chamadas da mesma etapa.

#### Scenario: Seções da mesma aula compartilham o prefixo
- **WHEN** são montados os prompts das seções 1 e 2 da mesma aula
- **THEN** todo o contexto da aula (dossiê, plano, ementa, nível, contexto pedagógico) aparece antes do trecho que difere, e o prefixo comum cobre esse contexto inteiro

#### Scenario: Avaliação por seção
- **WHEN** são montados os prompts de revisão de duas seções da mesma aula
- **THEN** o plano de aula, o plano de ensino e a ementa formam um prefixo idêntico e só a seção avaliada difere

#### Scenario: Conteúdo preservado
- **WHEN** a ordem dos blocos é alterada
- **THEN** todos os blocos que existiam continuam presentes no prompt, sem acréscimo nem corte de texto

### Requirement: Tokens em cache registrados em cada chamada
O wrapper de chamadas à OpenAI SHALL ler os tokens de entrada atendidos em cache (`usage.prompt_tokens_details.cached_tokens` nas chamadas de chat e `usage.input_tokens_details.cached_tokens` na Responses API), normalizá-los como `entradaEmCache` e registrá-los no log de geração (`geracao_log.json`) e na `generation` do Langfuse. Ausência do campo SHALL valer 0.

#### Scenario: Chamada com prefixo em cache
- **WHEN** a OpenAI informa 1.920 tokens em cache numa chamada de chat
- **THEN** o log de geração e a `generation` registram `entradaEmCache: 1920`

#### Scenario: Resposta sem o campo
- **WHEN** o `usage` não traz detalhes de tokens em cache
- **THEN** `entradaEmCache` vale 0 e nada falha
