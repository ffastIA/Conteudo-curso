## Context

`listarVozesHeygen({ type, language, gender })` (server.js) já repassa
qualquer filtro recebido para `GET /v3/voices` do HeyGen como query params —
a função em si não precisa mudar. O único ponto de decisão é onde aplicar o
valor padrão `"Portuguese"`: na rota (`GET /api/heygen/vozes`) ou dentro do
helper.

## Goals / Non-Goals

**Goals:**
- Vozes em português aparecerem por padrão no menu da Etapa 10, sem exigir
  nenhuma ação extra do usuário.
- Preservar a possibilidade de buscar outro idioma via `?language=` (sem
  remover flexibilidade já existente).

**Non-Goals:**
- Distinguir Brasil de Portugal — a API não expõe essa distinção.
- Filtrar avatares por idioma — não existe esse conceito na API do HeyGen.

## Decisions

**D1 — Default aplicado na rota, não no helper.**
`listarVozesHeygen` continua genérico (sem opinião sobre idioma); o valor
padrão `HEYGEN_VOZES_LANGUAGE_DEFAULT = 'Portuguese'` fica em
`GET /api/heygen/vozes`, porque é uma decisão de produto da Etapa 10
("cursos são em português"), não uma regra da integração com o HeyGen em si.
Mantém o helper reutilizável caso uma etapa futura precise de outro idioma.

## Risks / Trade-offs

- **[Risco] HeyGen adicionar futuramente uma distinção Brasil/Portugal na
  API** → Mitigação: nenhuma — se isso acontecer, é só trocar o valor da
  constante `HEYGEN_VOZES_LANGUAGE_DEFAULT`, mudança trivial e isolada.
