## MODIFIED Requirements

### Requirement: Upload do documento de revisão anotado
O sistema SHALL aceitar o upload de um arquivo `.docx` contendo o relatório de revisão anotado pelo revisor humano. O arquivo SHALL ser enviado via `multipart/form-data` ao endpoint `POST /api/aplicar-melhorias`. O sistema SHALL extrair o texto do `.docx` e apresentar ao usuário um resumo das anotações detectadas antes de aplicar qualquer alteração. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de processar o arquivo, caso a sessão em memória esteja vazia. O sistema SHALL persistir as observações extraídas em `scr/observacoes_pendentes.json` imediatamente após a extração. O sistema SHALL verificar a similaridade Jaccard entre as novas observações e as observações do upload anterior (lidas de `scr/observacoes_pendentes.json`) antes de sobrescrever o arquivo; se a similaridade exceder `DUPLICATE_OBS_THRESHOLD` (0.85) e ambas as partes tiverem conteúdo substantivo, a resposta SHALL incluir `aviso: 'possivel_duplicata'` com o percentual e a data do upload anterior.

#### Scenario: Upload bem-sucedido sem duplicata
- **WHEN** o usuário envia um arquivo `.docx` válido com observações distintas das anteriores
- **THEN** o sistema extrai o texto e identifica as seções "Observações do Revisor" de cada aula
- **THEN** o sistema persiste as observações em `scr/observacoes_pendentes.json`
- **THEN** a resposta retorna `{ ok: true, aulas, totalComObservacoes }` sem campo `aviso`
- **THEN** o frontend habilita o botão "Aplicar Melhorias"

#### Scenario: Upload com documento similar ao anterior (possível duplicata)
- **WHEN** o usuário envia um `.docx` cujas observações têm similaridade Jaccard > 0.85 com o upload anterior
- **THEN** o sistema persiste as novas observações normalmente em `scr/observacoes_pendentes.json`
- **THEN** a resposta retorna `{ ok: true, aulas, totalComObservacoes, aviso: 'possivel_duplicata', similaridadeObservacoes, dataUltimoUpload }`
- **THEN** o frontend exibe banner de alerta âmbar com percentual e data do upload anterior
- **THEN** o botão "Aplicar Melhorias" permanece desabilitado até o usuário escolher "Aplicar mesmo assim" ou "Cancelar"

#### Scenario: Usuário confirma aplicação mesmo com duplicata detectada
- **WHEN** o aviso de duplicata é exibido e o usuário clica "Aplicar mesmo assim"
- **THEN** o banner de aviso é ocultado
- **THEN** o botão "Aplicar Melhorias" é habilitado e o fluxo prossegue normalmente

#### Scenario: Usuário cancela após aviso de duplicata
- **WHEN** o aviso de duplicata é exibido e o usuário clica "Cancelar"
- **THEN** o banner de aviso e o resumo são ocultados
- **THEN** nenhuma alteração é aplicada ao conteúdo

#### Scenario: Primeiro upload (sem histórico anterior)
- **WHEN** `scr/observacoes_pendentes.json` não existe
- **THEN** nenhuma comparação é realizada
- **THEN** o fluxo prossegue normalmente sem aviso de duplicata

#### Scenario: Upload com sessão vazia recuperada do disco
- **WHEN** o usuário envia um arquivo `.docx` válido mas `sess.conteudoPorAula` está vazio
- **THEN** o sistema restaura `conteudoPorAula` a partir do disco antes de processar o arquivo
- **THEN** o processamento prossegue normalmente, identificando as observações por aula
- **THEN** a resposta retorna o número correto de aulas e de aulas com observações

#### Scenario: Arquivo inválido ou ausente
- **WHEN** o usuário envia um arquivo que não é `.docx` ou o campo `arquivo` está ausente
- **THEN** o sistema retorna erro 400 com mensagem "Arquivo .docx inválido ou não enviado"
- **THEN** nenhuma alteração é aplicada ao conteúdo

#### Scenario: Nenhuma observação encontrada
- **WHEN** o `.docx` enviado não contém texto nas seções "Observações do Revisor"
- **THEN** o sistema avisa o usuário que nenhuma anotação foi detectada
- **THEN** o sistema ainda oferece a opção de aplicar apenas as sugestões automáticas do relatório original
