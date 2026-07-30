## 1. Backend (server.js)

- [x] 1.1 Constante `HEYGEN_VOZES_LANGUAGE_DEFAULT = 'Portuguese'`
- [x] 1.2 `GET /api/heygen/vozes`: usar `language || HEYGEN_VOZES_LANGUAGE_DEFAULT` ao chamar `listarVozesHeygen`, preservando override via `?language=` explícito

## 2. Frontend (public/index.html)

- [x] 2.1 Label "Escolha a voz" → "Escolha a voz (português)"

## 3. Testes (Jest + Supertest)

- [x] 3.1 Sem query, `GET /api/heygen/vozes` chama o HeyGen com `language=Portuguese`
- [x] 3.2 `?language=` explícito sobrepõe o padrão
- [x] 3.3 `npm test` completo rodado — 291/291 passando
