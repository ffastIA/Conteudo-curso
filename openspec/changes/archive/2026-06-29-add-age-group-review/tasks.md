## 1. Modificação do prompt — skills.js

- [x] 1.1 Em `skills.js`, na função `revisaoQualidadeSkill`, localizar a linha que instrui o modelo a produzir a seção `### Compatibilidade com Plano de Ensino e Ementa` e inserir imediatamente após (antes de `### Sobreposições Detectadas`) a instrução da nova seção:
  ```
  `### Adequação à Faixa Etária e Perfil de Público\n` +
  `Avalie se linguagem, vocabulário, complexidade dos conceitos, exemplos e abordagem didática ` +
  `são adequados ao público "${config?.publico || 'não informado'}". ` +
  `Justifique pedagogicamente e proponha ajustes concretos quando houver inadequação. ` +
  `Se o público não estiver informado, indique que a avaliação não pode ser realizada.\n\n`
  ```
- [x] 1.2 Verificar que a variável `config` (já passada como parâmetro da skill) está acessível no ponto de inserção — confirmar que o destructuring `{ config, ... }` cobre o campo

## 2. Verificação manual

- [ ] 2.1 Gerar revisão de qualidade com `config.publico` preenchido (ex.: "jovens de 14 a 17 anos cursando ensino médio") e confirmar que a seção "Adequação à Faixa Etária e Perfil de Público" aparece no `.docx` gerado entre "Compatibilidade com Plano de Ensino e Ementa" e "Sobreposições Detectadas"
- [ ] 2.2 Verificar que a seção contém justificativa pedagógica e, se houver inadequação, sugestões concretas de ajuste
- [ ] 2.3 Testar com `config.publico` vazio e confirmar que a seção indica que a avaliação não pode ser realizada por falta de dados
- [ ] 2.4 Confirmar que as demais seções do relatório permanecem inalteradas (sem regressão)
