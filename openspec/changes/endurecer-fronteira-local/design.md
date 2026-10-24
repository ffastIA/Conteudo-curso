## Context

Um app local com chaves de API pagas (OpenAI, Gamma, HeyGen) e acesso ao disco não deve ficar exposto na rede por padrão. O deploy recente em múltiplas máquinas/AWS (`env-encryption`) exige que o bind continue configurável.

## Goals / Non-Goals

**Goals:** default seguro e configurável; barrar CSRF básico e acesso a pastas arbitrárias.
**Non-Goals:** autenticação; mudar o modelo de sessão in-memory.

## Decisions

- **D1**: `HOST` default `127.0.0.1`; em container o compose define `HOST=0.0.0.0` (documentado no README).
- **D2**: middleware `verificarOrigem` compara `Origin`/`Host` com `localhost`, `127.0.0.1` e o `HOST`/`PORT` configurados; GETs sem efeito colateral e SSE de leitura ficam fora.
- **D3**: validação de pasta em função única `validarPastaProjeto(dir)` reutilizada por `carregar-projeto` e `pastaProjeto`.
- **D4**: expiração por `ultimoAcesso` em `sessions[id]`, varredura a cada 30 min via `setInterval(...).unref()`.

## Risks / Trade-offs

- Quem acessa por LAN precisa definir `HOST` → documentado; o Origin check aceita o host configurado.
- Limite do multer pode recusar `.docx` grandes → 20 MB, ajustável por env.
