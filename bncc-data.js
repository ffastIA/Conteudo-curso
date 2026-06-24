// Dados BNCC — Letramento Digital e Cultura Digital
// Referência: Base Nacional Comum Curricular (homologada 2017/2018)
// Escopo: apenas habilidades relacionadas a letramento digital e cultura digital
// + Competências Gerais C2 e C5

const competenciasGerais = [
  {
    id: 'C2',
    titulo: 'Pensamento científico, crítico e criativo',
    descricao:
      'Exercitar a curiosidade intelectual e recorrer à abordagem própria das ciências, ' +
      'incluindo a investigação, a reflexão, a análise crítica, a imaginação e a criatividade, ' +
      'para investigar causas, elaborar e testar hipóteses, formular e resolver problemas e ' +
      'criar soluções (inclusive tecnológicas) com base nos conhecimentos das diferentes áreas.'
  },
  {
    id: 'C5',
    titulo: 'Cultura digital',
    descricao:
      'Compreender, utilizar e criar tecnologias digitais de informação e comunicação de forma ' +
      'crítica, significativa, reflexiva e ética nas diversas práticas sociais (incluindo as ' +
      'escolares) para se comunicar, acessar e disseminar informações, produzir conhecimentos, ' +
      'resolver problemas e exercer protagonismo e autoria na vida pessoal e coletiva.'
  }
];

const habilidadesEF1 = [
  {
    id: 'ef1_lp_01',
    codigo: 'EF15LP01',
    componente: 'Língua Portuguesa',
    ano: '1º ao 5º ano',
    descricao:
      'Identificar a função social de textos que circulam em campos da vida social dos quais ' +
      'participa cotidianamente — incluindo textos digitais e multissemióticos — e a situação ' +
      'comunicativa e o(s) propósito(s) comunicativo(s) desses textos.'
  },
  {
    id: 'ef1_lp_02',
    codigo: 'EF15LP12',
    componente: 'Língua Portuguesa',
    ano: '1º ao 5º ano',
    descricao:
      'Recorrer ao material didático, à internet ou a outras fontes de pesquisa para buscar ' +
      'informações sobre temas trabalhados na escola, com o apoio do professor.'
  },
  {
    id: 'ef1_lp_03',
    codigo: 'EF15LP13',
    componente: 'Língua Portuguesa',
    ano: '1º ao 5º ano',
    descricao:
      'Identificar e reproduzir, em gravações de voz, áudio, vídeo e postagens em redes sociais ' +
      'e plataformas digitais, aspectos relevantes discutidos em sala de aula.'
  },
  {
    id: 'ef1_lp_04',
    codigo: 'EF04LP01',
    componente: 'Língua Portuguesa',
    ano: '4º ano',
    descricao:
      'Grafar palavras utilizando regras de correspondência fonema-grafema regulares e ' +
      'algumas irregulares em textos produzidos com o apoio de ferramentas digitais.'
  },
  {
    id: 'ef1_lp_05',
    codigo: 'EF05LP27',
    componente: 'Língua Portuguesa',
    ano: '5º ano',
    descricao:
      'Utilizar, ao produzir textos, estratégias de busca, seleção e leitura em ambiente digital, ' +
      'com base em objetivos de aprendizagem previamente definidos.'
  },
  {
    id: 'ef1_ar_01',
    codigo: 'EF15AR01',
    componente: 'Arte',
    ano: '1º ao 5º ano',
    descricao:
      'Identificar e apreciar formas distintas das artes visuais tradicionais e contemporâneas, ' +
      'cultivando a percepção, o imaginário, a capacidade de simbolizar e o repertório imagético ' +
      'em diferentes contextos, incluindo o digital.'
  },
  {
    id: 'ef1_ar_02',
    codigo: 'EF15AR25',
    componente: 'Arte',
    ano: '1º ao 5º ano',
    descricao:
      'Conhecer e valorizar o patrimônio cultural, material e imaterial, de culturas diversas, ' +
      'em especial a brasileira, incluindo suas manifestações artísticas, e reconhecer o papel ' +
      'da tecnologia digital na difusão dessas manifestações.'
  },
  {
    id: 'ef1_ci_01',
    codigo: 'EF05CI10',
    componente: 'Ciências',
    ano: '5º ano',
    descricao:
      'Identificar alguns equipamentos de comunicação e de informação, descrevendo o papel da ' +
      'tecnologia digital no cotidiano das pessoas e as transformações que trouxe à sociedade.'
  }
];

