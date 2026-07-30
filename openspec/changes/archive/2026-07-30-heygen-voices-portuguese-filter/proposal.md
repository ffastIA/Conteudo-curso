## Why

O menu de vozes da Etapa 10 (`GET /api/heygen/vozes`) hoje lista todas as
vozes do workspace HeyGen, em qualquer idioma. Como o conteúdo do curso é
sempre em português, isso obriga o usuário a garimpar as poucas vozes em
português no meio de centenas de opções em outros idiomas.

## What Changes

- `GET /api/heygen/vozes` passa a filtrar por `language: "Portuguese"` por
  padrão quando o cliente não especifica `?language=` na query — único valor
  de português que a API do HeyGen expõe (não distingue Brasil/Portugal).
- `?language=` explícito na query continua sobrepondo o padrão, sem quebrar
  a flexibilidade já existente de `listarVozesHeygen`.
- Label da UI da Etapa 10 atualizado para "Escolha a voz (português)".

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `video-avatar-generation`: o requirement "Configuração de avatar, voz e
  narração do HeyGen, uma vez por curso" passa a especificar que a listagem
  de vozes é filtrada por português por padrão.

## Impact

- **Código**: `server.js` (`GET /api/heygen/vozes`), `public/index.html`
  (label).
- **Não resolve um Gap ID priorizado existente (G01–G07)** — é um ajuste de
  UX pontual da Etapa 10.
- **Non-goals**: não distingue português do Brasil de Portugal (a API do
  HeyGen não expõe essa distinção — só existe o valor `"Portuguese"`). Não
  filtra avatares por idioma — avatares não têm campo de idioma na API do
  HeyGen (confirmado via chamada real: `GET /v3/avatars/looks` só retorna
  `avatar_type`, `gender`, `name`, `preview_image_url` etc., nenhum campo de
  idioma).
