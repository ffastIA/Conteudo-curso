## Context

`POST /api/carregar-projeto` recebia um `slug` e localizava o projeto em `path.join(SAIDAS_ROOT, slug)`. Para projetos externos (com `pastaProjeto` registrado em `index.json`), esse caminho não existe ou aponta para uma cópia desatualizada em `saídas/`, fazendo o handler retornar 404 ou carregar `projeto.json` com `pastaProjeto` vazio. A função `GET /api/projetos` já resolvia corretamente o caminho externo via `index.json`, mas `carregar-projeto` não seguia a mesma lógica. O índice global `index.json` é a fonte de verdade canônica para a localização de projetos.

## Goals / Non-Goals

**Goals:**
- `carregar-projeto` resolve `baseDir` via `index.json` antes de tentar o diretório local
- Projetos com `pastaProjeto` não-vazio no índice são carregados a partir do caminho externo
- `sess.config.pastaProjeto` é corretamente populado após o carregamento, fixando as gravações subsequentes
- Migração legada (`migrarSeNecessario`) só roda para projetos locais em `saídas/`

**Non-Goals:**
- Não sincroniza nem copia arquivos entre `saídas/` e o caminho externo
- Não detecta automaticamente o caminho externo quando ele não está em `index.json`
- Não reescreve `index.json` durante o carregamento

## Decisions

### Lookup em `index.json` antes de definir `baseDir`

```javascript
let baseDir = path.join(SAIDAS_ROOT, slug);
try {
  const idx = JSON.parse(fs.readFileSync(path.join(SAIDAS_ROOT, 'index.json'), 'utf-8'));
  if (idx[slug]?.pastaProjeto?.trim()) baseDir = idx[slug].pastaProjeto.trim();
} catch { /* index.json ausente — usa saídas/slug */ }
```

Todas as referências subsequentes a `path.join(SAIDAS_ROOT, slug, 'scr', ...)` são substituídas por `path.join(baseDir, 'scr', ...)`.

**Alternativa considerada:** passar o `pastaProjeto` diretamente no body do request (enviado pelo frontend). Descartada — o frontend não conhece o caminho externo sem ler `index.json` primeiro, e isso duplicaria a lógica de resolução que já existe no servidor.

### Preservação de `pastaProjeto` no branch legado

Quando não há `projeto.json` e o `baseDir` é externo, o config legado deve preservar o caminho:

```javascript
const pastaLegado = baseDir !== path.join(SAIDAS_ROOT, slug) ? baseDir : '';
sess.config = { nome: slug.replace(/_/g, ' '), pastaProjeto: pastaLegado };
```

### Migração legada restrita a projetos locais

`migrarSeNecessario(slug)` reorganiza arquivos dentro de `saídas/{slug}/`, operação inválida para projetos externos (que já têm estrutura correta):

```javascript
if (baseDir === path.join(SAIDAS_ROOT, slug)) migrarSeNecessario(slug);
```

## Risks / Trade-offs

| Risco | Mitigação |
|---|---|
| `index.json` corrompido ou ausente faz fallback silencioso para `saídas/{slug}/` | O `try/catch` garante que o comportamento anterior é preservado |
| `pastaProjeto` em `index.json` aponta para diretório inexistente | A verificação `!fs.existsSync(baseDir)` subsequente retorna 404 corretamente |
| Projeto duplicado em `saídas/` e no caminho externo — qual é o canônico? | O `index.json` é a fonte de verdade; se `pastaProjeto` estiver lá, esse é o canônico |