const habilidadesEF2 = [
  {
    id: 'ef2_lp_01',
    codigo: 'EF69LP04',
    componente: 'Língua Portuguesa',
    ano: '6º ao 9º ano',
    descricao:
      'Identificar o contexto de produção dos textos, inclusive textos digitais, ' +
      'reconhecendo a plataforma ou o suporte, o produtor, o destinatário, a finalidade ' +
      'e os valores sociais que refletem ou promovem.'
  },
  {
    id: 'ef2_lp_02',
    codigo: 'EF67LP08',
    componente: 'Língua Portuguesa',
    ano: '6º e 7º ano',
    descricao:
      'Desenvolver estratégias de leitura colaborativa e compartilhada em plataformas digitais, ' +
      'para textos com o propósito de informar e/ou opiniar sobre temáticas da atualidade.'
  },
  {
    id: 'ef2_lp_03',
    codigo: 'EF69LP21',
    componente: 'Língua Portuguesa',
    ano: '6º ao 9º ano',
    descricao:
      'Posicionar-se em relação a conteúdos veiculados em práticas não institucionalizadas em ' +
      'redes sociais, sites e afins, de forma ética, crítica e respeitosa, e combater a ' +
      'desinformação e os discursos de ódio.'
  },
  {
    id: 'ef2_lp_04',
    codigo: 'EF69LP22',
    componente: 'Língua Portuguesa',
    ano: '6º ao 9º ano',
    descricao:
      'Realizar pesquisas em fontes digitais e variadas — incluindo jornais, revistas e sites ' +
      'confiáveis —, selecionando informações com critérios de relevância e confiabilidade.'
  },
  {
    id: 'ef2_lp_05',
    codigo: 'EF89LP31',
    componente: 'Língua Portuguesa',
    ano: '8º e 9º ano',
    descricao:
      'Realizar curadoria de informação: selecionar, organizar e compartilhar conteúdos digitais ' +
      'de forma crítica, com base em critérios de confiabilidade, relevância e responsabilidade.'
  },
  {
    id: 'ef2_lp_06',
    codigo: 'EF89LP32',
    componente: 'Língua Portuguesa',
    ano: '8º e 9º ano',
    descricao:
      'Analisar criticamente a confiabilidade de fontes digitais, identificando fake news, ' +
      'desinformação e manipulação de dados, adotando postura ética e responsável online.'
  },
  {
    id: 'ef2_lp_07',
    codigo: 'EF89LP33',
    componente: 'Língua Portuguesa',
    ano: '8º e 9º ano',
    descricao:
      'Criar e publicar textos multissemióticos (vídeos, podcasts, infográficos, sites) com ' +
      'propósito comunicativo definido, usando ferramentas digitais de forma colaborativa.'
  },
  {
    id: 'ef2_lp_08',
    codigo: 'EF89LP34',
    componente: 'Língua Portuguesa',
    ano: '8º e 9º ano',
    descricao:
      'Conhecer e respeitar direitos autorais, licenças de uso (Creative Commons) e ' +
      'privacidade no ambiente digital ao produzir e compartilhar conteúdos.'
  },
  {
    id: 'ef2_ar_01',
    codigo: 'EF69AR35',
    componente: 'Arte',
    ano: '6º ao 9º ano',
    descricao:
      'Identificar e manipular diferentes tecnologias e recursos digitais para criar, ' +
      'registrar e divulgar trabalhos artísticos, reconhecendo a cultura digital como ' +
      'espaço de criação e expressão contemporânea.'
  },
  {
    id: 'ef2_ar_02',
    codigo: 'EF69AR36',
    componente: 'Arte',
    ano: '6º ao 9º ano',
    descricao:
      'Desenvolver trabalhos artísticos a partir de ferramentas digitais, explorando ' +
      'linguagens híbridas como arte digital, net art, games, audiovisual e instalações ' +
      'interativas.'
  },
  {
    id: 'ef2_ci_01',
    codigo: 'EF09CI14',
    componente: 'Ciências',
    ano: '9º ano',
    descricao:
      'Discutir o papel do avanço tecnológico na aplicação das telecomunicações, ' +
      'reconhecendo oportunidades e riscos relacionados à privacidade de dados, ' +
      'segurança da informação e dependência tecnológica.'
  },
  {
    id: 'ef2_ci_02',
    codigo: 'EF09CI17',
    componente: 'Ciências',
    ano: '9º ano',
    descricao:
      'Reconhecer a importância do impacto das tecnologias de informação e comunicação ' +
      'na vida social, profissional e cultural contemporânea, discutindo usos éticos ' +
      'e cidadãos da tecnologia digital.'
  },
  {
    id: 'ef2_ch_01',
    codigo: 'EF08HI24',
    componente: 'História',
    ano: '8º ano',
    descricao:
      'Discutir como as revoluções tecnológicas e a digitalização transformaram as ' +
      'relações de trabalho, consumo, comunicação e cultura no século XX e XXI.'
  },
  {
    id: 'ef2_ch_02',
    codigo: 'EF09GE03',
    componente: 'Geografia',
    ano: '9º ano',
    descricao:
      'Identificar características da nova ordem mundial e do papel das tecnologias ' +
      'digitais nas desigualdades de acesso à informação (exclusão digital) entre países ' +
      'e grupos sociais.'
  }
];

