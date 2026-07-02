## MODIFIED Requirements

### Requirement: Campos de sessão persistidos em disco
A sessão em memória SHALL ter os campos `bncc`, `metodologia` e `aulas` (LessonMeta[]) persistidos em `projeto.json` a cada etapa concluída, além dos campos textuais já persistidos individualmente como `.txt`.

#### Scenario: Sessão com BNCC ativo persistida
- **WHEN** qualquer etapa é concluída e `sess.bncc.ativo === true`
- **THEN** `projeto.json` contém `{ bncc: { ativo: true, publico, nivel, itens: [...] } }`

#### Scenario: Sessão sem BNCC persistida
- **WHEN** qualquer etapa é concluída e `sess.bncc.ativo === false`
- **THEN** `projeto.json` contém `{ bncc: { ativo: false, publico: null, nivel: null, itens: [] } }`

#### Scenario: Metodologia persistida
- **WHEN** qualquer etapa é concluída após `sess.metodologia` ser definida
- **THEN** `projeto.json` contém `{ metodologia: "..." }` com o texto completo

#### Scenario: Array de aulas persistido
- **WHEN** a Etapa 4 (plano de aulas) é concluída e `sess.aulas` está populado
- **THEN** `projeto.json` contém `{ aulas: [{ titulo, modulo, objetivos }, ...] }` com todas as aulas

---

### Requirement: Reconexão de sessão após restart do servidor
O sistema SHALL ser capaz de reconstruir uma sessão funcional completa a partir dos arquivos em disco, sem nenhuma chamada à OpenAI, quando o usuário retomar um projeto após perda de sessão.

#### Scenario: Restart com projeto.json presente
- **WHEN** o servidor reinicia, o usuário retorna ao browser e seleciona o projeto pelo nome
- **THEN** `sess.config`, `sess.bncc`, `sess.metodologia` e `sess.aulas` são restaurados do `projeto.json`, e campos textuais são restaurados dos `.txt` via `readMemory()`

#### Scenario: Etapas concluídas antes desta change (sem projeto.json)
- **WHEN** o usuário tenta carregar um projeto cujo diretório tem `.txt` mas não tem `projeto.json`
- **THEN** o sistema carrega os campos textuais disponíveis, sinaliza `camposFaltantes: ["bncc", "metodologia", "aulas"]` e o usuário pode reinserir esses campos nas etapas correspondentes sem precisar regenerar os textos

#### Scenario: projeto.json corrompido
- **WHEN** `projeto.json` existe mas não é JSON válido
- **THEN** o sistema ignora o `projeto.json`, carrega apenas os `.txt` disponíveis e retorna `{ ok: true, aviso: "projeto.json corrompido — campos estruturados não carregados" }`
