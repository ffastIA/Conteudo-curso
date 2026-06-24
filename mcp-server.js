#!/usr/bin/env node

/**
 * MCP Server para Claude Desktop gerenciar projeto VS Code
 * Permite que Claude Desktop acesse e manipule arquivos do projeto
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  metodologiaSkill,
  qualidadeSkill,
  perfilEgressoSkill,
  competenciasSkill,
  perfilDocenteSkill,
  infraestruturaSkill,
  ppcAssemblySkill
} = require('./skills');

const PROJECT_ROOT = __dirname;

// Tipos de ferramentas que o MCP oferece
const tools = [
  {
    name: 'read_file',
    description: 'Lê o conteúdo de um arquivo do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo do arquivo a partir da raiz do projeto'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Escreve conteúdo em um arquivo do projeto',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo do arquivo'
        },
        content: {
          type: 'string',
          description: 'Conteúdo a escrever'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'Lista arquivos e pastas de um diretório',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo do diretório (vazio para raiz)'
        }
      }
    }
  },
  {
    name: 'get_project_info',
    description: 'Retorna informações gerais sobre o projeto',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'execute_command',
    description: 'Executa um comando npm ou shell no projeto',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Comando a executar (ex: "npm start", "npm install")'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'gerar_metodologia',
    description: 'Gera a metodologia pedagógica recomendada para um curso com base no perfil do público e carga horária',
    inputSchema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do curso' },
        publico: { type: 'string', description: 'Público-alvo do curso' },
        carga: { type: 'string', description: 'Carga horária total (ex: 40h)' },
        nivel: { type: 'string', description: 'Nível: basico, intermediario ou avancado' },
        proporcaoTeoricoPratico: { type: 'string', description: 'Ex: 40% teórico / 60% prático' }
      },
      required: ['nome', 'publico', 'carga', 'nivel']
    }
  },
  {
    name: 'avaliar_qualidade',
    description: 'Gera um Relatório Técnico-Pedagógico avaliando coerência entre BNCC, metodologia e os artefatos do curso',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'object', description: 'Configuração do curso (nome, publico, carga, nivel, etc.)' },
        ementa: { type: 'string', description: 'Ementa gerada' },
        planoEnsino: { type: 'string', description: 'Plano de ensino gerado' },
        planoAula: { type: 'string', description: 'Plano de aula gerado' },
        resumosAulas: { type: 'string', description: 'Resumo do conteúdo das aulas' },
        metodologia: { type: 'string', description: 'Metodologia pedagógica derivada' },
        bncc: { type: 'object', description: 'Objeto BNCC da sessão { ativo, itens }' }
      },
      required: ['config', 'ementa', 'planoEnsino', 'planoAula']
    }
  },
  {
    name: 'gerar_ppc',
    description: 'Gera o Projeto Pedagógico de Curso (PPC) completo para cursos livres',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'object', description: 'Configuração do curso' },
        ementa: { type: 'string', description: 'Ementa gerada' },
        pesquisa: { type: 'string', description: 'Resultado da pesquisa web' },
        planoEnsino: { type: 'string', description: 'Plano de ensino' },
        planoAula: { type: 'string', description: 'Plano de aula' },
        metodologia: { type: 'string', description: 'Metodologia pedagógica' },
        bncc: { type: 'object', description: 'Objeto BNCC da sessão' }
      },
      required: ['config', 'ementa', 'planoEnsino']
    }
  }
];

// Processa requisições do Claude
async function processRequest(request) {
  try {
    if (request.method === 'tools/list') {
      return {
        tools: tools
      };
    }

    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'read_file': {
          const filePath = path.join(PROJECT_ROOT, args.path);
          
          // Validação de segurança
          if (!filePath.startsWith(PROJECT_ROOT)) {
            throw new Error('Acesso negado: caminho fora do projeto');
          }
          
          const content = fs.readFileSync(filePath, 'utf-8');
          return { content };
        }

        case 'write_file': {
          const filePath = path.join(PROJECT_ROOT, args.path);
          
          if (!filePath.startsWith(PROJECT_ROOT)) {
            throw new Error('Acesso negado: caminho fora do projeto');
          }
          
          fs.writeFileSync(filePath, args.content, 'utf-8');
          return { success: true, message: `Arquivo escrito: ${args.path}` };
        }

        case 'list_directory': {
          const dirPath = path.join(PROJECT_ROOT, args.path || '');
          
          if (!dirPath.startsWith(PROJECT_ROOT)) {
            throw new Error('Acesso negado');
          }
          
          const files = fs.readdirSync(dirPath, { withFileTypes: true });
          const items = files
            .filter(f => !f.name.startsWith('.') && f.name !== 'node_modules')
            .map(f => ({
              name: f.name,
              type: f.isDirectory() ? 'directory' : 'file'
            }));
          
          return { items };
        }

        case 'get_project_info': {
          const packageJson = JSON.parse(
            fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8')
          );
          
          return {
            name: packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            scripts: packageJson.scripts,
            dependencies: Object.keys(packageJson.dependencies || {}),
            root: PROJECT_ROOT
          };
        }

        case 'execute_command': {
          const { execSync } = require('child_process');
          try {
            const output = execSync(args.command, {
              cwd: PROJECT_ROOT,
              encoding: 'utf-8',
              timeout: 30000
            });
            return { output };
          } catch (error) {
            return { error: error.message, output: error.stdout };
          }
        }

        case 'gerar_metodologia': {
          const chunks = [];
          for await (const chunk of metodologiaSkill(args)) {
            chunks.push(chunk);
          }
          return { result: chunks.join('') };
        }

        case 'avaliar_qualidade': {
          const chunks = [];
          for await (const chunk of qualidadeSkill(args)) {
            chunks.push(chunk);
          }
          return { result: chunks.join('') };
        }

        case 'gerar_ppc': {
          const { config, ementa, pesquisa = '', planoEnsino, planoAula = '', metodologia = '', bncc = {} } = args;
          const [perfilEgresso, competencias, perfilDocente, infraestrutura] = await Promise.all([
            (async () => { const c = []; for await (const ch of perfilEgressoSkill({ config, ementa, planoEnsino })) c.push(ch); return c.join(''); })(),
            (async () => { const c = []; for await (const ch of competenciasSkill({ config, ementa, planoEnsino, bncc })) c.push(ch); return c.join(''); })(),
            (async () => { const c = []; for await (const ch of perfilDocenteSkill({ config, ementa })) c.push(ch); return c.join(''); })(),
            (async () => { const c = []; for await (const ch of infraestruturaSkill({ config, conteudo: planoAula })) c.push(ch); return c.join(''); })()
          ]);
          const ppcChunks = [];
          for await (const chunk of ppcAssemblySkill({ config, ementa, pesquisa, planoEnsino, planoAula, metodologia, bncc, perfilEgresso, competencias, perfilDocente, infraestrutura })) {
            ppcChunks.push(chunk);
          }
          return { result: ppcChunks.join(''), perfilEgresso, competencias, perfilDocente, infraestrutura };
        }

        default:
          throw new Error(`Ferramenta desconhecida: ${name}`);
      }
    }

    return { error: 'Requisição inválida' };
  } catch (error) {
    return { error: error.message };
  }
}

// Implementa protocolo JSON-RPC via stdin/stdout
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const request = JSON.parse(line);
      const response = await processRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    }
  }
}

main().catch(console.error);
