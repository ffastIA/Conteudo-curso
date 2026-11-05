## Why

Hoje o contador do cabeçalho mostra só a quantidade de tokens (`token_usage.json`, sem modelo, sem cache de prompt e sem valor). O gasto em US$ existe em `scr/uso.json` (por dia, etapa e modelo), mas o painel 💲 só exibe tetos e gasto por etapa, e não mostra de onde o valor vem: quantos tokens de cada modelo, a que tarifa. O usuário não consegue conferir a conta nem ver o efeito de trocar o modelo (`selecao-de-modelo-na-tela`) ou de acertar o cache de prompt. Referência: gap G08 (UX de custo) e G13 (observabilidade), ambos já mitigados, que esta change completa pelo lado da transparência.

## What Changes

- Novo painel "Consumo do projeto", aberto no painel 💲, com uma tabela por modelo: chamadas, tokens de entrada, tokens de entrada em cache, tokens de saída, tarifa vigente (US$ por 1M, lida de `config/precos-modelos.json`) e o valor em US$ calculado como tokens × tarifa. Linha extra da busca web (chamadas × `buscaWebPorChamadaUsd`) e total do projeto.
- Quebra do consumo por etapa (tokens e US$) e por dia (tokens e US$).
- Conciliação: o valor recalculado pela tabela é mostrado ao lado do gasto registrado em `uso.json`; a diferença acima de 1% (preço alterado depois da geração, por exemplo) é sinalizada.
- O contador do cabeçalho passa a exibir também o valor em US$ do projeto, ao lado dos tokens.
- `GET /api/consumo`: resposta única com tudo acima, calculada no servidor (a interface não calcula preço).
- `scr/uso.json` passa a guardar, por modelo, os tokens de entrada em cache e as chamadas de busca web, e, por etapa, os tokens de entrada e de saída. Projetos antigos continuam abrindo; os campos novos começam em zero e o painel marca o consumo anterior como "parcial".
- Modelo sem preço cadastrado aparece com os tokens e o valor "indisponível", sem derrubar o total.

**Non-goals:** previsão de custo (já existe em `cost-estimation`); conciliação com a fatura real da OpenAI (a página de uso da OpenAI continua sendo a fonte da cobrança); consumo do HeyGen (já tem resumo próprio) e do Gamma; conversão para outra moeda; exportação em CSV; reconstruir o consumo de projetos antigos; alterar tetos, pausa ou disjuntor.

## Capabilities

### New Capabilities
- `token-cost-report`: relatório de consumo do projeto com tokens por modelo, tarifa da tabela de preços, valor em US$ calculado, quebra por etapa e por dia, conciliação com o gasto registrado e a rota `GET /api/consumo`.

### Modified Capabilities
- `cost-budget`: o requisito "Gasto persistido por projeto" passa a incluir, em `uso.json`, os tokens de entrada em cache e as buscas web por modelo, e os tokens por etapa.
- `token-usage-tracking`: o contador da interface passa a exibir também o valor em US$ do projeto.

## Impact

- **Código:** `orcamento.js` (`contabilizar`, `usoVazio`, normalização do `uso.json` lido), `custo.js` ou `observabilidade.js` (função de valor por modelo a partir da tabela, reaproveitando `calcularCusto`), `server.js` (rota `GET /api/consumo`, e passar buscas web e tokens em cache a `depois`), `public/orcamento.js`, `public/app.js` e `public/index.html` (painel e contador), `public/style.css`.
- **Dados:** `scr/uso.json` ganha campos aditivos, sem mudar `versao`; `token_usage.json` não muda.
- **APIs:** rota nova `GET /api/consumo`; `GET /api/tokens` e `GET /api/orcamento` mantêm o formato atual.
- **Dependências:** nenhuma. Sem SSE novo (consulta síncrona, atualizada nos mesmos eventos que já atualizam o painel).
- **Riscos:** valor recalculado pode divergir do gasto registrado quando a tabela de preços muda (tratado pela conciliação); crescimento pequeno do `uso.json`; custo do bloco fixo de busca em modelos mini deve seguir `buscaWebBlocoTokensMiniSomar`.
