## MODIFIED Requirements

### Requirement: Aplicação de melhorias por aula com confirmação
Após o upload, o sistema SHALL exibir ao usuário um resumo das observações encontradas e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL: (1) criar snapshot do conteúdo atual, (2) revisar cada aula individualmente aplicando as melhorias, (3) calcular métricas de mudança por aula, (4) avisar sobre aulas pouco alteradas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de iniciar o processamento, caso a sessão em memória esteja vazia. O sistema SHALL passar o conteúdo integral de cada aula (sem truncamento) para `aplicarMelhoriasSkill` — o parâmetro `conteudoAtual` SHALL receber `aula.texto` sem limitação de caracteres.

#### Scenario: Conteúdo integral passado ao modelo
- **WHEN** `aplicarMelhoriasSkill` é invocada para qualquer aula
- **THEN** o parâmetro `conteudoAtual` contém o texto completo da aula sem truncamento
- **THEN** o modelo recebe e pode aplicar melhorias em qualquer parte da aula, independentemente do tamanho
