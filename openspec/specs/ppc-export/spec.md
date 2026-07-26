## Purpose

Gerar, a partir do pipeline principal já concluído, um Projeto Pedagógico de
Curso (PPC) completo — com as seções complementares não cobertas pelo
pipeline (perfil do egresso, competências, perfil docente, infraestrutura) —
e exportá-lo como `.docx`.

## Requirements

### Requirement: Botão "Gerar PPC" disponível após pipeline completo
O sistema SHALL exibir o botão "Gerar PPC Completo" no frontend após a conclusão do pipeline principal (Etapa 5 ou 6), como ação opcional pós-pipeline, sem ser uma etapa numerada do fluxo.

#### Scenario: Pipeline concluído com Etapa 5
- **WHEN** o usuário conclui a Etapa 5 e `session.conteudo` está preenchido
- **THEN** o botão "Gerar PPC Completo" torna-se visível e clicável na interface

#### Scenario: Pipeline incompleto
- **WHEN** o usuário tenta gerar o PPC sem ter concluído a Etapa 5
- **THEN** o botão permanece desabilitado com tooltip indicando "Conclua a Etapa 5 para gerar o PPC"

---

### Requirement: Geração das seções complementares do PPC
O sistema SHALL executar 4 skills complementares para gerar as seções do PPC não cobertas pelo pipeline principal: `perfilEgressoSkill`, `competenciasSkill`, `perfilDocenteSkill` e `infraestruturaSkill`, todas usando `gpt-4o-mini`.

#### Scenario: Geração do perfil do egresso
- **WHEN** `perfilEgressoSkill` é chamada
- **THEN** o modelo gera descrição do perfil profissional esperado ao concluir o curso, baseado em `config`, `ementa` e `planoEnsino` da sessão

#### Scenario: Geração de competências e habilidades do curso
- **WHEN** `competenciasSkill` é chamada
- **THEN** o modelo gera lista estruturada de competências e habilidades que o aluno desenvolverá, incluindo referências às seleções BNCC quando `session.bncc.ativo === true`

#### Scenario: Geração do perfil docente necessário
- **WHEN** `perfilDocenteSkill` é chamada
- **THEN** o modelo gera descrição do perfil de formação e experiência recomendados para o professor/facilitador do curso

#### Scenario: Geração de infraestrutura necessária
- **WHEN** `infraestruturaSkill` é chamada
- **THEN** o modelo gera lista de recursos, equipamentos, softwares e ambiente necessários para ministrar o curso, baseado no conteúdo e na proporção teórico/prático

---

### Requirement: Montagem e exportação do PPC como .docx
O sistema SHALL montar o documento PPC completo via `ppcAssemblySkill` e exportá-lo como `.docx` usando `buildDocxPPC()`, com estrutura formal de PPC para cursos livres.

**Estrutura do documento PPC:**
1. Capa (nome do curso, instituição se informada, data)
2. Identificação do Curso (nome, modalidade, carga horária, nível, pré-requisitos, público-alvo, proporção teórico/prático)
3. Justificativa (baseada na pesquisa web — Etapa 2)
4. Objetivos Geral e Específicos (baseados em `config.objetivos` e `ementa`)
5. Perfil do Egresso
6. Competências e Habilidades Desenvolvidas (com referências BNCC se ativo)
7. Estrutura Curricular (baseada no plano de ensino e planos de aula)
8. Ementas por Módulo (baseadas na ementa geral e plano de ensino)
9. Metodologia de Ensino (baseada em `session.metodologia`)
10. Critérios de Avaliação (extraídos do plano de ensino)
11. Perfil do Corpo Docente
12. Infraestrutura e Recursos Necessários
13. Bibliografia (extraída do plano de ensino)

#### Scenario: Exportação bem-sucedida do PPC
- **WHEN** o usuário clica em "Exportar PPC" após a geração
- **THEN** o sistema disponibiliza `ppc_completo.docx` para download ou salva em `saídas/{course-slug}/ppc_completo.docx` se `pastaSaida` estiver definida

#### Scenario: PPC com BNCC ativo
- **WHEN** `session.bncc.ativo === true` e o PPC é gerado
- **THEN** a seção "Competências e Habilidades" inclui referência explícita às habilidades/competências BNCC selecionadas com seus códigos e descrições
