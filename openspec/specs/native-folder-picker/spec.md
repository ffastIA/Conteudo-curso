## Purpose

Fornecer um seletor nativo de pasta no Windows (via PowerShell) para que o
usuário escolha visualmente o caminho da pasta do projeto, sem exigir novas
dependências npm.

## Requirements

### Requirement: Seletor nativo de pasta via servidor local
O sistema SHALL fornecer um endpoint `GET /api/escolher-pasta` que abre um diálogo nativo de seleção de pasta do Windows no processo do servidor e retorna ao cliente o caminho absoluto escolhido pelo usuário. Este mecanismo SHALL depender apenas de ferramentas já presentes no Windows (PowerShell e `System.Windows.Forms`), sem exigir novas dependências npm. O diálogo SHALL ser exibido sempre acima de qualquer outra janela (incluindo o navegador), e não SHALL abrir de forma invisível atrás de outras janelas.

#### Scenario: Usuário escolhe uma pasta
- **WHEN** o cliente chama `GET /api/escolher-pasta` e o usuário seleciona uma pasta no diálogo nativo exibido
- **THEN** o servidor retorna `{ pasta: "<caminho absoluto escolhido>" }`

#### Scenario: Usuário cancela o diálogo
- **WHEN** o cliente chama `GET /api/escolher-pasta` e o usuário fecha/cancela o diálogo sem escolher nada
- **THEN** o servidor retorna `{ pasta: null }`

#### Scenario: Diálogo nativo indisponível
- **WHEN** o processo PowerShell falha, expira (timeout) ou não está disponível no sistema
- **THEN** o servidor retorna um erro claro (`{ error: "..." }`) sem travar a requisição indefinidamente
- **THEN** o cliente mantém o campo de texto correspondente editável manualmente, sem bloquear o fluxo do usuário

#### Scenario: Diálogo aparece em primeiro plano sobre o navegador
- **WHEN** o usuário clica em um botão que dispara `GET /api/escolher-pasta` estando com o navegador em primeiro plano
- **THEN** o diálogo nativo de seleção de pasta é exibido visivelmente sobre a janela do navegador, possuído por um form invisível `TopMost`
- **THEN** o diálogo NÃO abre invisível atrás de outras janelas nem apenas piscando na barra de tarefas

#### Scenario: Erro do PowerShell inclui a saída de erro real
- **WHEN** o processo PowerShell falha e escreve alguma mensagem em stderr
- **THEN** o log do servidor inclui essa mensagem (não apenas o comando executado), permitindo diagnosticar a causa real da falha

---

### Requirement: Constraint de uso local (mesma máquina)
Este mecanismo SHALL ser usado apenas em cenários onde o servidor e o navegador do usuário rodam na mesma máquina (uso local, sem autenticação/deploy remoto), já que o diálogo nativo é exibido no desktop de onde o processo do servidor está rodando.

#### Scenario: Documentação da constraint
- **WHEN** o endpoint `GET /api/escolher-pasta` é implementado
- **THEN** essa constraint de arquitetura está documentada no design da capability, vinculada ao gap conhecido de ausência de autenticação (G02)
