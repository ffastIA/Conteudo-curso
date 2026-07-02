## Why

A revisão de qualidade por aula (Etapa 5★) já avalia coerência pedagógica, alinhamento ao plano de ensino e sobreposições de conteúdo, mas não avalia se a linguagem, a complexidade das explicações e os exemplos utilizados são adequados ao perfil de público informado em `config.publico`. Um curso para "jovens de 14 a 17 anos no ensino médio" exige escolhas didáticas muito diferentes de um para "profissionais de TI com experiência em outras linguagens", e essa dimensão hoje é invisível ao revisor no documento gerado.

## What Changes

- `revisaoQualidadeSkill` em `skills.js` recebe nova seção no prompt: **"Adequação à Faixa Etária e Perfil de Público"**, com critérios de avaliação específicos (linguagem, complexidade, exemplos, abordagem didática)
- O documento `.docx` gerado pela Etapa 5★ passa a incluir essa seção em cada revisão de aula, posicionada entre "Compatibilidade com Plano de Ensino e Ementa" e "Sobreposições Detectadas"
- A spec canônica `content-quality-review` é atualizada para registrar o novo requisito

## Capabilities

### New Capabilities

_(nenhuma — a mudança é uma extensão de capacidade existente)_

### Modified Capabilities

- `content-quality-review`: adicionar requisito de avaliação de adequação à faixa etária/perfil de público na revisão por aula

## Impact

- **`skills.js`**: modificação no template de saída de `revisaoQualidadeSkill` — nova seção no prompt
- **`public/app.js`**: nenhuma — contrato do endpoint `/api/revisao-qualidade` não muda
- **`server.js`**: nenhuma — sem mudança de endpoint, schema ou persistência
- **Documento gerado**: o `.docx` de revisão de qualidade passa a ter uma seção a mais por aula

## Non-goals

- Não validar automaticamente se o conteúdo "passou" ou "reprovou" na avaliação de faixa etária — a seção é informativa/analítica, como as demais
- Não modificar a Etapa 7 (relatório técnico-pedagógico global) — é um change separado se desejado
- Não criar campo novo no formulário ou schema de dados — `config.publico` já existe e é suficiente
