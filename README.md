# StreamScale

StreamScale is a small video-streaming and distributed-computing demonstration. An Express coordinator starts two independent Node.js worker processes, checks their health, and sends each incoming video request to the next available worker. The workers fetch open-license sample videos and stream the bytes back with HTTP Range support, which lets the browser seek without downloading the whole file first.

## Run locally

Requirements: Node.js 20 or later and npm.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). The coordinator starts Server A on port 3101 and Server B on port 3102. Keep the coordinator running; it owns both workers and shuts them down when stopped with Ctrl+C.

Run the scheduler tests with:

```sh
npm test
```

## Demonstrate distribution and failover

1. Play a title. Each video byte request is routed by the coordinator and appears in **Recent requests** with its actual worker and HTTP status. Browser range requests for playback and seeking are routed the same way.
2. Play another title or seek, then compare the stream counts on Server A and Server B. The round-robin scheduler alternates eligible workers.
3. Choose **Simulate failure** on Server A. The coordinator marks that worker unavailable and excludes it from new requests. Play another title or seek; the request trace should show Server B.
4. Restore Server A to return it to rotation. Turning both servers off returns HTTP 503 and records that no worker was available.

The failure control changes the coordinator's availability registry; it does not kill the worker process. Health is still checked against each worker's live `/health` endpoint, so a genuinely stopped worker is also marked unreachable and skipped.

## Architecture

```text
Browser (HTML5 video with Range requests)
                  |
                  v
        Express coordinator :3000
          /         |          \
      health     round-robin   failure control
        /                     \
       v                       v
  Server A :3101          Server B :3102
  child process            child process
       \                       /
        +---- open video source ----+
```

- **Distributed computing:** the two workers are separate OS processes. The coordinator checks each worker's health, selects the next healthy and enabled worker, proxies the request, and records which worker served it. If a worker is disabled or unreachable, it is skipped.
- **Cloud computing:** `render.yaml` describes a small Render web service. The coordinator and both workers run in that service; sample media is stored remotely and streamed on demand, so the project does not bundle large video files. Deploy the project to a Git repository, connect that repository to Render, and use the Blueprint flow to create the service. Render will provide the public URL after the first successful deploy.
- **Playback:** the HTML5 player uses native controls. Both proxy hops forward `Range` and preserve partial-content headers (`206`, `Content-Range`, and `Accept-Ranges`), allowing normal seeking.

The sample catalog uses **Big Buck Bunny** and **Sintel** from the Blender Foundation (Creative Commons Attribution 3.0) and **Spring Flowers** from MDN (CC0). The two Blender films are attributed in the interface; their source pages and license details are available from [Blender Open Movies](https://studio.blender.org/films/) and the [Creative Commons CC BY 3.0 license](https://creativecommons.org/licenses/by/3.0/). Flower video source: [MDN CC0 video sample](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4).

## Configuration notes

The coordinator listens on `PORT` when provided by a hosting service, otherwise on port 3000. Worker ports 3101 and 3102 are internal to the coordinator process and should be left available. The stream sources and their licenses are listed in `src/videos.js`.