## Why

O app já mede e limita custo de forma básica (change `custo-e-logs`): soma o custo real por projeto (`custoProjetoUsd`), mostra uma estimativa prévia por etapa (`GET /api/estimativa`), aceita **um** teto (`ORCAMENTO_USD`) que aborta a etapa com erro SSE e tem um disjuntor que só conta falhas consecutivas da API. Isso protege de um acidente grosseiro, mas não governa o gasto das etapas que mais o multiplicam: pesquisa por módulo, geração por seções, avaliação em map-reduce e ciclos de melhoria.

Medido na linha de base real (curso `capcut`, 3 aulas, geração por seções): ~US$ 0,50 em 41 chamadas; o conteúdo de **uma aula** faz ~8 chamadas e ~108 mil tokens de entrada. Um curso de 20 aulas custa uma ordem de grandeza acima, e um ciclo de melhoria que não converge ou uma continuação em laço gastam sem que o usuário veja. Hoje o que existe falha em quatro pontos:

- **Um teto só e sem aviso**: não há alerta antes de estourar, nem teto por dia ou por etapa; ao estourar, a etapa aborta com um erro e o usuário não tem como "aumentar o teto e continuar".
- **Sem controle de quanto gastar por aula**: não há perfis (econômico/padrão/premium) que mudem número de consultas, modelo e ciclos; a única alavanca é editar variáveis de ambiente.
- **Um modelo por etapa, sem roteamento por tarefa**: o modelo forte (ou o fraco) vale para todas as chamadas de uma etapa, inclusive o juiz das versões de uma aula, que poderia usar o modelo forte só nos casos duvidosos.
- **Disjuntor cego ao custo**: ele não enxerga uma aula que custa 3× a estimativa, o mesmo erro repetido, um ciclo de melhoria sem ganho ou continuações esgotadas.

O plano `Implementacoes231016.pdf` (Fase 1C, "Governança de custo") descreve esta change. Ela fecha o que a `custo-e-logs` deixou como versão reduzida e é pré-requisito do teto de gasto do HeyGen citado na Fase 1D.

## What Changes

- **Orçamento em três escopos** — projeto (`ORCAMENTO_MAX_USD`), dia (`ORCAMENTO_DIA_MAX_USD`) e etapa (`ORCAMENTO_ETAPA_MAX_USD`) —, com **reserva antes da chamada e acerto depois** (a estimativa reserva o saldo; o `usage` real corrige), alerta em 80% (`ORCAMENTO_ALERTA_PCT`) e **pausa** em 100%. `ORCAMENTO_USD` continua valendo como sinônimo de `ORCAMENTO_MAX_USD`.
- **`scr/uso.json`** por projeto (gasto por dia, etapa e modelo, com gravação atômica, preservado por carregar-projeto e importar) e um arquivo global de gasto diário para o teto por dia.
- **Pausa e retomada**: ao bater o teto, a etapa para com o evento SSE `pausado_orcamento` (gasto, teto, estimativa da próxima chamada e opções); o usuário aumenta o teto ou troca o perfil e a etapa **retoma pelo mecanismo de retomada já existente** (`geracao-retomavel`), sem refazer o que já foi gerado.
- **Perfis Econômico, Padrão e Premium** (`CUSTO_PERFIL`, padrão `padrao`) que definem número de consultas de pesquisa, contexto de busca, modelo de redação, ciclos de melhoria, fontes por seção e uso do juiz forte; **degradação automática** de perfil ao atingir o alerta, com aviso ao usuário.
- **Roteamento de modelos por papel** (pesquisa, resumos, redação, avaliação de primeira passada, juiz final), configurável por variável, com validação na inicialização, e **juiz final em cascata** (modelo forte só quando o caso é duvidoso).
- **Disjuntor com quatro gatilhos novos** além das falhas da API: custo real da aula acima de um múltiplo da estimativa, mesmo erro repetido, ciclo de melhoria sem ganho mínimo e continuações no limite. Ao disparar, interrompe a etapa, registra o motivo, marca a aula incompleta (texto parcial em `.partial`, nunca no arquivo oficial) e pede a decisão do usuário.
- **Estimativa calibrada**: razão estimado/real acumulada em `uso.json`, com margem de segurança, e a cobrança por chamada da busca web configurável.
- **Interface**: painel com saldo restante, gasto por etapa, perfil ativo e alertas; confirmação quando a estimativa de uma etapa é maior que o saldo restante; os mesmos números no Langfuse.
- Rotas `GET /api/orcamento` e `POST /api/orcamento`.

