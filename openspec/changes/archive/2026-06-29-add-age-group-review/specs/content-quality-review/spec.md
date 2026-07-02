## MODIFIED Requirements

### Requirement: Geração do relatório de revisão de qualidade
O sistema SHALL gerar um relatório de revisão de qualidade para o conteúdo da Etapa 5, analisando cada aula individualmente contra os artefatos do curso (ementa, plano de ensino, plano de aula) e, quando BNCC ativo, contra as competências/habilidades selecionadas. O relatório SHALL incluir para cada aula uma seção "Adequação à Faixa Etária e Perfil de Público" que avalia se linguagem, complexidade, exemplos e abordagem didática são adequados ao `config.publico` informado, com justificativa pedagógica explícita e sugestões de ajuste quando inadequações forem identificadas. O relatório SHALL ser entregue via SSE streaming e persistido em disco.

#### Scenario: Geração com BNCC inativo
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com sessão que tem `bncc.ativo === false`
- **THEN** o sistema gera um relatório por aula cobrindo: compatibilidade com plano de aula, plano de ensino e ementa; adequação à faixa etária e perfil de público; sobreposições Jaccard; deficiências e sugestões
- **THEN** a seção "Alinhamento BNCC" é omitida do relatório

#### Scenario: Geração com BNCC ativo
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com sessão que tem `bncc.ativo === true` e itens selecionados
- **THEN** o relatório inclui para cada aula uma seção "Alinhamento BNCC" que avalia quais competências/habilidades selecionadas são contempladas, quais estão ausentes e quais são apenas parcialmente abordadas
- **THEN** a seção "Adequação à Faixa Etária e Perfil de Público" também está presente

#### Scenario: Adequação à faixa etária — linguagem e complexidade adequadas
- **WHEN** o conteúdo da aula usa linguagem e nível de complexidade compatíveis com `config.publico`
- **THEN** a seção "Adequação à Faixa Etária e Perfil de Público" confirma a adequação com justificativa pedagógica

#### Scenario: Adequação à faixa etária — inadequação detectada
- **WHEN** o conteúdo usa vocabulário excessivamente técnico para o público-alvo, ou exemplos fora do contexto da faixa etária
- **THEN** a seção aponta as inadequações específicas com justificativa pedagógica
- **THEN** a seção propõe ajustes concretos (reformulação de termos, troca de exemplos, mudança de abordagem)

#### Scenario: Publico não informado
- **WHEN** `config.publico` está vazio ou não foi preenchido
- **THEN** a seção "Adequação à Faixa Etária e Perfil de Público" indica que não foi possível avaliar por ausência de informação sobre o público-alvo
- **THEN** recomenda que o campo seja preenchido na Etapa 1 para que a análise seja realizada

#### Scenario: Pré-condição não satisfeita
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` sem conteúdo gerado (Etapa 5 não concluída)
- **THEN** o sistema retorna erro 400 indicando que a Etapa 5 deve ser concluída antes
