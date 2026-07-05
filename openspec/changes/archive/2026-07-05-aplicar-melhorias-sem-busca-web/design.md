# Design: aplicar-melhorias-sem-busca-web

## Context

`streamSkillToClient` (`server.js`) despacha entre dois ramos com base na presença de `skill.web_search_options`: um ramo não-streaming simulado por chunks (usado por skills de busca web) e um ramo de streaming real via SDK (`stream: true`, já com `max_tokens: MAX_TOKENS_AULA`). Como `aplicarMelhoriasSkill` deixa de definir `web_search_options`, ela migra automaticamente para o ramo de streaming real — nenhuma mudança de despacho foi necessária.

A guarda de truncamento/continuação (`server.js`, dentro do loop de melhorias) faz uma chamada bruta separada (`openai.chat.completions.create`) para a tentativa de continuação, passando `web_search_options: skill.web_search_options` — com o campo agora `undefined`, a serialização do SDK simplesmente omite a chave, comportamento idêntico a não passá-la. Nenhuma alteração necessária ali.

## Goals / Non-Goals

**Goals:** eliminar o estouro de TPM de requisição única; manter toda a blindagem de qualidade já construída (guarda de truncamento, patch por seção, verificação mecânica) funcionando sem alteração.

**Non-Goals:** alterar outras skills que usam busca web; resolver o teto de TPM da conta em si.

## Decisions

1. **Troca de modelo sem introduzir lógica condicional.**
   Alternativa considerada: manter `gpt-4o-search-preview` como padrão e cair para `gpt-4o-mini` só quando a requisição estimada exceder um teto (roteamento condicional por tamanho). Rejeitada por ora: adiciona complexidade (estimativa de tokens antes da chamada, dois caminhos de prompt a manter) para um ganho que a troca direta já entrega — o teste empírico anterior já mostrou que não há perda de confiabilidade ao usar o mini nesta tarefa, então não há razão para manter dois caminhos.

2. **Prompt reescrito para não mencionar pesquisa web.**
   Deixar a instrução antiga ("busque referências atualizadas na web") ativa induziria o modelo a *alucinar* uma capacidade que não tem — pior que simplesmente remover a menção.

## Risks / Trade-offs

- [Perda de referências externas atualizadas nas melhorias] → aceito conscientemente; a etapa de pesquisa web dedicada (Etapa 2, `pesquisaWebSkill`) já cobre a necessidade de referências atuais na criação do conteúdo original; a aplicação de melhorias é sobre refinar o que já existe, não pesquisar do zero.
- [Conta ainda pode esbarrar em TPM do `gpt-4o-mini` em cursos muito grandes] → tetos de TPM para modelos econômicos costumam ser ordens de grandeza maiores; sem evidência de que isso ocorra, não antecipado nesta mudança.

## Migration Plan

Sem migração. Efeito imediato no próximo ciclo de melhorias. Rollback = revert do commit.

## Open Questions

Nenhuma — decisão tomada pelo usuário diante do erro em produção.
