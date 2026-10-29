## MODIFIED Requirements

### Requirement: Gasto persistido por projeto
O sistema SHALL gravar em `scr/uso.json` o gasto por dia, por etapa e por modelo, o consumo bruto por etapa e por dia em cada modelo (`consumo`: chamadas, tokens de entrada, tokens de entrada em cache, tokens de saída e chamadas de busca web), a calibração da estimativa, os tetos ajustados pelo usuário, o perfil e o estado de pausa. O valor em US$ SHALL NOT ser gravado dentro de `consumo`. Os campos de `consumo` SHALL ser aditivos: arquivo sem eles SHALL ser lido como consumo vazio, sem alterar `versao`. A gravação SHALL ser atômica (arquivo temporário seguido de renomeação). Arquivo ausente ou corrompido SHALL resultar em estado vazio com um aviso no log, sem impedir a geração. O arquivo SHALL ser preservado por carregar-projeto e por importar, e as reservas em voo SHALL NOT ser persistidas.

#### Scenario: Gravação atômica
- **WHEN** o servidor é encerrado durante uma gravação de `uso.json`
- **THEN** o arquivo contém o JSON anterior íntegro ou o novo íntegro, nunca um JSON truncado

#### Scenario: Arquivo corrompido
- **WHEN** `scr/uso.json` contém JSON inválido ao carregar o projeto
- **THEN** o sistema inicia com o gasto zerado nesse arquivo, registra um aviso e a geração continua funcionando

#### Scenario: Preservado ao carregar
- **WHEN** o usuário carrega um projeto com `scr/uso.json`
- **THEN** o gasto, o consumo, o perfil e os tetos do projeto são restaurados

#### Scenario: Reservas não persistem
- **WHEN** o servidor cai com chamadas em voo e é reiniciado
- **THEN** o saldo considera apenas o gasto acertado

#### Scenario: Consumo gravado por chamada
- **WHEN** uma chamada da etapa de conteúdo com `gpt-4o` usa 10.000 tokens de entrada (4.000 em cache) e 2.000 de saída
- **THEN** `uso.json` soma esses tokens em `consumo.porEtapa.conteudo["gpt-4o"]` e em `consumo.porDia[<dia>]["gpt-4o"]`, com uma chamada a mais

#### Scenario: Arquivo anterior sem consumo
- **WHEN** o projeto tem um `uso.json` gravado antes desta versão, sem o campo `consumo`
- **THEN** o projeto abre normalmente, o gasto e os tetos são preservados e o consumo começa vazio
