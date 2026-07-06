## ADDED Requirements

### Requirement: Foco do patch no critério-alvo indicado na melhoria
Quando um item de melhoria contiver o prefixo orientativo `[Critério]` (gerado pela revisão de qualidade a partir da rubrica), `aplicarMelhoriasSkill` SHALL instruir o modelo a concentrar as mudanças nas seções do conteúdo relacionadas àquele critério, evitando tocar seções que já atendem critérios de nota alta. A tag SHALL viajar dentro do próprio texto do item (sem campo novo nem mudança no parser da seção estruturada), e sua ausência NÃO SHALL alterar o comportamento de aplicação — melhoria sem tag é tratada exatamente como hoje.

#### Scenario: Melhoria com tag concentra o patch
- **WHEN** a lista de melhorias contém `[Qualidade Didática] Adicionar exercício prático sobre keyframes`
- **THEN** o prompt de aplicação instrui o modelo a concentrar o patch nas seções pertinentes a esse critério (ex.: exemplos práticos, atividades), sem reescrever seções não relacionadas

#### Scenario: Melhoria sem tag mantém o comportamento atual
- **WHEN** a lista de melhorias contém um item sem prefixo `[Critério]`
- **THEN** a aplicação ocorre exatamente como antes desta mudança, sem qualquer filtro ou restrição adicional

#### Scenario: Parser estruturado inalterado
- **WHEN** o documento de revisão anotado é carregado com itens com e sem tag `[Critério]`
- **THEN** o parser da seção estruturada extrai todos os itens normalmente — a tag é parte do texto do item, transparente para o parser
