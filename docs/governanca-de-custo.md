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

**Tarifa da busca web.** O custo da pesquisa soma a cobrança por chamada de `web_search`, lida de
`buscaWebPorChamadaUsd` em `config/precos-modelos.json` (**0,01** = US$ 10 por 1.000 chamadas, valor da página de
preços da OpenAI em 2026-10-25; é o mesmo para todos os modelos e perfis). Os tokens do conteúdo da busca
entram pelo `usage`. Só nos modelos mini a OpenAI cobra um bloco fixo de 8.000 tokens de entrada por chamada,
que o app não soma. Se o valor voltar a 0, o painel avisa que o custo da pesquisa pode estar subestimado.
Confira o preço de tempos em tempos: ele muda.

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

**Escolha na tela (por projeto).** O painel 💲 tem uma área "Modelos da OpenAI (por papel)" com um seletor
para cada papel. A opção "Padrão do perfil" não escolhe nada (vale a resolução acima, com o perfil e as
variáveis); qualquer outro valor **vence o perfil e as variáveis** a partir da próxima chamada, sem reiniciar
o servidor. A escolha fica em `scr/uso.json` (`modelosEscolhidos`) e volta ao reabrir o projeto. A lista de
cada papel só tem modelos com **preço** em `config/precos-modelos.json` e capacidades em
`config/modelos-capacidades.json` que cumpram a exigência do papel (a pesquisa exige busca web); hoje são
`gpt-4o` e `gpt-4o-mini`. Para oferecer outro modelo, cadastre-o nos dois arquivos. O servidor recusa
(HTTP 400) qualquer papel ou modelo fora da lista. A descida automática de perfil não desfaz a escolha, e o
painel mostra "fixado por você". Trocar o modelo com o projeto já em andamento mostra um aviso: o conteúdo
anterior não é refeito e a calibração da estimativa pode misturar modelos.

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
  disjuntor, calibração, avisos de modelos e, por papel, o modelo efetivo (`modelos`), a origem
  (`modelosOrigem`: `usuario` ou `perfil`), a escolha (`modelosEscolhidos`) e a lista permitida (`modelosDisponiveis`).
- `POST /api/orcamento`: `{ tetos: { projeto, dia, etapa }, perfil, modelos: { <papel>: '<modelo>' | null }, decisao: 'aumentar-limite' | 'trocar-perfil' | 'pular', valor }`;
  valores inválidos voltam HTTP 400. A resposta traz `avisos` quando há mistura de modelos.
- `GET /api/consumo`: consumo do projeto por modelo (chamadas, tokens de entrada, de entrada em cache e de
  saída), a tarifa de `config/precos-modelos.json`, o valor em US$ e as quebras por etapa e por dia; ver
  [Consumo do projeto](#consumo-do-projeto).
- `GET /api/estimativa?etapa=...` agora inclui o perfil, o saldo restante e `excedeSaldo`; a tela pede a
  confirmação antes de uma etapa pesada quando a faixa máxima passa do saldo.

## Consumo do projeto

A seção "Consumo do projeto" do painel 💲 (e `GET /api/consumo`) mostra de onde vem o gasto: uma linha por
modelo com chamadas, tokens de entrada, de entrada em cache e de saída, a tarifa (US$ por 1 milhão de tokens)
e o valor. O valor é `((entrada − cache) × tarifa de entrada + cache × tarifa de cache + saída × tarifa de saída) / 1.000.000`,
mais `chamadas de busca web × buscaWebPorChamadaUsd` em linha própria (o bloco fixo dos modelos mini só entra
com `buscaWebBlocoTokensMiniSomar` ligado). O contador do cabeçalho mostra o total em US$ ao lado dos tokens.

- **A conta é refeita a cada consulta** com a tabela atual: `scr/uso.json` guarda só contadores (`consumo`, por
  etapa e por dia, em cada modelo), nunca o US$. Trocar um preço no JSON muda o valor mostrado.
- **Conciliação:** o valor pela tabela aparece ao lado do gasto registrado (o que os tetos usam). Diferença acima
  de 1% marca `divergente`, e a tela avisa que a tabela pode ter mudado depois da geração. A conciliação não
  altera o gasto registrado nem os tetos.
- **Projetos antigos:** o consumo anterior a esta versão não tem detalhe de tokens. A resposta traz `parcial` e
  `naoDetalhadoUsd` (gasto registrado sem detalhe); não há reconstrução do histórico.
- **Modelo sem preço:** aparece com os tokens, valor "indisponível", em `semPreco`, fora do total.
- É uma conferência interna: a cobrança real é a da página de uso da OpenAI.

## Langfuse

Cada trace leva o `perfil` e, com algum teto, o `orcamento_restante_usd`; cada `generation` leva o papel do
modelo (`papel`). O custo do painel e o do Langfuse partem do mesmo `usage` e da mesma tarifa.

## Arquivos de estado

- `scr/uso.json` (por projeto, gravação atômica): gasto por dia/etapa/modelo, calibração, tetos ajustados,
  perfil, escolha de modelos por papel (`modelosEscolhidos`), consumo bruto de tokens por etapa/dia e modelo (`consumo`), pausa, disparos do disjuntor e unidades puladas. Um disparo pendente **sobrevive a reinícios**.
- `.uso-diario.json` (global, na raiz do app; ignorado pelo git): gasto do dia. Só é mantido com
  `ORCAMENTO_DIA_MAX_USD` configurado; se não puder ser lido ou gravado, o teto diário fica desligado com
  um aviso e a geração não é bloqueada.
