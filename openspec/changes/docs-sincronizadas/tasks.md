## 1. PROJECT.md e CLAUDE.md

- [ ] 1.1 Recontar endpoints (`grep -cE "app\.(get|post|put|delete)\(" server.js`) e corrigir "30 endpoints"
- [ ] 1.2 Cookie `sid` → `sessionId` (linhas ~75 e ~282); testes 240 → valor atual (linha ~377)
- [ ] 1.3 Modelos, modelos de dados novos e gaps G11–G13

## 2. README, OpenSpec e planos

- [ ] 2.1 `README.md`: Etapas 9 e 10 e lista de endpoints
- [ ] 2.2 `openspec/config.yaml`: remover `specs.yaml` (linhas ~11, ~37), atualizar modelos e gaps
- [ ] 2.3 `plans/README.md`: status dos planos 001–005

## 3. Verificação

- [ ] 3.1 `openspec validate --all` sem erros
- [ ] 3.2 `npm test` verde (sem mudança de código)
