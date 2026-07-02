## Why

O botão "Derivar Metodologia" hoje vive na Etapa 0, mas seu texto de ajuda já avisa "Preencha a Etapa 1 primeiro" — uma contradição de ordem que discutimos e confirmamos no código: nada impede o clique antes da Etapa 1 existir, e nesse caso a IA recebe "não informado" em cada campo, produzindo uma recomendação genérica sem aviso claro ao usuário. Além disso, a metodologia gerada nunca é salva em disco nem pode ser editada/reimportada como as demais etapas do pipeline (ementa, pesquisa, plano de ensino etc.), e não existe um momento explícito em que o sistema "trava" qual versão da metodologia será usada dali para frente. Este change resolve os três problemas juntos: move a geração para o fim da Etapa 1 (quando o perfil do curso já existe de verdade), dá à metodologia o mesmo tratamento de arquivo editável das demais etapas, e define um ponto de confirmação explícito.

## What Changes

- **BREAKING**: o botão de geração de metodologia sai da Etapa 0 e passa a ser o botão final da Etapa 1 (Configuração), renomeado de "⚙ Derivar Metodologia" para **"Gerar Metodologia"**. Ele passa a salvar a configuração (`POST /api/config`, mesma validação de hoje) e encadear a geração da metodologia, exibindo o resultado num card ao final da própria Etapa 1 — sem navegar para a Etapa 2 ainda.
- A metodologia gerada passa a poder ser exportada como `.docx`, editada externamente e reimportada — exatamente como já funciona para ementa, pesquisa, plano de ensino, plano de aula e revisão de qualidade — reaproveitando os componentes genéricos de exportar/importar já existentes.
- Novo botão final **"💾 Salvar e ir para Etapa 2 →"**: só ao clicar nele o sistema (a) persiste a metodologia em disco (`metodologia.txt`/`metodologia.docx`, seguindo o mesmo padrão de `persistStage` usado pelas demais etapas — hoje a metodologia nunca é persistida), (b) gera a ementa (que passa a depender da metodologia já definitiva, veja abaixo), e (c) só então avança para a Etapa 2.
- **BREAKING**: a geração automática da ementa deixa de acontecer dentro de `POST /api/config` e passa a acontecer no momento da confirmação da metodologia (novo endpoint), porque agora a Etapa 1 é preenchida ANTES de a metodologia existir — gerar a ementa no `POST /api/config`, como hoje, produziria uma ementa sem alinhamento metodológico.
- A Etapa 0 perde todo o bloco de metodologia. Passa a conter apenas: (a) o card de abrir projeto existente (já implementado em `add-load-project-by-folder`) e (b) o fluxo de alinhamento à BNCC (perguntar se o curso segue a BNCC e, se sim, quais habilidades/competências). Ao concluir a pergunta da BNCC (com ou sem alinhamento), o sistema vai direto para a Etapa 1 — sem etapa intermediária.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `pedagogical-methodology`: a derivação da metodologia deixa de ocorrer na Etapa 0 e passa a ocorrer ao final da Etapa 1; a metodologia passa a ser exportável/editável/reimportável como as demais etapas; e passa a haver um momento explícito de confirmação que a torna definitiva para as etapas seguintes.
- `course-config`: a geração automática da ementa deixa de ocorrer dentro de `POST /api/config` e passa a ocorrer na confirmação da metodologia, preservando a lógica existente de só regenerar quando `!sess.ementa || conteudoMudou`.

## Impact

- `public/index.html`: remove o bloco `#metodologiaContainer` da Etapa 0 (~linhas 104-122); adiciona um novo card de metodologia ao final da Etapa 1; renomeia o botão de submit do `#configForm`.
- `public/app.js`: `derivarMetodologia()` e seus handlers relocados/adaptados; handlers de conclusão da pergunta BNCC (`btnBnccNao`, `btnConfirmarBncc`) passam a navegar direto para a Etapa 1; handler de submit do `configForm` reestruturado para encadear a geração de metodologia em vez de navegar direto para a Etapa 2; `STAGE_BADGE_MAP` ganha uma entrada para `metodologia`.
- `server.js`: `POST /api/config` para de gerar ementa (guarda a decisão para depois); novo endpoint `POST /api/metodologia/confirmar` (gera ementa pendente + persiste metodologia via `persistStage`); `STAGES_FIXOS` e `stepLabels`/`textMap` de `POST /api/export/:step` ganham entradas para `metodologia`.
- Nenhuma dependência externa nova; nenhuma mudança de schema de dados persistidos (apenas passam a existir `metodologia.txt`/`metodologia.docx`, que antes não existiam).

## Non-goals

- Não adiciona uma forma de "pular" a geração de metodologia e ir direto para a Etapa 2 — a partir deste change, gerar e confirmar a metodologia é uma etapa obrigatória para avançar (mesmo comportamento de obrigatoriedade já aplicado a `pastaProjeto` em change recente).
- Não bloqueia/desabilita os campos do formulário de configuração após gerar a metodologia pela primeira vez; "↺ Gerar novamente" reprocessa a configuração atual do formulário e gera uma nova metodologia a partir dela.
- Não resolve nem altera a lógica de detecção de mudança de campos pedagógicos (`conteudoMudou`) — apenas adia ONDE a ementa é efetivamente gerada.
- Não migra projetos já existentes que não têm `metodologia.txt`/`metodologia.docx` — eles continuam funcionando normalmente (campo vazio ou já carregado do `projeto.json`), só passam a ganhar esses arquivos na próxima vez que a Etapa 1 for concluída para eles.
