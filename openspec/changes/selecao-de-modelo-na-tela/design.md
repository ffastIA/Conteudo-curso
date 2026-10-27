## Context

Toda chamada à OpenAI passa por `chamarOpenAI` (`server.js`), que consulta `governanca.modeloPara(sess, nome, params.model)` e troca o modelo conforme o papel da chamada (`papelDaChamada` em `config/modelos.js`). Os papéis são cinco: `pesquisa`, `resumos` (tudo que não é pesquisa, redação, avaliação ou juiz: ementa, planos, PPC, roteiros), `redacao` (conteúdo e melhorias), `avaliacao` (revisão e score) e `juiz` (juiz final). A resolução atual é:

- `resumos`, `avaliacao` e `juiz`: a variável própria (`OPENAI_SUMMARY_MODEL`, `OPENAI_EVAL_MODEL`, `OPENAI_JUDGE_MODEL`), se definida; senão o modelo da skill.
- `redacao`: o `modeloRedacao` do perfil (`economia` ou `juiz`); no papel `conteudo`, o modelo da skill (`OPENAI_CONTENT_MODEL`).
- `pesquisa`: `modeloPesquisa` do perfil, aplicado em dois pontos de `server.js` (`skill.model = ...`), antes do cache e da chamada; senão `OPENAI_RESEARCH_MODEL`.

O estado por projeto (`scr/uso.json`) já guarda o perfil e é lido e gravado por `orcamento.js` (`usoDe`, `carregarUso`, `gravarUso`); `GET/POST /api/orcamento` e o painel 💲 (`public/orcamento.js`) já tratam perfil, tetos e decisões. Os preços estão em `config/precos-modelos.json` (`gpt-4o`, `gpt-4o-mini`) e as capacidades em `config/modelos-capacidades.json` (que também lista `gpt-4.1` e `gpt-4.1-mini`, sem preço).

## Goals / Non-Goals

**Goals:**
- O usuário escolhe, na tela, o modelo de cada papel, por projeto, sem editar arquivo nem reiniciar o servidor.
- Tela, estimativa, chave do cache de pesquisa e chamada real usam sempre o mesmo modelo.
- Só entram modelos com preço e capacidade conhecidos; o servidor valida.

**Non-Goals:**
- Escolha por função/etapa, nome de modelo livre, modelos de raciocínio e outras famílias, preferência global entre projetos (ver a proposta).

## Decisões

**D1. Seleção por papel.** O papel é a unidade que já existe (`PAPEIS`) e que o orçamento, o painel e o Langfuse usam. Escolher por skill exigiria cerca de 30 seletores e não tem ganho de custo proporcional. Alternativa descartada: um único modelo geral, que tira o controle da pesquisa (o papel que pesa 86% do custo e o único com exigência de busca web).

**D2. Estado em `uso.modelosEscolhidos`.** (O campo `uso.modelos` já existe e guarda o gasto por modelo; por isso a escolha tem outro nome.) O mapa `{ papel: modelo }` fica em `scr/uso.json`, ao lado de `perfil`, e usa o mesmo ciclo de carregar, gravar e restaurar. Papel ausente significa "padrão do perfil". Arquivos `uso.json` antigos, sem o campo, valem como `{}`. Alternativa descartada: guardar em `projeto.json`, que não tem o ciclo de leitura e gravação do uso e misturaria configuração com conteúdo.

**D3. Uma função de resolução, `modeloDoPapel(sess, papel)`.** Em `orcamento.js` (`criarGovernanca`): se `uso.modelosEscolhidos[papel]` existe e continua permitido, devolve esse; senão aplica a resolução atual, sem mudança de comportamento (`resolverModelo` e `modeloPesquisa` do perfil). `modeloPara(sess, nome, original)` passa a chamar a mesma função, e os pontos de `server.js` que hoje montam o modelo à mão (pesquisa geral, pesquisa por módulo, estimativas de pesquisa e de redação) também. Isso garante que `skill.model`, a chave do cache de pesquisa (que inclui o modelo) e a chamada real coincidam. Se a escolha deixar de ser permitida (por exemplo, o preço foi removido do JSON), ela é ignorada com um aviso no log e o painel mostra "escolha inválida, usando o padrão".

