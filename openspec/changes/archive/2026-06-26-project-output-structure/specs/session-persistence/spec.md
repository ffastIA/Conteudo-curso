## MODIFIED Requirements

### Requirement: Campos de sessão persistidos em disco
A sessão em memória SHALL ter os campos `bncc`, `metodologia`, `aulas` (LessonMeta[]) e `inputs` persistidos em `projeto.json` dentro de `courseScrDir(sess)` a cada etapa concluída. Arquivos `.txt` de memória SHALL ser salvos em `courseScrDir(sess)`. Arquivos `.docx` de exportação SHALL ser salvos em `courseRootDir(sess)`.

#### Scenario: Sessão com BNCC ativo persistida
- **WHEN** qualquer etapa é concluída e `sess.bncc.ativo === true`
- **THEN** `{courseScrDir}/projeto.json` contém `{ bncc: { ativo: true, publico, nivel, itens: [...] } }`

#### Scenario: Sessão sem BNCC persistida
- **WHEN** qualquer etapa é concluída e `sess.bncc.ativo === false`
- **THEN** `{courseScrDir}/projeto.json` contém `{ bncc: { ativo: false, publico: null, nivel: null, itens: [] } }`

#### Scenario: Metodologia persistida
- **WHEN** qualquer etapa é concluída após `sess.metodologia` ser definida
- **THEN** `{courseScrDir}/projeto.json` contém `{ metodologia: "..." }` com o texto completo

#### Scenario: Array de aulas persistido
- **WHEN** a Etapa 4 (plano de aulas) é concluída e `sess.aulas` está populado
- **THEN** `{courseScrDir}/projeto.json` contém `{ aulas: [{ titulo, modulo, objetivos }, ...] }` com todas as aulas

---

### Requirement: Reconexão de sessão após restart do servidor
O sistema SHALL ser capaz de reconstruir uma sessão funcional completa a partir dos arquivos em disco, sem nenhuma chamada à OpenAI, quando o usuário retomar um projeto após perda de sessão.

#### Scenario: Restart com projeto.json presente em /scr
- **WHEN** o servidor reinicia, o usuário retorna ao browser e seleciona o projeto pelo nome
- **THEN** `sess.config` (incluindo `pastaProjeto`), `sess.bncc`, `sess.metodologia`, `sess.aulas` e `sess.inputs` são restaurados do `{courseScrDir}/projeto.json`, e campos textuais são restaurados dos `.txt` via `readMemory()` a partir de `courseScrDir`

#### Scenario: Etapas concluídas antes desta change (sem /scr — migração automática)
- **WHEN** o usuário tenta carregar um projeto cujo diretório tem `.txt` e `projeto.json` na raiz plana (sem `/scr`)
- **THEN** o sistema migra os arquivos para `/scr`, carrega normalmente, sinaliza campos disponíveis; sem perda de dados

#### Scenario: projeto.json corrompido
- **WHEN** `projeto.json` existe mas não é JSON válido
- **THEN** o sistema ignora o `projeto.json`, carrega apenas os `.txt` disponíveis e retorna `{ ok: true, aviso: "projeto.json corrompido — campos estruturados não carregados" }`

## REMOVED Requirements

### Requirement: pastaSaida como campo isolado de sessão
**Reason**: Substituído por `pastaProjeto` dentro de `sess.config`, que é persistido em `projeto.json` e restaurado via `carregar-projeto`. O endpoint `POST /api/pasta-saida` é removido.
**Migration**: Usar o campo `pastaProjeto` no formulário da Etapa 1 (campo "Pasta do projeto"). O valor é salvo com as demais configurações do curso via `POST /api/config`.
