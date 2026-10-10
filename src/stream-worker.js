import express from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { findVideo } from './videos.js';

const app = express();
const serverId = process.env.SERVER_ID ?? 'server';
const serverName = process.env.SERVER_NAME ?? 'Streaming server';
const port = Number(process.env.SERVER_PORT ?? 3101);
let streamRequests = 0;

app.get('/health', (_request, response) => {
  response.json({ id: serverId, requestCount: streamRequests });
});

app.get('/stream/:videoId', async (request, response) => {
  const video = findVideo(request.params.videoId);

  if (!video) {
    response.status(404).json({ error: 'Video not found.' });
    return;
  }

  streamRequests += 1;
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableEnded) controller.abort();
  });

  try {
    const headers = request.headers.range ? { Range: request.headers.range } : {};
    const upstream = await fetch(video.source, { headers, signal: controller.signal });

    response.status(upstream.status);
    response.setHeader('X-Stream-Server', serverName);
    for (const header of ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']) {
      const value = upstream.headers.get(header);
      if (value) response.setHeader(header, value);
    }

    if (!upstream.body) {
      response.end();
      return;
    }

    await pipeline(Readable.fromWeb(upstream.body), response);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    if (error.name === 'AbortError') return;
    response.status(502).json({ error: 'The sample video source could not be reached.' });
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`${serverName} listening on 127.0.0.1:${port}`);
});