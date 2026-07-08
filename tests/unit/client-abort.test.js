'use strict';

jest.mock('openai');

const { EventEmitter } = require('events');
const { clientAbort, combineSignals } = require('../../server');

function fakeRes({ writableEnded = false } = {}) {
  const res = new EventEmitter();
  res.writableEnded = writableEnded;
  return res;
}

describe('clientAbort — detecta desconexão prematura do cliente em rota SSE', () => {
  test('close antes de end aborta o signal', () => {
    const res = fakeRes({ writableEnded: false });
    const client = clientAbort(res);

    expect(client.disconnected).toBe(false);
    res.emit('close');

    expect(client.disconnected).toBe(true);
    expect(client.signal.aborted).toBe(true);
  });

  test('close após writableEnded=true não aborta (encerramento normal)', () => {
    const res = fakeRes({ writableEnded: false });
    const client = clientAbort(res);

    res.writableEnded = true; // servidor já chamou res.end() antes do 'close'
    res.emit('close');

    expect(client.disconnected).toBe(false);
    expect(client.signal.aborted).toBe(false);
  });
});

describe('combineSignals — aborta quando qualquer um dos dois signals aborta', () => {
  test('aborta quando o primeiro signal aborta', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineSignals(a.signal, b.signal);

    expect(combined.aborted).toBe(false);
    a.abort();
    expect(combined.aborted).toBe(true);
  });

  test('aborta quando o segundo signal aborta', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineSignals(a.signal, b.signal);

    expect(combined.aborted).toBe(false);
    b.abort();
    expect(combined.aborted).toBe(true);
  });

  test('permanece não abortado se nenhum dos dois abortar', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineSignals(a.signal, b.signal);

    expect(combined.aborted).toBe(false);
  });
});
