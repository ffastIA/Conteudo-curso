# Langfuse autohospedado (observabilidade das chamadas ao LLM)

O gerador envia, de forma opcional, um *trace* por operação (pesquisa, plano de
ensino, conteúdo, revisão, PPC, slides, vídeo) ao Langfuse: cada chamada à OpenAI
vira uma *generation* com modelo, parâmetros, tokens, custo, `finish_reason` e
latência; chamadas ao Gamma/HeyGen e downloads viram *spans*. Com o Langfuse
**autohospedado**, nada sai da sua máquina/rede.

A integração fica **desligada** enquanto as variáveis `LANGFUSE_*` não estiverem
definidas. Se o Langfuse cair, a geração continua normalmente (só aparece um aviso
no log do servidor).

## 1. Subir o Langfuse localmente

Requisitos: Docker Desktop com o daemon rodando e **Langfuse ≥ 3.22** (primeira
versão com o endpoint OpenTelemetry usado aqui).

```bash
git clone https://github.com/langfuse/langfuse.git
cd langfuse
docker compose up -d
```

O compose oficial publica a interface em `localhost:3000` — a mesma porta do
gerador. Antes de subir, edite o `docker-compose.yml` do Langfuse:

- no serviço `langfuse-web`, troque o mapeamento de porta para `"3001:3000"`;
- ajuste `NEXTAUTH_URL` para `http://localhost:3001`.

**Segredos:** o compose traz valores de exemplo (`NEXTAUTH_SECRET`, `SALT`,
`ENCRYPTION_KEY`, senhas do Postgres/ClickHouse/Redis/MinIO). Troque-os antes de
usar com dados reais ou fora da sua máquina. Mantenha o Langfuse acessível apenas
em `localhost`/rede interna.

## 2. Criar o projeto e as chaves

1. Abra `http://localhost:3001`, crie a conta, a organização e um projeto.
2. Em *Settings → API Keys*, crie um par de chaves (`pk-lf-…` e `sk-lf-…`).

## 3. Configurar o gerador

No `.env` (nunca no código nem no git):

```
LANGFUSE_ENABLED=true
LANGFUSE_HOST=http://localhost:3001
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
# metadados (padrão): só tamanhos, tokens, custo e ids — sem texto de prompts/respostas
# completo: envia o texto (com e-mails, tokens e caminhos mascarados); use só no seu servidor
LANGFUSE_CAPTURE=metadados
# fração dos traces enviados (0 a 1); falhas e aulas incompletas são sempre enviadas
LANGFUSE_SAMPLE_RATE=1
```

Reinicie o gerador. Ao final de cada etapa o log mostra o custo real (US$ e tokens)
e o link do trace; `scr/geracao_log.json` guarda o `traceId` de cada chamada para
cruzar com o painel.

## O que é enviado

| Item | Modo `metadados` | Modo `completo` |
|---|---|---|
| Modelo, parâmetros, tokens, custo, `finish_reason`, latência | sim | sim |
| Etapa, aula, consulta de pesquisa, sessão (slug do curso) | sim | sim |
| Tamanho (caracteres) de prompt e resposta | sim | sim |
| Texto de prompt e resposta | **não** | sim, mascarado |
| Chaves de API, cookies, conteúdo de `.env`, caminhos de pasta | **nunca** | **nunca** |

Mascaramento (modo completo): e-mails, chaves `sk-…`/`pk-lf-…`, `Bearer …`,
pares `api_key=…`/`token=…` e caminhos de arquivo viram `[email]`, `[token]`,
`[oculto]`, `[caminho]`.

## Detalhes técnicos

- Transporte: OTLP/HTTP **JSON** em `POST {LANGFUSE_HOST}/api/public/otel/v1/traces`
  com `Authorization: Basic base64(pk:sk)` e `x-langfuse-ingestion-version: 4`.
  A API de ingestão em lote antiga (`/api/public/ingestion`) está obsoleta e não
  existe no Langfuse v4 em modo `events_only`, por isso não é usada.
- Notas de qualidade (rubrica, determinístico, score do gate de melhorias) vão como
  *scores* do trace por `POST /api/public/scores`.
- Fila em memória (máx. 1000 eventos), envio em lote a cada 5 s ou 50 eventos,
  timeout de 3 s por envio e descarga no encerramento do servidor.
- Custo: calculado pelo app com `config/precos-modelos.json` (preço por 1 M de
  tokens, ajustável) e enviado em `cost_details`. Não inclui o custo por chamada
  da ferramenta `web_search`.

## Status de verificação

Os testes automatizados validam o formato do payload, os cabeçalhos, a
resiliência e a privacidade com um `fetch` simulado. **Ainda não foi validado
contra uma instância real do Langfuse** (o daemon do Docker não estava ativo ao
implementar). Na primeira subida, confira no painel se os traces aparecem com
tokens e custo; se algo divergir, ajuste o mapeamento em `observabilidade.js`.
