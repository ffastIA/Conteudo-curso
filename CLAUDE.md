# Gerador de Conteúdo Educacional

Leia `PROJECT.md` antes de qualquer mudança — é o guia canônico
(arquitetura §3, modelos de dados §4, catálogo de skills §5, padrões de
código §8, gaps priorizados §9, non-goals §10).

## Comandos
- `npm test` — suíte Jest (deve ficar verde antes e depois de qualquer mudança)
- `npm run test:coverage` — cobertura com gate de 40% de linhas
- `node server.js` — sobe em http://localhost:3000 (requer `.env`, ver `.env.example`)

## Regras que sempre se aplicam (resumo do PROJECT.md §8/§10)
- Nenhuma dependência npm nova sem aprovação explícita.
- Toda operação assíncrona nova usa SSE (nunca polling/WebSockets).
- Toda etapa geradora persiste `.txt` + `.docx` e injeta o contexto
  pedagógico via `pedagCtxBlock(...)`.
- Commits em português.
- Non-goals permanentes: códigos BNCC específicos, certificação oficial,
  PPC regulado (SENAI/SENAC/MEC), multi-tenancy/autenticação, WebSockets.

## Mudanças de funcionalidade
Propostas via workflow OpenSpec (`openspec/`) — ver PROJECT.md §11.