## Capabilities

### New Capabilities
- `cost-budget`: tetos por escopo, reserva e acerto, alerta, pausa, retomada, `uso.json`, painel e paridade com o Langfuse.
- `cost-profiles`: perfis, degradação automática, roteamento de modelos por papel, validação na inicialização e juiz final em cascata.
- `cost-circuit-breaker`: os gatilhos do disjuntor, o tratamento da aula incompleta e a decisão do usuário.

### Modified Capabilities
- `cost-estimation`: a trava de orçamento deixa de ser um teto único que só aborta (passa a ser tratada por `cost-budget`), e a estimativa ganha calibração, margem e a tarifa da busca web.

## Impact

- **`custo.js`**: reserva/acerto, escopos, perfis, calibração, gatilhos do disjuntor.
- **`server.js`**: `chamarOpenAI` (reserva antes, acerto depois, roteamento por papel), tratamento de `ORCAMENTO_EXCEDIDO`/`DISJUNTOR_*` nas etapas SSE, rotas de orçamento, persistência de `uso.json`, integração com a retomada e com `.partial`.
- **`config/modelos.js`** (papéis), **`config/precos-modelos.json`** (tarifa da busca web) e um novo `config/perfis-custo.json`.
- **`public/index.html`, `public/app.js`**: painel de orçamento, confirmação de estimativa e decisão após pausa/disjuntor.
- **`observabilidade.js`**: sem mudança de contrato; metadados de trace (`perfil`, `orcamento_restante_usd`) via `definirMetadadoTrace`.
- **`tests/`**: cenários de orçamento baixo simulado, os gatilhos do disjuntor, o teste estático de "nenhuma chamada sem reserva" e a calibração.
- **Docs**: `.env.example`, `PROJECT.md` (handlers, modelo de dados, capabilities), `README.md` (rotas), `docs/`.
- Sem dependência npm nova; SSE para todo fluxo assíncrono; persistência `.txt` + `.docx` das etapas preservada.

## Non-goals

- **Segunda linha de base**: o curso de referência adicional foi descartado por decisão do usuário (2026-10-25). A calibração e o critério de saída de 25% de erro são validados só com o `capcut`; um curso muito diferente pode ficar fora da faixa e a estimativa continua rotulada como estimativa.
- **Otimizações de tokens da Fase 1C.5** (cache de prompt por reordenação, avaliação incremental por hash de seção, cache de pesquisa entre projetos, Batch API): ficam para uma change própria. Já existem a parada por convergência (`EPSILON_CONVERGENCIA`) e a detecção de seções alteradas.
- **Tetos com valores padrão**: nenhum teto vem ligado por padrão; os valores sugeridos no PDF são ilustrativos e o usuário os define depois de ver o custo real.
- **HeyGen e Gamma fora dos tetos**: o saldo do HeyGen continua sendo acompanhado à parte (`observabilidade-heygen`); os tetos desta change cobrem só a OpenAI.
- **Bloquear geração por saldo do HeyGen** e acompanhamento de uso do Gamma.
- **Autenticação, multiusuário, WebSockets**: o painel é local e usa SSE/HTTP, como o resto do app.
- **Extrair módulos do `server.js`**: não faz parte desta change.

## Gaps resolvidos

B11 (gasto sem governança), a parte de custo de A7 e G08 (custo e limites por etapa).
