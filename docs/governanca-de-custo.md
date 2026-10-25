# Governança de custo (orçamento, perfis e disjuntor)

Guia de uso da change `governanca-de-custo`. A governança é **opcional**: sem nenhum teto
configurado o app só contabiliza o gasto e se comporta como antes. Todas as variáveis estão em
`.env.example`; os números dos perfis estão em `config/perfis-custo.json`.

> Os valores padrão dos perfis e dos limites do disjuntor vêm do plano `Implementacoes231016.pdf` e são
> **ilustrativos**: ajuste-os com o custo real dos seus cursos. A calibração do projeto foi feita só com o
> curso de referência `capcut` (a segunda linha de base foi descartada), então a estimativa pode errar mais
> em cursos muito diferentes; ela é sempre uma **faixa**, nunca um valor exato.

## Tetos de orçamento

| Variável | Escopo |
|---|---|
| `ORCAMENTO_MAX_USD` (ou o sinônimo `ORCAMENTO_USD`) | gasto total do projeto |
| `ORCAMENTO_DIA_MAX_USD` | gasto do dia, **somando todos os projetos da máquina** (arquivo `.uso-diario.json`) |
| `ORCAMENTO_ETAPA_MAX_USD` | gasto de cada etapa dentro do projeto |

Também dá para ajustar os tetos pelo painel (💲 no cabeçalho) ou por `POST /api/orcamento`; o valor da tela
vale mais que o do ambiente e fica em `scr/uso.json`.

**Como funciona.** Antes de cada chamada à OpenAI o app estima o custo (com a calibração e uma margem de
`ORCAMENTO_MARGEM_PCT`, padrão 15%) e **reserva** esse valor em todos os escopos com teto; se algum não
comporta, a chamada nem é feita. Depois da resposta, a reserva é trocada pelo custo real do `usage`. A
reserva existe para que chamadas simultâneas não estourem o teto todas ao mesmo tempo. O excesso máximo
possível é o erro de estimativa de **uma** chamada.

**Alerta.** Ao passar de `ORCAMENTO_ALERTA_PCT` (padrão 80%) do teto, uma vez por escopo e por valor de teto:
evento `alerta_orcamento` e, se o perfil não for o Econômico, o perfil desce um nível (veja abaixo).

**Pausa e retomada.** No teto, a etapa **para**, emite `pausado_orcamento` e o que já foi gerado fica salvo.
No painel você escolhe *aumentar o teto*, *trocar o perfil* ou *cancelar*; depois **execute a etapa de novo**:
ela continua de onde parou (aulas prontas não são regeneradas). Executar de novo sem decidir pausa na hora,
sem gastar nada.

**Tarifa da busca web.** O custo da pesquisa só inclui a cobrança por chamada de `web_search` se você
preencher `buscaWebPorChamadaUsd` em `config/precos-modelos.json` (padrão **0**, que não é um preço real).
Enquanto for 0, o painel avisa que o custo da pesquisa pode estar subestimado.

## Perfis de custo

`CUSTO_PERFIL` (ou o painel): `economico`, `padrao` (padrão) ou `premium`. Cada perfil define:

| Parâmetro | Econômico | Padrão | Premium |
|---|---|---|---|
| consultas da pesquisa geral (a consulta extra da BNCC não conta) | 2 | 4 | 5 |
| contexto da busca web | baixo | médio | alto |
| modelo de redação | economia | o configurado (`OPENAI_CONTENT_MODEL`) | o do juiz (`OPENAI_JUDGE_MODEL`) |
| ciclos de melhoria (máx.) | 1 | 2 | 3 |
| achados da pesquisa no dossiê de cada aula | 3 | 6 | 8 |
| juiz final forte | nunca | só nos casos duvidosos | sempre |
| ciclo de melhoria sem ganho | interrompe | interrompe | só avisa |

- O **máximo de ciclos** só é imposto quando há algum teto configurado **ou** o perfil foi escolhido de
  propósito; sem isso os ciclos continuam ilimitados, como antes.
- A pesquisa por módulo faz uma consulta por módulo em qualquer perfil; o perfil só muda o contexto da busca.
- **Degradação automática**: ao atingir o alerta, o perfil desce **um nível, entre aulas** (nunca no meio de
  uma aula) e o app avisa (`perfil_alterado`). Nunca sobe sozinho. `CUSTO_DEGRADACAO_AUTOMATICA=false` desliga.

## Modelo por papel

