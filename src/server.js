import express from 'express';
import { fork } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { RoundRobinLoadBalancer } from './load-balancer.js';
import { videos, findVideo } from './videos.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(directory, 'stream-worker.js');
const historyLimit = 8;

function pingWorker(worker) {
  return fetch(`http://127.0.0.1:${worker.port}/health`, {
    signal: AbortSignal.timeout(900)
  }).then(async (response) => {
    if (!response.ok) throw new Error('Worker health check failed.');
    return response.json();
  });
}

function relayStream(worker, request, response, onResponse) {
  return new Promise((resolve, reject) => {
    const upstream = http.request({
      hostname: '127.0.0.1',
      port: worker.port,
      path: `/stream/${encodeURIComponent(request.params.videoId)}`,
      method: 'GET',
      headers: request.headers.range ? { range: request.headers.range } : {}
    }, (workerResponse) => {
      onResponse(workerResponse);
      response.status(workerResponse.statusCode ?? 502);
      response.setHeader('X-Stream-Server', worker.name);

      for (const header of ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']) {
        const value = workerResponse.headers[header];
        if (value) response.setHeader(header, value);
      }

      workerResponse.on('error', (error) => response.destroy(error));
      workerResponse.on('end', resolve);
      workerResponse.pipe(response);
    });

    upstream.on('error', reject);
    request.on('aborted', () => upstream.destroy());
    upstream.end();
  });
}

export function createApp(workers, loadBalancer = new RoundRobinLoadBalancer()) {
  const app = express();
  const requestHistory = [];
  let requestId = 0;

  app.use(express.json());
  app.use(express.static(path.join(directory, '..', 'public')));

  app.get('/api/videos', (_request, response) => {
    response.json(videos.map(({ source, ...video }) => video));
  });

  app.get('/api/status', async (_request, response) => {
    const servers = await Promise.all(workers.map(async (worker) => {
      try {
        const health = await pingWorker(worker);
        worker.healthy = true;
        worker.requestCount = health.requestCount;
      } catch {
        worker.healthy = false;
      }

      return {
        id: worker.id,
        name: worker.name,
        enabled: worker.enabled,
        healthy: worker.healthy,
        requestCount: worker.requestCount
      };
    }));

    response.json({ servers, requests: requestHistory });
  });

  app.post('/api/servers/:serverId/failure', (request, response) => {
    const worker = workers.find((candidate) => candidate.id === request.params.serverId);

    if (!worker) {
      response.status(404).json({ error: 'Streaming server not found.' });
      return;
    }

    worker.enabled = request.body.failed !== true;
    response.json({ id: worker.id, enabled: worker.enabled });
  });

  app.get('/api/stream/:videoId', async (request, response) => {
    const video = findVideo(request.params.videoId);

    if (!video) {
      response.status(404).json({ error: 'Video not found.' });
      return;
    }

    const candidates = await Promise.all(workers.map(async (worker) => {
      try {
        await pingWorker(worker);
        worker.healthy = true;
      } catch {
        worker.healthy = false;
      }
      return worker;
    }));
    const attempted = new Set();

    while (!request.aborted) {
      const eligible = candidates.filter((worker) => !attempted.has(worker.id));
      const worker = loadBalancer.pick(eligible);
      if (!worker) break;
      attempted.add(worker.id);

      try {
        await relayStream(worker, request, response, (workerResponse) => {
          requestId += 1;
          requestHistory.unshift({
            id: requestId,
            videoTitle: video.title,
            serverId: worker.id,
            serverName: worker.name,
            status: workerResponse.statusCode ?? 502,
            time: new Date().toISOString()
          });
          requestHistory.length = Math.min(requestHistory.length, historyLimit);
        });
        return;
      } catch {
        worker.healthy = false;
      }
    }

    if (request.aborted) return;

    requestId += 1;
    requestHistory.unshift({
      id: requestId,
      videoTitle: video.title,
      serverId: null,
      serverName: 'No available server',
      status: 503,
      time: new Date().toISOString()
    });
    requestHistory.length = Math.min(requestHistory.length, historyLimit);
    response.status(503).json({ error: 'Both streaming servers are offline.' });
  });

  return app;
}

async function startWorkers() {
  const workers = [
    { id: 'server-a', name: 'Server A', port: 3101 },
    { id: 'server-b', name: 'Server B', port: 3102 }
  ].map((config) => ({ ...config, enabled: true, healthy: false, requestCount: 0 }));

  for (const worker of workers) {
    worker.process = fork(workerPath, [], {
      env: {
        ...process.env,
        SERVER_ID: worker.id,
        SERVER_NAME: worker.name,
        SERVER_PORT: String(worker.port)
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });
    worker.process.on('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`${worker.name} exited with code ${code}.`);
    });
  }

  for (const worker of workers) {
    let started = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await pingWorker(worker);
        worker.healthy = true;
        started = true;
        break;
      } catch {
        await delay(200);
      }
    }

    if (!started) {
      for (const candidate of workers) candidate.process.kill();
      throw new Error(`${worker.name} did not start on port ${worker.port}.`);
    }
  }

  return workers;
}

export async function startServer() {
  const workers = await startWorkers();
  const app = createApp(workers);
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`StreamScale is ready at http://localhost:${port}`);
  });

  const shutdown = () => {
    server.close();
    for (const worker of workers) worker.process.kill();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { server, workers };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}