**D4. Lista permitida por papel.** `modelosDisponiveis(papel)` = modelos com entrada em `precos-modelos.json` e em `modelos-capacidades.json`, filtrados pelas exigências do papel (`pesquisa` exige `busca_web`). Calculada a cada leitura, então editar os JSONs basta para ampliar a lista. Sem preço o custo seria nulo e o orçamento, a estimativa e o disjuntor ficariam cegos, por isso o preço é obrigatório. Os modelos `gpt-4.1*` ficam fora até terem preço cadastrado.

**D5. Validação no servidor.** `ajustar` recebe `modelos` (papel → modelo ou `null`); papel desconhecido ou modelo fora da lista dá erro, e nada é alterado (mesmo comportamento do perfil desconhecido). `null` remove a escolha. A mudança limpa uma pausa por orçamento como a troca de perfil faz, porque a estimativa muda.

**D6. A degradação de perfil não desfaz a escolha.** `aplicarDegradacao` só troca o perfil; `uso.modelosEscolhidos` fica como está. O estado devolve, por papel, o modelo efetivo e a origem (`usuario` ou `perfil`), e o painel mostra "fixado por você" quando a origem é `usuario`, para o usuário entender por que a descida de perfil não baixou o custo daquele papel.

**D7. Estimativa e painel pelo mesmo caminho.** `estado()` passa a devolver `modelos` (efetivo por papel, hoje `modelosPorPapel`), `modelosEscolhidos` e `modelosDisponiveis`; as estimativas de `server.js` leem `modeloDoPapel`. Ao trocar um seletor o painel faz `POST /api/orcamento` e recarrega o estado, que traz a estimativa nova.

**D8. Aviso de mistura.** Quando a troca ocorre com o projeto já tendo gasto (`custoProjetoUsd > 0`), a resposta do `POST` traz um aviso de que o conteúdo anterior usou outro modelo e de que a calibração da estimativa mistura modelos. Não bloqueia. O modelo de cada chamada já fica no `geracao_log.json`.

**D9. Compatibilidade.** Sem escolha do usuário nada muda: perfis, variáveis de ambiente e padrões se comportam como hoje. O campo é opcional e a API só ganha campos.

## Riscos / Trade-offs

- [Modelo sem preço ou sem capacidade fica visível e dá custo nulo ou erro] → só a lista permitida é oferecida e o servidor valida (D4, D5).
- [Estimativa, cache e gasto divergentes por resolverem o modelo em lugares diferentes] → função única (D3), com teste que confere os quatro usos.
- [Qualidade diferente entre aulas ao trocar no meio do curso] → aviso e registro por chamada (D8).
- [Usuário acha que o perfil Econômico garante custo baixo mesmo com escolha fixada] → painel indica a origem (D6).
- [`gpt-4o-mini` na pesquisa pode voltar sem fontes em algumas buscas (1 de 8 na verificação de 2026-10-26)] → o retry existente trata; o texto do seletor menciona o custo e a qualidade medidos.
- [Mexer em `server.js`, arquivo grande] → mudanças pequenas e pontuais, só nos pontos que hoje resolvem modelo; sem tocar nas skills.

## Migration Plan

Sem migração de dados: `uso.json` antigo continua válido (sem `modelosEscolhidos`). Reversão: remover o campo `modelosEscolhidos` do `uso.json` ou escolher "Padrão do perfil" em todos os papéis.

## Open Questions

- Nenhuma que bloqueie. A inclusão de `gpt-4.1` e `gpt-4.1-mini` na lista depende de cadastrar os preços da página da OpenAI e de uma verificação real, e fica para outra change.
