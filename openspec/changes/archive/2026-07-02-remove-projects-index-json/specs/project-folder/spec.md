## REMOVED Requirements

### Requirement: Índice global de projetos em saídas/index.json
**Reason:** O índice global se mostrou uma fonte de verdade duplicada e propensa a dessincronização em relação ao `projeto.json` de cada pasta — causa raiz de bugs em que `pastaProjeto` configurada pelo usuário não era respeitada na geração de arquivos, e projetos continuavam listados mesmo após o usuário limpar a pasta que julgava ser a do projeto. Com o novo fluxo de carregamento por seleção direta de pasta (capability `project-load`, requisito de carregamento por caminho), cada pasta de projeto é autossuficiente e não há mais necessidade de um registro global para descoberta.
**Migration:** `saveProject()` não escreve mais em `saídas/index.json`. `GET /api/projetos` foi removido. `POST /api/carregar-projeto` não consulta mais esse índice para resolver o diretório do projeto — o caminho é fornecido diretamente pelo cliente a cada chamada. O arquivo `saídas/index.json` existente é removido do disco; nenhum dado é perdido, pois toda informação relevante já está persistida em cada `{pasta}/scr/projeto.json` individual.

O requisito "Pasta raiz por projeto com subdiretório /scr para internos" (`courseRootDir`/`courseScrDir`) permanece inalterado — cada projeto continua tendo sua própria pasta raiz configurável; apenas o registro global que mapeava todos os projetos conhecidos é removido.
