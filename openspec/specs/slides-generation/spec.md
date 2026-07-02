### Requirement: Geração de slides a partir do conteúdo já existente
O sistema SHALL oferecer uma Etapa 8 opcional que, para cada aula em `sess.conteudoPorAula`, usa `slidesSkill` para analisar o conteúdo já gerado e estruturá-lo em uma sequência de 6 a 10 slides (título + bullets), com a quantidade decidida pela IA conforme a densidade do conteúdo. O sistema SHALL NOT misturar tópicos de módulos ou disciplinas distintos no mesmo slide, e os slides SHALL NOT incluir notas do apresentador — o conteúdo de cada slide SHALL ser autoexplicativo.

#### Scenario: Estruturação de uma aula com conteúdo denso
- **WHEN** o sistema processa uma aula com conteúdo extenso
- **THEN** `slidesSkill` retorna um JSON `{"slides": [...]}` com um número de itens dentro da faixa 6-10, mais próximo de 10 conforme a densidade do conteúdo

#### Scenario: Estruturação de uma aula com conteúdo enxuto
- **WHEN** o sistema processa uma aula com conteúdo mais curto
- **THEN** `slidesSkill` retorna um número de slides mais próximo de 6

#### Scenario: Nenhuma mistura de módulos no mesmo slide
- **WHEN** uma aula cobre mais de um sub-tópico distinto
- **THEN** cada slide gerado permanece coeso em torno de um único assunto, sem combinar sub-tópicos não relacionados

---

### Requirement: Um arquivo .pptx por aula, salvo na pasta do projeto
O sistema SHALL gerar um arquivo `.pptx` por aula (`aula{NN}_slides.pptx`), salvo diretamente em `courseRootDir(sess)`, nunca via download do navegador. Cada arquivo SHALL consolidar todos os slides daquela aula em um único documento.

#### Scenario: Geração de slides para um curso com múltiplas aulas
- **WHEN** o usuário clica em "Gerar Slides" para um curso com N aulas
- **THEN** o sistema gera N arquivos `.pptx`, um por aula, nomeados `aula01_slides.pptx`, `aula02_slides.pptx`, etc.
- **THEN** cada arquivo é salvo em `courseRootDir(sess)`, sem nenhum passo de download pelo navegador

#### Scenario: Rastreamento de origem no projeto
- **WHEN** um arquivo de slides é gerado com sucesso
- **THEN** `projeto.json.stages` registra uma entrada `aula{NN}_slides` com `fonte: "ia"` e o timestamp de geração

---

### Requirement: Padronização visual dos slides
Cada slide gerado SHALL usar uma fonte compatível com importação no Canva sem substituição, tamanho de fonte legível a até 5 metros de distância de projeção (título ≥ 32pt, corpo ≥ 22pt), layout widescreen (16:9), e um rodapé no canto inferior esquerdo de cada slide de conteúdo contendo: identificação da aula, tema do curso, data e horário de geração.

#### Scenario: Rodapé presente em todo slide de conteúdo
- **WHEN** um slide de conteúdo (não a capa) é gerado
- **THEN** o rodapé no canto inferior esquerdo contém o título da aula, o nome do curso, a data e o horário de geração

#### Scenario: Fonte e tamanhos consistentes
- **WHEN** qualquer slide é gerado
- **THEN** a fonte usada é uma fonte padrão compatível com Canva (ex.: Calibri)
- **THEN** o título do slide usa tamanho de fonte de pelo menos 32pt e o corpo/bullets usa tamanho de pelo menos 22pt

---

### Requirement: Etapa opcional e independente
A Etapa 8 SHALL ser opcional e SHALL NOT bloquear nem ser bloqueada por nenhuma outra etapa, exceto exigir que a Etapa 5 (Conteúdo) já tenha sido concluída (fonte de dados necessária). A interface SHALL exibir o botão "Gerar Slides" desabilitado até que a Etapa 5 esteja concluída, seguindo o mesmo padrão já usado pelas Etapas 7 (Qualidade/PPC).

#### Scenario: Botão desabilitado antes da Etapa 5
- **WHEN** o usuário ainda não concluiu a Etapa 5 (Conteúdo)
- **THEN** o botão "Gerar Slides" na Etapa 8 permanece desabilitado

#### Scenario: Geração de slides não afeta outras etapas
- **WHEN** o usuário gera os slides de um curso
- **THEN** nenhum dado de `sess.ementa`, `sess.pesquisa`, `sess.planoEnsino`, `sess.planoAula`, `sess.conteudo`, `sess.revisaoQualidade` ou `sess.relatorioQualidade` é alterado

#### Scenario: Geração de slides sem conteúdo disponível é rejeitada
- **WHEN** o usuário tenta gerar slides antes de a Etapa 5 ter sido concluída
- **THEN** `GET /api/slides` retorna status 400 com uma mensagem indicando que a Etapa 5 precisa ser concluída primeiro
