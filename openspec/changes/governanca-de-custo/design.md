## Context

Todas as chamadas à OpenAI passam por `chamarOpenAI` (`server.js`), que já faz, antes da chamada, a trava de `ORCAMENTO_USD` e a consulta ao disjuntor de falhas, e, depois, registra a `generation` (tokens, custo) e soma o custo em `sess.custoProjetoUsd`. O módulo `custo.js` tem a estimativa por etapa (`PERFIS` de estimativa por unidade: módulo/aula), `estimarCustoChamada`, `verificarOrcamento` e `criarDisjuntor`. Os preços vêm de `config/precos-modelos.json` e os modelos de `config/modelos.js` (pesquisa, conteúdo e economia, por variável de ambiente).

O que já existe e esta change reaproveita, sem duplicar:
- **Retomada**: `geracao-retomavel` grava o progresso por aula/seção e a nova execução só gera o que falta.
- **Aula incompleta**: texto parcial em `aulaNN_conteudo.partial.txt`, nunca no arquivo oficial.
- **Continuações**: `MAX_CONTINUACOES_CONTEUDO` e `MAX_CONTINUACOES_MELHORIA` (2).
- **Parada por convergência**: `EPSILON_CONVERGENCIA` (0,02) e o gate de ganho de nota nos ciclos de melhoria.
- **Juiz das versões**: `julgarVersoes`, que decide entre o texto antigo e o mesclado.
- **Estado persistente do app**: `.ultima-pasta.json` na raiz do projeto, redirecionável por variável (`ULTIMA_PASTA_FILE`) nos testes.
- **Observabilidade**: `definirMetadadoTrace` e o score por trace.

Restrições: sem dependência npm nova; SSE para fluxos assíncronos; o app é local (127.0.0.1) e sem autenticação; a governança nunca pode corromper um arquivo de geração (gravação atômica); desligada por padrão (sem teto configurado, o comportamento atual não muda).

## Goals / Non-Goals

**Goals:** nenhum gasto acima de um teto configurado, além da margem de uma chamada; aviso antes do estouro; parada que pode ser retomada sem refazer trabalho; perfis que trocam custo por qualidade de forma previsível; modelo forte só onde compensa; interrupção de comportamento anormal (laços) com decisão do usuário.

**Non-Goals:** ver `proposal.md` (segunda linha de base, otimizações 1C.5, HeyGen/Gamma, valores padrão de teto).

## Decisions

### D1. Reserva antes, acerto depois, dentro do wrapper

`chamarOpenAI` passa a: (1) estimar o custo da chamada com `estimarCustoChamada` aplicando a margem de segurança (D6); (2) **reservar** esse valor no acumulador de cada escopo; se algum escopo (projeto, dia, etapa) não comporta a reserva, a chamada **não é feita** e o erro de orçamento (`ORCAMENTO_EXCEDIDO`) segue para o fluxo de pausa (D3); (3) após a resposta, **acertar**: substituir a reserva pelo custo real do `usage` (ou liberar a reserva se a chamada falhou antes de gastar). A reserva existe porque várias chamadas podem estar em voo (pesquisa em paralelo, seções): sem ela, todas veriam o mesmo saldo e o teto seria ultrapassado por todas ao mesmo tempo.

Escopos e semântica:
- **Projeto**: soma de tudo no projeto (`ORCAMENTO_MAX_USD`; `ORCAMENTO_USD` é aceito como sinônimo, com aviso de depreciação único).
- **Dia**: soma do dia corrente (data local) em **todos os projetos desta máquina** (`ORCAMENTO_DIA_MAX_USD`), guardada num arquivo global ao lado de `.ultima-pasta.json` (`.uso-diario.json`, redirecionável por `USO_DIARIO_FILE` nos testes).
- **Etapa**: soma de uma etapa dentro do projeto (`ORCAMENTO_ETAPA_MAX_USD`), por nome de etapa (`conteudo`, `pesquisa-modulos`, `revisao`…).

A garantia é "não exceder o teto além do erro de estimativa de **uma** chamada": o acerto pode revelar um custo real maior que a reserva; a chamada seguinte já encontra o saldo corrigido e é barrada. O teste estático existente de "toda chamada passa pelo wrapper" garante que nenhuma chamada fique sem reserva.

*Alternativa descartada:* só conferir o acumulado antes de cada chamada (como hoje). Com chamadas concorrentes, estoura o teto por várias chamadas ao mesmo tempo.

### D2. `scr/uso.json` e o arquivo global

O arquivo diário é **relido a cada uso** (é minúsculo), sem cache em memória, para refletir o gasto de outros projetos e processos.