| Papel | Variável | Padrão |
|---|---|---|
| pesquisa | `OPENAI_RESEARCH_MODEL` | `gpt-4o` |
| resumos, roteiros e planos | `OPENAI_SUMMARY_MODEL` | economia (`OPENAI_ECONOMY_MODEL`) |
| redação das aulas | `OPENAI_CONTENT_MODEL` | economia |
| avaliação de primeira passada | `OPENAI_EVAL_MODEL` | economia |
| juiz final | `OPENAI_JUDGE_MODEL` | o modelo de redação |

Na inicialização, `config/modelos-capacidades.json` confere cada papel (por exemplo, a pesquisa exige busca
web). Modelo fora da tabela, ou marcado sem a capacidade, gera um **aviso** no log e no painel, nunca um erro;
edite a tabela conforme a documentação da OpenAI.

**Juiz final em cascata.** No gate de aceite das melhorias o juiz de primeira passada decide; o forte só é
chamado quando o ganho de nota fica a até `JUIZ_MARGEM_GANHO` do limiar de aceite, ou a rubrica e o
componente determinístico divergem em mais que `JUIZ_DIVERGENCIA_MAX`. Se `OPENAI_JUDGE_MODEL` for igual ao
modelo de avaliação, o app não refaz o julgamento (não traria nada).

## Disjuntor

Além das falhas seguidas da API (`DISJUNTOR_FALHAS`, só com algum teto), o disjuntor para a etapa quando:

| Motivo | Gatilho | Limite |
|---|---|---|
| `custo` | o custo real de uma aula passa de N× a estimativa dela | `DISJUNTOR_FATOR_CUSTO` (2) |
| `erro_repetido` | o mesmo erro se repete N vezes seguidas na etapa | `DISJUNTOR_ERROS_SEGUIDOS` (3) |
| `sem_ganho` | o último ciclo de melhoria elevou a nota menos que o mínimo | `DISJUNTOR_GANHO_MIN` (0,02) |
| `continuacoes` | as continuações de um texto cortado esgotaram sem terminar | 2 (o usuário pode liberar mais) |
| `limite_ciclos` | o perfil permite menos ciclos que os que o projeto já tem | `ciclosMelhoriaMax` do perfil |

Ao disparar, a etapa **para**, a aula fica marcada como incompleta, o texto parcial vai para
`aulaNN_conteudo.partial.txt` (nunca para o arquivo oficial), o motivo é registrado em `scr/uso.json` e no
log (com o `traceId`) e o painel pede a decisão: **aumentar o limite**, **trocar o perfil** ou **pular** a
unidade. O reset é manual: executar a etapa de novo sem decidir interrompe na hora, sem chamar a API.
Pular deixa a aula incompleta (o fluxo seguinte continua bloqueado até ela ser regenerada).

> Mudança de comportamento: antes, uma aula que esgotava as continuações virava "incompleta" e a etapa
> seguia para as próximas aulas; agora a etapa para e pede a decisão, para não gastar com aulas que
> provavelmente vão truncar também.

## Rotas

- `GET /api/orcamento`: tetos, gasto por escopo, etapa e modelo, saldo restante, perfil, alertas, pausa,
  disjuntor, calibração e avisos de modelos.
- `POST /api/orcamento`: `{ tetos: { projeto, dia, etapa }, perfil, decisao: 'aumentar-limite' | 'trocar-perfil' | 'pular', valor }`;
  valores inválidos voltam HTTP 400.
- `GET /api/estimativa?etapa=...` agora inclui o perfil, o saldo restante e `excedeSaldo`; a tela pede a
  confirmação antes de uma etapa pesada quando a faixa máxima passa do saldo.

## Langfuse

Cada trace leva o `perfil` e, com algum teto, o `orcamento_restante_usd`; cada `generation` leva o papel do
modelo (`papel`). O custo do painel e o do Langfuse partem do mesmo `usage` e da mesma tarifa.

## Arquivos de estado

- `scr/uso.json` (por projeto, gravação atômica): gasto por dia/etapa/modelo, calibração, tetos ajustados,
  perfil, pausa, disparos do disjuntor e unidades puladas. Um disparo pendente **sobrevive a reinícios**.
- `.uso-diario.json` (global, na raiz do app; ignorado pelo git): gasto do dia. Só é mantido com
  `ORCAMENTO_DIA_MAX_USD` configurado; se não puder ser lido ou gravado, o teto diário fica desligado com
  um aviso e a geração não é bloqueada.
