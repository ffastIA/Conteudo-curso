'use strict';

// A documentação não pode divergir do código (change docs-sincronizadas):
// contagem de endpoints, cookie de sessão, rotas do README, gaps e config do OpenSpec.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '../..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf-8');

const server = ler('server.js');
const project = ler('PROJECT.md');
const readme = ler('README.md');

// Mesmo comando que o PROJECT.md documenta: grep -cE "^\s*app\.(get|post|put|delete|patch)\(" server.js
const rotas = [...server.matchAll(/^\s*app\.(get|post|put|delete|patch)\(\s*'([^']+)'/gm)].map(m => ({ metodo: m[1].toUpperCase(), caminho: m[2] }));

describe('PROJECT.md', () => {
  test('a contagem de endpoints bate com os handlers de server.js', () => {
    expect(rotas.length).toBeGreaterThan(40);
    const m = project.match(/registra (\d+) handlers \((\d+) sempre ativos/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(rotas.length);
    expect(Number(m[2])).toBe(rotas.length - rotas.filter(r => r.caminho === '/api/dev/seed').length);
    expect(project).toContain('grep -cE');
  });

  test('o mapa de arquivos cita a mesma contagem', () => {
    expect(project).toContain(`Express + ${rotas.length} handlers`);
  });

  test('o cookie documentado é o real (sessionId), não o antigo sid', () => {
    expect(server).toMatch(/res\.cookie\('sessionId'/);
    expect(project).toContain('`sessionId`');
    expect(project).not.toMatch(/cookie HttpOnly \(sid\)|cookie HttpOnly `sid`/);
  });

  test('o número de skills e de capabilities está certo', () => {
    const skills = require('../../skills');
    const nSkills = (ler('skills.js').match(/^const \w+Skill = /gm) || []).length;
    expect(project).toContain(`${nSkills} skills de prompt`);
    expect(Object.keys(skills).length).toBeGreaterThan(nSkills);
    const nSpecs = fs.readdirSync(path.join(raiz, 'openspec/specs')).filter(d => fs.existsSync(path.join(raiz, 'openspec/specs', d, 'spec.md'))).length;
    expect(project).toContain(`${nSpecs} capabilities canônicas`);
  });

  test('lista os gaps G11, G12 e G13 com status', () => {
    for (const g of ['G11', 'G12', 'G13']) {
      expect(project).toMatch(new RegExp(`\\| ${g} \\|[^\\n]*(Resolvido|Reduzido|Mitigado|Melhorado)`));
    }
  });

  test('descreve os modelos de dados novos', () => {
    for (const termo of ['pesquisa.json', 'pesquisa_modulos.json', 'geracao_log.json', 'estadoAulas', 'custoProjetoUsd']) {
      expect(project).toContain(termo);
    }
  });

  test('não cita mais o modelo descontinuado como em uso nem o truncamento antigo', () => {
    expect(project).not.toMatch(/\| `gpt-4o-search-preview` \| Pesquisa web/);
    expect(project).not.toContain('Truncamento a 1.500 caracteres ao passar contexto');
  });

  test('a rota de seed continua condicionada só a ENABLE_DEV_SEED', () => {
    expect(project).toContain('ENABLE_DEV_SEED=true');
  });
});

describe('README.md', () => {
  test('toda rota do servidor aparece na tabela de endpoints', () => {
    const faltando = rotas.filter(r => !readme.includes('`' + r.caminho + '`')).map(r => r.caminho);
    expect(faltando).toEqual([]);
  });

  test('descreve as Etapas 9 e 10', () => {
    expect(readme).toMatch(/9\. \*\*Roteiros de vídeo\*\*/);
    expect(readme).toMatch(/10\. \*\*Vídeo com avatar\*\*/);
  });

  test('usa o cookie e o modelo de pesquisa atuais', () => {
    expect(readme).toContain('`sessionId`');
    expect(readme).not.toContain('gpt-4o-search-preview');
  });
});

describe('openspec/config.yaml', () => {
  const config = ler('openspec/config.yaml');

  test('não referencia specs.yaml inexistente', () => {
    expect(fs.existsSync(path.join(raiz, 'specs.yaml'))).toBe(false);
    expect(config).not.toContain('specs.yaml');
  });

  test('lista os modelos e o cookie atuais', () => {
    expect(config).not.toContain('gpt-4o-search-preview');
    expect(config).toContain('sessionId');
  });
});

describe('plans/README.md', () => {
  test('os planos 001 a 005 não estão marcados como TODO', () => {
    const linhas = ler('plans/README.md').split(/\r?\n/).filter(l => /^\| 00[1-5] \|/.test(l));
    expect(linhas).toHaveLength(5);
    for (const l of linhas) expect(l).not.toMatch(/\| TODO \|/);
  });

  test('o plano 005 (remover mcp-server.js) corresponde ao código', () => {
    expect(fs.existsSync(path.join(raiz, 'mcp-server.js'))).toBe(false);
  });
});
