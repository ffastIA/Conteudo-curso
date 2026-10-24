'use strict';

const { criarLogger } = require('../../logger');

function criar(env = {}, contexto = () => null) {
  const saida = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { saida, logger: criarLogger({ env, contexto, saida }) };
}
const linha = (fn, i = 0) => JSON.parse(fn.mock.calls[i][0]);

describe('logger estruturado', () => {
  test('escreve uma linha JSON válida com nível, mensagem, etapa, aula e reqId', () => {
    const { logger, saida } = criar({}, () => ({ etapa: 'conteudo', traceId: 'abc123', meta: { aula: 2 } }));
    logger.info('aula gerada');
    const l = linha(saida.log);
    expect(l).toMatchObject({ nivel: 'info', mensagem: 'aula gerada', etapa: 'conteudo', aula: 2, reqId: 'abc123' });
    expect(new Date(l.ts).toString()).not.toBe('Invalid Date');
  });

  test('warn e error vão para console.warn/error; info para console.log', () => {
    const { logger, saida } = criar();
    logger.warn('a'); logger.error('b'); logger.info('c');
    expect(saida.warn).toHaveBeenCalledTimes(1);
    expect(saida.error).toHaveBeenCalledTimes(1);
    expect(saida.log).toHaveBeenCalledTimes(1);
  });

  test('LOG_LEVEL=error descarta info e warn', () => {
    const { logger, saida } = criar({ LOG_LEVEL: 'error' });
    logger.info('x'); logger.warn('y'); logger.error('z');
    expect(saida.log).not.toHaveBeenCalled();
    expect(saida.warn).not.toHaveBeenCalled();
    expect(saida.error).toHaveBeenCalledTimes(1);
  });

  test('LOG_LEVEL=silent não escreve nada; debug só com LOG_LEVEL=debug', () => {
    const silencioso = criar({ LOG_LEVEL: 'silent' });
    silencioso.logger.error('x');
    expect(silencioso.saida.error).not.toHaveBeenCalled();
    const padrao = criar();
    padrao.logger.debug('d');
    expect(padrao.saida.log).not.toHaveBeenCalled();
    const depurando = criar({ LOG_LEVEL: 'debug' });
    depurando.logger.debug('d');
    expect(depurando.saida.log).toHaveBeenCalledTimes(1);
  });

  test('compatível com console.warn(msg, err.message) e aceita objeto de contexto', () => {
    const { logger, saida } = criar();
    logger.warn('[x] falhou:', 'timeout', { codigo: 7 });
    expect(linha(saida.warn)).toMatchObject({ mensagem: '[x] falhou: timeout', codigo: 7 });
  });

  test('Error vira a própria mensagem', () => {
    const { logger, saida } = criar();
    logger.error('erro:', new Error('quebrou'));
    expect(linha(saida.error).mensagem).toBe('erro: quebrou');
  });

  test('sem contexto de requisição, os campos de contexto ficam ausentes', () => {
    const { logger, saida } = criar();
    logger.info('solto');
    const l = linha(saida.log);
    expect(l.reqId).toBeUndefined();
    expect(l.etapa).toBeUndefined();
  });

  describe('segredos', () => {
    test('mascara Authorization, Bearer, chaves sk- e key=valor', () => {
      const { logger, saida } = criar();
      logger.error('falha', { cabecalhos: 'Authorization: Bearer sk-proj-ABCDEFGH12345678', openai: 'sk-abcdefghijklmnop', api_key: 'xyz123456789' });
      const bruto = saida.error.mock.calls[0][0];
      expect(bruto).not.toContain('ABCDEFGH12345678');
      expect(bruto).not.toContain('sk-abcdefghijklmnop');
      expect(bruto).not.toContain('xyz123456789');
    });

    test('mascara cookies', () => {
      const { logger, saida } = criar();
      logger.info('req', { h: 'Cookie: sessionId=1234-abcd-5678' });
      expect(saida.log.mock.calls[0][0]).not.toContain('1234-abcd-5678');
    });

    test('mascara o valor literal de variáveis de ambiente com nome de segredo', () => {
      const { logger, saida } = criar({ OPENAI_API_KEY: 'valor-super-secreto-123', LANGFUSE_SECRET_KEY: 'outro-segredo-456' });
      logger.warn('o valor valor-super-secreto-123 apareceu junto de outro-segredo-456');
      const bruto = saida.warn.mock.calls[0][0];
      expect(bruto).not.toContain('valor-super-secreto-123');
      expect(bruto).not.toContain('outro-segredo-456');
    });

    test('não mascara texto comum', () => {
      const { logger, saida } = criar();
      logger.info('Aula 3 gerada com 1200 palavras');
      expect(linha(saida.log).mensagem).toBe('Aula 3 gerada com 1200 palavras');
    });
  });
});
