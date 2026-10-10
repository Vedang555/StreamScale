import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/server.js';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('proxies ranged streams, distributes requests, and fails over from unavailable workers', async (context) => {
  const workerServers = [];
  const workers = [];

  for (const [index, name] of ['Server A', 'Server B'].entries()) {
    let requestCount = 0;
    const workerServer = http.createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ requestCount }));
        return;
      }

      requestCount += 1;
      const body = `${name}|${request.headers.range ?? 'full'}`;
      response.writeHead(request.headers.range ? 206 : 200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'video/mp4',
        ...(request.headers.range ? { 'Content-Range': `bytes 0-${Buffer.byteLength(body) - 1}/${Buffer.byteLength(body)}` } : {})
      });
      response.end(body);
    });
    const port = await listen(workerServer);
    workerServers.push(workerServer);
    workers.push({ id: `server-${index}`, name, port, enabled: true, healthy: true, requestCount: 0 });
  }

  const coordinator = http.createServer(createApp(workers));
  const port = await listen(coordinator);
  context.after(async () => {
    await Promise.all([close(coordinator), ...workerServers.map(close)]);
  });

  const stream = async (range = 'bytes=0-12') => fetch(`http://127.0.0.1:${port}/api/stream/spring-flowers`, {
    headers: range ? { Range: range } : {}
  });

  for (const expectedServer of ['Server A', 'Server B', 'Server A', 'Server B']) {
    const response = await stream();
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('x-stream-server'), expectedServer);
    assert.match(await response.text(), new RegExp(`^${expectedServer}\\|bytes=0-12$`));
    assert.match(response.headers.get('content-range'), /^bytes /);
  }

  const failureResponse = await fetch(`http://127.0.0.1:${port}/api/servers/server-0/failure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failed: true })
  });
  assert.equal(failureResponse.status, 200);
  const failedOver = await stream();
  assert.equal(failedOver.headers.get('x-stream-server'), 'Server B');
  await failedOver.text();

  await fetch(`http://127.0.0.1:${port}/api/servers/server-0/failure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failed: false })
  });
  await close(workerServers[0]);
  const afterCrash = await stream();
  assert.equal(afterCrash.headers.get('x-stream-server'), 'Server B');
  await afterCrash.text();

  const status = await fetch(`http://127.0.0.1:${port}/api/status`).then((response) => response.json());
  assert.equal(status.servers[0].healthy, false);
  assert.equal(status.servers[1].healthy, true);
  assert.equal(status.requests[0].serverName, 'Server B');
});