`scr/uso.json` (por projeto) guarda: gasto por dia, por etapa e por modelo, a calibração (D6), os tetos ajustados pelo usuário e o estado de pausa. Gravação **atômica** (escrever em arquivo temporário e renomear) para que queda do servidor não deixe JSON truncado; leitura tolerante (arquivo ausente ou corrompido vira estado vazio, com aviso). É preservado por carregar-projeto e importar, como `projeto.json` e `geracao_log.json`. `.uso-diario.json` guarda só `{ data, totalUsd }` do dia.

O estado em memória (reservas em voo) **não** é persistido: após uma queda, as reservas somem e vale o gasto acertado, que é o que realmente foi cobrado.

### D3. Pausa e retomada por SSE, sem mecanismo novo

Quando a reserva é negada, o handler da etapa converte `ORCAMENTO_EXCEDIDO` no evento SSE `pausado_orcamento` com `{ escopo, gastoUsd, tetoUsd, estimativaProximaUsd, opcoes: ['aumentar-teto', 'trocar-perfil', 'cancelar'] }` e encerra a etapa com o estado `pausado_orcamento` gravado em `uso.json`. O trabalho já feito fica salvo pela retomada existente (aulas prontas, `.partial`). O usuário decide na interface (`POST /api/orcamento`): aumentar o teto do escopo, trocar de perfil ou cancelar. Para continuar, ele **executa a etapa de novo**, que retoma o que faltava. Nenhuma tarefa em segundo plano é criada: continua tudo em SSE.

O alerta em `ORCAMENTO_ALERTA_PCT` (padrão 80) emite o evento SSE `alerta_orcamento` uma vez por escopo e por teto; aumentar o teto rearma o alerta.

### D4. Perfis e degradação automática

Um perfil é um pacote de parâmetros em `config/perfis-custo.json`, lido em tempo de execução (sem reiniciar) e com valores editáveis:

| Parâmetro | Econômico | Padrão | Premium |
|---|---|---|---|
| consultas de pesquisa por módulo | 2 | 4 | 5 |
| contexto da busca web | baixo | médio | alto |
| modelo de redação | pequeno | intermediário | melhor disponível |
| ciclos de melhoria (máx.) | 1 | 2 | 3 |
| achados da pesquisa no dossiê de cada aula | 3 | 6 | 8 |
| juiz final forte | nunca | só em casos duvidosos | sempre |

O dossiê hoje limita **achados por aula** (6), não fontes por seção; o padrão 6 preserva o comportamento atual. A consulta extra da BNCC não conta no número de consultas, e o máximo de ciclos só é imposto com teto ou perfil escolhido de propósito (senão os ciclos seguem ilimitados). Os valores acima são **ilustrativos** (vêm do plano) e ficam no arquivo de configuração; os modelos de cada perfil apontam para os papéis de D5, nunca para um nome de modelo fixo no código. `CUSTO_PERFIL` escolhe o perfil (padrão `padrao`); o perfil é um valor por projeto, guardado em `uso.json`, e o painel mostra o ativo.

**Degradação automática** (decisão 12 do plano): quando **qualquer** escopo atinge o alerta de 80% e o perfil ativo não é o Econômico, o perfil desce **um nível por vez**, **entre unidades de trabalho** (nunca no meio de uma aula ou seção), com o evento SSE `perfil_alterado` informando o motivo. Nunca sobe sozinho. `CUSTO_DEGRADACAO_AUTOMATICA=false` desliga. Sem nenhum teto configurado, nada degrada.

### D5. Roteamento de modelos por papel

Cinco papéis, cada um com um modelo configurável. Reaproveita os nomes que já existem (`OPENAI_RESEARCH_MODEL`, `OPENAI_CONTENT_MODEL`, `OPENAI_ECONOMY_MODEL`) e acrescenta os que faltam, **no mesmo padrão `OPENAI_<PAPEL>_MODEL`** (o plano sugeria `OPENAI_MODEL_<PAPEL>`; mantém-se o padrão do projeto para não ter dois estilos):

| Papel | Variável | Quando é usado |
|---|---|---|
| pesquisa | `OPENAI_RESEARCH_MODEL` (existe) | busca web |
| resumos e roteiros | `OPENAI_SUMMARY_MODEL` (novo; padrão = economia) | ementa, planos, roteiro, resumos |
| redação | `OPENAI_CONTENT_MODEL` (existe) | seções e aulas |
| avaliação de primeira passada | `OPENAI_EVAL_MODEL` (novo; padrão = economia) | revisão e notas por rubrica |
| juiz final | `OPENAI_JUDGE_MODEL` (novo; padrão = redação) | `julgarVersoes` e desempate de nota |

Cada função de papel devolve o modelo na hora da chamada (lê o ambiente e o perfil), como `config/modelos.js` já faz. **Validação na inicialização**: uma tabela de capacidades configurável (`config/modelos-capacidades.json`: modelos conhecidos e o que aceitam, como busca web e saída estruturada) confere cada papel; modelo desconhecido ou sem a capacidade exigida gera **aviso** no log e na tela do painel, **não** erro, porque a OpenAI lança modelos novos e a tabela envelhece.

