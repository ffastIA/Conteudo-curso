## Context

A tela de configuração do HeyGen (`heygenConfigContainer`, `public/index.html:596-621`) só é populada e exibida pela função `carregarHeygenConfig()` (`public/app.js:1086-1132`), chamada pelo listener de `btnVideoAvatar` — mas só quando `state.heygenConfig` ainda é `null` (`public/app.js:1074-1084`). Uma vez confirmada (`btnConfirmarHeygenConfig`, `public/app.js:1134-1164`), a configuração fica presa: não há nenhum elemento de UI que leve de volta a essa tela. O backend (`POST /api/heygen/config`, `server.js:1527-1541`) não tem essa restrição — ele sempre sobrescreve `sess.heygenConfig` e persiste via `saveProject(sess)`, então reabrir a tela e confirmar de novo já funciona ponta a ponta sem tocar no servidor.

## Goals / Non-Goals

**Goals:**
- Dar ao usuário um caminho, dentro da UI, para reabrir a seleção de avatar/voz depois de já ter confirmado uma.
- Pré-selecionar, ao reabrir, o avatar/voz atualmente configurados (quando ainda presentes na lista filtrada), em vez de sempre marcar o primeiro item.
- Permitir cancelar a troca sem alterar a configuração salva.

**Non-Goals:**
- Reprocessar roteiros/vídeos de aulas já geradas com a configuração anterior.
- Mudar o backend (`POST /api/heygen/config`, `listarAvataresHeygen`, `listarVozesHeygen`) — reuso total.
- Guardar histórico de configurações.

## Decisions

**Reusar `carregarHeygenConfig()` para o fluxo de troca, em vez de criar uma função paralela**
A função já faz exatamente o necessário: busca as listas filtradas, renderiza os rádios, mostra o container. A única mudança é pré-marcar (`checked`) o item cujo `id`/`voice_id` bate com `state.heygenConfig.avatarId`/`voiceId` (quando presente na lista), em vez de sempre marcar `i === 0`. Isso evita duplicar a lógica de renderização entre "primeira configuração" e "troca".

**Botão "Trocar avatar/voz" no `videoAvatarAulaCard`, não dentro do `heygenConfigContainer`**
Fica visível assim que o card de seleção de aula aparece (ou seja, sempre que já existe `heygenConfig`), sem exigir um novo estado de UI. Um pequeno botão secundário (`btn-secondary` ou link), não `btn-primary`, para não competir visualmente com o fluxo principal (selecionar aula → gerar roteiro → gerar vídeo).

**Botão "Cancelar" só aparece quando a tela é reaberta via troca**
Controlado por uma flag simples (`state.heygenConfigReabrindoParaTroca` ou o próprio `display` do `videoAvatarAulaCard` no momento do clique) que decide se `btnCancelarHeygenConfig` fica visível. No fluxo de primeira configuração do curso não há "para onde cancelar" (não existe seletor de aula ainda), então o botão fica oculto.
Alternativa considerada: sempre mostrar "Cancelar" e, se não houver config anterior, ele apenas desabilita o botão "Gerar Vídeo com Avatar" de novo. Rejeitada por reintroduzir um estado inconsistente (usuário cancela a primeira configuração e fica sem poder prosseguir, sem clareza de por quê).

**Cancelar apenas esconde a tela, sem chamada de rede**
Como nada foi persistido ainda (só um `POST /api/heygen/config` bem-sucedido persiste), cancelar é puramente client-side: esconder `heygenConfigContainer`, reexibir o que estava visível antes (`videoAvatarAulaCard` e, se havia, `videoAvatarParametrosCard`).

## Risks / Trade-offs

- [Usuário troca de avatar/voz no meio de uma aula com roteiro já gerado mas vídeo ainda não enviado ao HeyGen] → o roteiro de texto não depende de avatar/voz (é só texto), então nada quebra; o próximo envio ao HeyGen (`GET /api/video-avatar/gerar`) usa a configuração nova. Comportamento aceitável e não requer aviso adicional.
- [Avatar/voz configurado anteriormente não está mais na lista filtrada (removido do `.env` ou do workspace)] → nenhum item vem pré-marcado; o usuário simplesmente escolhe um novo, sem erro — mesmo comportamento de fallback que a lista já tem hoje (primeiro item marcado por padrão quando não há pré-seleção).

## Migration Plan

Nenhuma migração de dados ou de API. Mudança é aditiva na UI; deploy é só o build/reload do front-end estático (`public/app.js` e `public/index.html`), sem downtime.