const habilidadesEM = [
  {
    id: 'em_lp_01',
    codigo: 'EM13LP06',
    componente: 'Língua Portuguesa',
    ano: 'Ensino Médio',
    descricao:
      'Compreender os processos de produção, circulação e consumo de textos e discursos ' +
      'em contextos digitais, analisando criticamente a credibilidade de fontes, ' +
      'algoritmos, filtros e câmaras de eco nas redes sociais.'
  },
  {
    id: 'em_lp_02',
    codigo: 'EM13LP07',
    componente: 'Língua Portuguesa',
    ano: 'Ensino Médio',
    descricao:
      'Realizar curadoria de informação em ambientes digitais, desenvolvendo e aplicando ' +
      'critérios de confiabilidade, relevância e diversidade de perspectivas, e combatendo ' +
      'a desinformação, o discurso de ódio e a violação de privacidade.'
  },
  {
    id: 'em_lp_03',
    codigo: 'EM13LP08',
    componente: 'Língua Portuguesa',
    ano: 'Ensino Médio',
    descricao:
      'Criar textos multissemióticos e transmidiáticos com fins variados, utilizando ' +
      'ferramentas digitais de edição colaborativa e publicação, respeitando direitos ' +
      'autorais e licenças de uso.'
  },
  {
    id: 'em_lp_04',
    codigo: 'EM13LP09',
    componente: 'Língua Portuguesa',
    ano: 'Ensino Médio',
    descricao:
      'Analisar o impacto das tecnologias digitais no campo da comunicação, do trabalho ' +
      'e do consumo, posicionando-se criticamente sobre questões como privacidade, ' +
      'vigilância, automação e direitos digitais.'
  },
  {
    id: 'em_ar_01',
    codigo: 'EM13AR04',
    componente: 'Arte',
    ano: 'Ensino Médio',
    descricao:
      'Pesquisar e criar projetos artísticos com o uso de tecnologias digitais, explorando ' +
      'linguagens interativas, imersivas e colaborativas como instalações digitais, arte ' +
      'generativa, realidade aumentada e jogos.'
  },
  {
    id: 'em_ar_02',
    codigo: 'EM13AR05',
    componente: 'Arte',
    ano: 'Ensino Médio',
    descricao:
      'Analisar as relações entre arte, tecnologia e cultura digital na contemporaneidade, ' +
      'reconhecendo como plataformas digitais transformam a produção, circulação e ' +
      'consumo de bens culturais.'
  },
  {
    id: 'em_co_01',
    codigo: 'EM13CO01',
    componente: 'Computação / Cultura Digital',
    ano: 'Ensino Médio',
    descricao:
      'Compreender o funcionamento de sistemas computacionais e redes digitais, ' +
      'identificando componentes, protocolos e impactos sociais, e adotando práticas ' +
      'seguras de uso e proteção de dados.'
  },
  {
    id: 'em_co_02',
    codigo: 'EM13CO02',
    componente: 'Computação / Cultura Digital',
    ano: 'Ensino Médio',
    descricao:
      'Aplicar pensamento computacional na resolução de problemas, usando abstração, ' +
      'decomposição, reconhecimento de padrões e algoritmos em contextos reais e ' +
      'interdisciplinares.'
  },
  {
    id: 'em_co_03',
    codigo: 'EM13CO03',
    componente: 'Computação / Cultura Digital',
    ano: 'Ensino Médio',
    descricao:
      'Criar soluções computacionais — programas, aplicativos, sites ou scripts — para ' +
      'problemas reais, documentando o processo e comunicando os resultados de forma ' +
      'clara e colaborativa.'
  },
  {
    id: 'em_co_04',
    codigo: 'EM13CO04',
    componente: 'Computação / Cultura Digital',
    ano: 'Ensino Médio',
    descricao:
      'Analisar criticamente o impacto ético, social, econômico e cultural da inteligência ' +
      'artificial, da automação e da coleta massiva de dados na sociedade, exercendo ' +
      'cidadania digital responsável.'
  },
  {
    id: 'em_co_05',
    codigo: 'EM13CO05',
    componente: 'Computação / Cultura Digital',
    ano: 'Ensino Médio',
    descricao:
      'Desenvolver e avaliar projetos digitais colaborativos (jogos, aplicativos, sites, ' +
      'mídias interativas) com foco em resolução de problemas da comunidade ou área de ' +
      'interesse, integrando habilidades técnicas e criativas.'
  },
  {
    id: 'em_ch_01',
    codigo: 'EM13CHS106',
    componente: 'Ciências Humanas e Sociais',
    ano: 'Ensino Médio',
    descricao:
      'Analisar as transformações das relações de trabalho, consumo e comunicação ' +
      'provocadas pelas tecnologias digitais, discutindo desigualdades de acesso e ' +
      'impactos na democracia e nos direitos humanos.'
  },
  {
    id: 'em_ch_02',
    codigo: 'EM13CHS205',
    componente: 'Ciências Humanas e Sociais',
    ano: 'Ensino Médio',
    descricao:
      'Identificar e combater a desinformação, fake news e discurso de ódio nas mídias ' +
      'digitais, reconhecendo sua influência nos processos políticos, eleitorais e ' +
      'na coesão social.'
  }
];

module.exports = {
  competenciasGerais,
  habilidades: {
    ef1: habilidadesEF1,
    ef2: habilidadesEF2,
    em: habilidadesEM
  }
};
