# Agente de Conteúdo Educacional — Cursos de Formação Tecnológica

Aplicação web (Node.js + Express) que conduz um pipeline de 5 etapas para
elaborar conteúdo de cursos técnicos usando a API da OpenAI, com pesquisa
web nativa, geração de planos e exportação para `.docx`.

## Pipeline

1. **Configuração do curso** — formulário com dados básicos (nome, público,
   carga horária, duração da aula, nível, objetivos).
2. **Pesquisa web** — usa `gpt-4o-search-preview` (busca nativa) para
   levantar tópicos, ferramentas, tendências e referências atuais.
3. **Plano de ensino** — gerado com `gpt-4o`, usando o contexto da pesquisa.
4. **Plano de aula** — gerado com `gpt-4o`, usando o contexto das etapas
   anteriores.
5. **Conteúdo detalhado da aula** — gerado com `gpt-4o`, usando todo o
   contexto acumulado.

Cada etapa exibe um log de progresso em tempo real (via SSE/streaming) e
permite exportar o resultado como documento `.docx` formatado (capa,
cabeçalho/rodapé com numeração de página, títulos e listas).

## Instalação e execução

```bash
npm install
echo "OPENAI_API_KEY=sua_chave_aqui" > .env
node server.js
```

Acesse: [http://localhost:3000](http://localhost:3000)

> A chave da API é lida apenas no backend (via `dotenv`) e nunca é exposta
> ao frontend.

## Estrutura de pastas

```
/
├── server.js
├── package.json
├── .env
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Endpoints

| Método | Rota                  | Descrição                                            |
|--------|-----------------------|------------------------------------------------------|
| POST   | `/api/config`         | Salva a configuração do curso na sessão              |
| GET    | `/api/search`         | SSE — pesquisa web (`gpt-4o-search-preview`)         |
| GET    | `/api/plano-ensino`   | SSE — gera plano de ensino (`gpt-4o`)                |
| GET    | `/api/plano-aula`     | SSE — gera plano de aula (`gpt-4o`)                  |
| GET    | `/api/conteudo`       | SSE — gera conteúdo detalhado da aula (`gpt-4o`)     |
| POST   | `/api/export/:step`   | Gera e baixa o `.docx` da etapa (`pesquisa`,         |
|        |                       | `plano-ensino`, `plano-aula`, `conteudo`)            |

## Observações técnicas

- Estado da sessão mantido em memória, identificado por cookie `sessionId`
  (HttpOnly).
- Contexto entre etapas é truncado em 1500 caracteres para evitar consumo
  excessivo de tokens.
- Eventos SSE seguem o formato `{"type": "...", ...}` com tipos `progress`,
  `site`, `token`, `done` e `error`.
