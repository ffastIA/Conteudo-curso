## ADDED Requirements

### Requirement: Geração do relatório de revisão de qualidade
O sistema SHALL gerar um relatório de revisão de qualidade para o conteúdo da Etapa 5, analisando cada aula individualmente contra os artefatos do curso (ementa, plano de ensino, plano de aula) e, quando BNCC ativo, contra as competências/habilidades selecionadas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de validar a pré-condição, caso a sessão em memória esteja vazia. O relatório SHALL incluir para cada aula uma seção "Adequação à Faixa Etária e Perfil de Público" que avalia se linguagem, complexidade, exemplos e abordagem didática são adequados ao `config.publico` informado, com justificativa pedagógica explícita e sugestões de ajuste quando inadequações forem identificadas. O relatório SHALL ser entregue via SSE streaming e persistido em disco.

#### Scenario: Geração com sessão populada normalmente
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com `sess.conteudoPorAula` já preenchido
- **THEN** o sistema usa os dados da sessão diretamente e inicia o streaming
- **THEN** o comportamento é idêntico ao fluxo normal sem perda de sessão

#### Scenario: Geração com sessão vazia recuperada do disco
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` e `sess.conteudoPorAula` está vazio (ex: após restart do servidor)
- **THEN** o sistema chama `restoreConteudoPorAula(sess)` antes de validar a pré-condição
- **THEN** se o projeto for encontrado em disco, a sessão é restaurada e o streaming inicia normalmente
- **THEN** nenhuma mensagem de erro é exibida ao usuário

#### Scenario: Pré-condição não satisfeita mesmo após tentativa de restauração
- **WHEN** `restoreConteudoPorAula(sess)` não encontra dados em disco (projeto não existe ou não foi gerado até a Etapa 5)
- **THEN** o sistema retorna HTTP 400 com `{ error: "Conclua a Etapa 5 antes de gerar a revisão de qualidade." }`

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

#### Scenario: Público não informado
- **WHEN** `config.publico` está vazio ou não foi preenchido
- **THEN** a seção "Adequação à Faixa Etária e Perfil de Público" indica que não foi possível avaliar por ausência de informação sobre o público-alvo
- **THEN** recomenda que o campo seja preenchido na Etapa 1 para que a análise seja realizada

---

### Requirement: Detecção de sobreposição Jaccard no relatório
O sistema SHALL calcular a similaridade Jaccard entre o conteúdo de cada aula e o conteúdo das demais aulas. Para pares com similaridade ≥ 55%, o relatório SHALL indicar explicitamente quais aulas se sobrepõem e o trecho aproximado de sobreposição. A detecção SHALL ser apenas informativa — nenhuma regeneração automática ocorre.

#### Scenario: Sobreposição detectada
- **WHEN** duas aulas têm similaridade Jaccard ≥ 55%
- **THEN** o relatório de ambas as aulas inclui uma nota "Sobreposição detectada com Aula N (similaridade: XX%)"
- **THEN** nenhuma ação automática é tomada

#### Scenario: Sem sobreposição
- **WHEN** nenhum par de aulas tem similaridade Jaccard ≥ 55%
- **THEN** a seção "Sobreposições Detectadas" de cada aula exibe "Nenhuma sobreposição significativa detectada"

---

### Requirement: Espaço para observações do revisor humano
O relatório SHALL incluir em cada seção de aula um campo explícito "Observações do Revisor" destinado às anotações humanas. O campo SHALL estar presente no `.docx` gerado como um parágrafo em branco com rótulo visível, permitindo que o revisor escreva diretamente no arquivo antes de devolvê-lo ao sistema.

#### Scenario: Campo presente no .docx
- **WHEN** o `.docx` de revisão é gerado
- **THEN** cada seção de aula contém o heading "Observações do Revisor" seguido de uma linha em branco

---

### Requirement: Exportação do relatório como .docx editável
O sistema SHALL exportar o relatório de revisão de qualidade como arquivo `.docx` editável, estruturado por aula com headings em níveis 1, 2 e 3, compatível com Microsoft Word e LibreOffice Writer. O arquivo SHALL ser disponibilizado para download imediato ao final do streaming.

#### Scenario: Download do .docx após geração
- **WHEN** o stream da Etapa 5★ conclui com evento `done`
- **THEN** o frontend exibe botão "Baixar Revisão (.docx)"
- **THEN** `POST /api/export/revisao-qualidade` gera e entrega o arquivo para download

#### Scenario: Persistência em disco
- **WHEN** o stream da Etapa 5★ conclui
- **THEN** `revisao_qualidade.txt` e `revisao_qualidade.docx` são gravados em `saídas/{curso-slug}/`
- **THEN** `sess.revisaoQualidade` é populado com o texto completo

---

### Requirement: Nota de qualidade por aula
O relatório de revisão de qualidade SHALL incluir, para cada aula, uma nota de qualidade de 0 a 1 (0 = qualidade baixíssima, 1 = qualidade total), fundamentada na aderência ao plano de aula, ao plano de ensino, à ementa, e na gravidade das deficiências identificadas na análise da mesma aula. A nota SHALL ser expressa no texto retornado pela IA em um formato fixo e extraível por regex pelo servidor.

#### Scenario: Nota extraída com sucesso
- **WHEN** a análise de uma aula retorna uma linha no formato "Nota: X.XX"
- **THEN** o sistema extrai o valor numérico e o associa ao número e título daquela aula

#### Scenario: Falha de formatação não interrompe o relatório
- **WHEN** a análise de uma aula não contém uma linha de nota no formato esperado
- **THEN** o sistema atribui "N/A" à nota daquela aula na lista-resumo
- **THEN** a geração do relatório continua normalmente para as demais aulas

#### Scenario: Nota fora da faixa é limitada
- **WHEN** a IA retorna um valor de nota fora do intervalo [0, 1] (ex.: 1.2)
- **THEN** o sistema limita (clamp) o valor ao intervalo [0, 1] antes de exibi-lo

---

### Requirement: Lista-resumo de notas na última página do relatório
O sistema SHALL anexar, como a última seção do relatório de revisão de qualidade, uma lista com o número, título e nota de cada aula, ordenada em ordem crescente pelo número da aula. Essa seção SHALL ser a última adicionada ao conteúdo do relatório, garantindo que ocupe a(s) página(s) final(is) do arquivo `.docx` gerado.

#### Scenario: Lista ordenada por aula
- **WHEN** o relatório de revisão de qualidade é gerado para um curso com N aulas
- **THEN** a seção final "Notas de Qualidade por Aula" lista as N aulas em ordem crescente de número, no formato "Aula X: Título — Nota: 0.XX"

#### Scenario: Seção final sempre na última página
- **WHEN** o relatório é exportado como `.docx`
- **THEN** a lista de notas está posicionada após uma quebra de página, tornando-a a seção final do documento

#### Scenario: Pré-visualização ao vivo não exibe marcadores técnicos
- **WHEN** o relatório é exibido ao vivo no navegador durante o streaming
- **THEN** nenhum marcador técnico de quebra de página aparece como texto visível na tela