**Cascata do juiz final.** O juiz de primeira passada decide; o juiz forte só entra quando: (a) o ganho de nota do candidato fica a até `JUIZ_MARGEM_GANHO` do limiar de aceitação já existente (`EPSILON_CONVERGENCIA`); ou (b) a nota da rubrica e o componente determinístico divergem em mais que `JUIZ_DIVERGENCIA_MAX`. Casos claramente bons ou ruins não acionam o forte. O perfil Premium aciona sempre; o Econômico nunca. Os valores padrão são ilustrativos.

### D6. Estimativa calibrada e tarifa da busca web

A estimativa de uma chamada continua por caracteres (≈ 4 por token), mas passa a ser multiplicada por um **fator de calibração** por etapa: a média móvel da razão `real / estimado`, atualizada a cada acerto (D1) e guardada em `uso.json`, limitada a uma faixa (0,5× a 3×) para que um valor atípico não domine. A reserva usa o estimado calibrado mais uma **margem de segurança** (`ORCAMENTO_MARGEM_PCT`, padrão 15). A estimativa prévia por etapa (`/api/estimativa`) usa o mesmo fator. A estimativa segue rotulada como estimativa e em faixa.

A cobrança por chamada da ferramenta de busca web entra num campo configurável em `config/precos-modelos.json` (`buscaWebPorChamadaUsd`). **O valor padrão é 0**, não um preço inventado: com 0, o custo continua subestimado (como hoje) e o painel avisa que a tarifa da busca não está configurada; o usuário preenche conforme a tabela de preços da OpenAI.

### D7. Disjuntor: quatro gatilhos novos, um só mecanismo

`criarDisjuntor` continua contando falhas consecutivas da API e ganha um registro de **gatilhos por unidade de trabalho**:
1. **custo**: o custo real de uma aula passa de `DISJUNTOR_FATOR_CUSTO` (padrão 2) vezes a estimativa dela;
2. **erro repetido**: o mesmo código de erro `DISJUNTOR_ERROS_SEGUIDOS` (padrão 3) vezes seguidas;
3. **sem ganho**: um ciclo de melhoria termina com ganho médio menor que `DISJUNTOR_GANHO_MIN` (padrão = `EPSILON_CONVERGENCIA`); passa a **interromper** em vez de apenas avisar, conforme o perfil;
4. **continuações no limite**: a unidade esgotou `MAX_CONTINUACOES_*` sem terminar.

Ao disparar, a etapa **para**, registra o motivo em `uso.json` e no log, marca a aula como incompleta (o texto parcial vai para `.partial`, como já ocorre), emite o evento SSE `disjuntor` e pede a decisão do usuário: aumentar o limite do gatilho, trocar de perfil ou pular a aula. **O reset é manual** (a decisão do usuário). O gatilho 3 reaproveita o histórico de scores existente.

### D8. Interface e Langfuse

`GET /api/orcamento` devolve tetos, gasto por escopo/etapa/modelo, saldo restante, perfil, alertas, estado de pausa/disjuntor e a calibração; `POST /api/orcamento` ajusta tetos, troca o perfil e registra a decisão após pausa ou disjuntor. O painel do app mostra esses números e, **antes de iniciar uma etapa pesada**, confirma com o usuário quando a estimativa (a faixa máxima) é maior que o saldo restante. Cada trace leva, via `definirMetadadoTrace`, o perfil e o saldo restante no fim, e cada `generation` leva o papel como metadado; o gasto por etapa do painel e o somado no Langfuse partem do mesmo `usage`.

## Risks / Trade-offs

- **Reserva superestimada bloqueia cedo.** Margem de 15% e calibração mitigam; o painel mostra reserva e gasto real separados, e a margem é configurável.
- **Estimativa calibrada com um só curso de referência.** Decisão do usuário (sem segunda linha de base); a faixa limitada de calibração (0,5× a 3×) e o rótulo de "estimativa" mitigam, e o fator se ajusta sozinho conforme o uso real.
- **Teto diário global** exige um arquivo fora do projeto; se ele não puder ser gravado, o escopo dia fica **desligado com aviso** (nunca bloqueia a geração por falha de gravação).
- **Degradação no meio de um lote** muda a qualidade entre aulas; por isso só ocorre entre unidades e é sempre avisada.
- **Tabela de capacidades desatualizada** gera avisos falsos; é só aviso e editável.
- **Mais código no caminho de toda chamada** (`chamarOpenAI`). Mitigado por testes de integração com mock, por manter a governança desligada sem teto (custo zero) e pelo teste estático que impede chamadas fora do wrapper.
- **Gatilho 3 passa a interromper** onde hoje só avisa: pode surpreender; por isso depende do perfil (Econômico/Padrão interrompem; Premium só avisa) e o limiar é configurável.
