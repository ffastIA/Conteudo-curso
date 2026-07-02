## ADDED Requirements

### Requirement: Geração do relatório de revisão de qualidade
O sistema SHALL gerar um relatório de revisão de qualidade para o conteúdo da Etapa 5, analisando cada aula individualmente contra os artefatos do curso (ementa, plano de ensino, plano de aula) e, quando BNCC ativo, contra as competências/habilidades selecionadas. O relatório SHALL ser entregue via SSE streaming e persistido em disco.

#### Scenario: Geração com BNCC inativo
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com sessão que tem `bncc.ativo === false`
- **THEN** o sistema gera um relatório por aula cobrindo: compatibilidade com plano de aula, plano de ensino e ementa; sobreposições Jaccard; deficiências e sugestões
- **THEN** a seção "Alinhamento BNCC" é omitida do relatório

#### Scenario: Geração com BNCC ativo
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` com sessão que tem `bncc.ativo === true` e itens selecionados
- **THEN** o relatório inclui para cada aula uma seção "Alinhamento BNCC" que avalia quais competências/habilidades selecionadas são contempladas, quais estão ausentes e quais são apenas parcialmente abordadas

#### Scenario: Pré-condição não satisfeita
- **WHEN** o usuário aciona `GET /api/revisao-qualidade` sem conteúdo gerado (Etapa 5 não concluída)
- **THEN** o sistema emite SSE evento `error` com mensagem indicando que a Etapa 5 deve ser concluída antes

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
