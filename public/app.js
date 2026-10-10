const player = document.querySelector('#player');
const videoList = document.querySelector('#video-list');
const serverGrid = document.querySelector('#server-grid');
const requestList = document.querySelector('#request-list');
const playerMessage = document.querySelector('#player-message');
const routeBadge = document.querySelector('#route-badge');
const videosById = new Map();
let activeVideoId = null;
let previousRequestId = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function renderVideos(videos) {
  document.querySelector('#library-count').textContent = `${String(videos.length).padStart(2, '0')} TITLES`;
  videoList.innerHTML = videos.map((video) => `
    <button class="video-option" type="button" data-video-id="${escapeHtml(video.id)}" aria-pressed="false">
      <img class="video-thumb" src="${escapeHtml(video.poster)}" alt="" loading="lazy">
      <span class="video-option-copy">
        <span class="video-option-title">${escapeHtml(video.title)}</span>
        <span class="video-option-meta">${escapeHtml(video.category)} &middot; ${escapeHtml(video.duration)}</span>
      </span>
      <span class="video-option-arrow" aria-hidden="true">&rarr;</span>
    </button>
  `).join('');

}

function selectVideo(videoId) {
  const video = videosById.get(videoId);
  if (!video) return;

  activeVideoId = videoId;
  playerMessage.textContent = '';
  routeBadge.textContent = 'ROUTING REQUEST...';
  document.querySelector('#video-category').textContent = video.category;
  document.querySelector('#video-title').textContent = video.title;
  document.querySelector('#video-creator').textContent = `${video.creator} / ${video.duration}`;
  document.querySelector('#video-license').textContent = video.license;
  document.querySelectorAll('.video-option').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.videoId === videoId));
  });

  player.src = `/api/stream/${encodeURIComponent(video.id)}`;
  player.load();
  player.play().catch(() => {});
}

function renderServers(servers) {
  serverGrid.innerHTML = servers.map((server) => {
    const online = server.enabled && server.healthy;
    const state = !server.healthy ? 'UNREACHABLE' : server.enabled ? 'ONLINE' : 'SIMULATED OFFLINE';
    const action = server.enabled ? 'Simulate failure' : 'Restore server';
    return `
      <article class="server-card${online ? '' : ' is-offline'}">
        <div class="server-topline">
          <div class="server-name-wrap">
            <span class="server-indicator" aria-hidden="true"></span>
            <span class="server-name">${escapeHtml(server.name)}</span>
          </div>
          <span class="server-state">${state}</span>
        </div>
        <div class="server-bottomline">
          <span class="server-count">STREAMS <strong>${server.requestCount}</strong></span>
          <button class="failure-button" type="button" data-server-id="${escapeHtml(server.id)}" data-failed="${server.enabled}" aria-label="${action} on ${escapeHtml(server.name)}">${action}</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderRequests(requests) {
  if (!requests.length) {
    requestList.innerHTML = '<p class="empty-state">Requests appear here when a video is played.</p>';
    routeBadge.textContent = activeVideoId ? 'WAITING FOR REQUEST' : 'WAITING FOR VIDEO';
    return;
  }

  requestList.innerHTML = requests.map((request) => {
    const time = new Date(request.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const serverClass = request.serverId ? 'request-server' : 'request-server is-missing';
    const codeClass = request.status >= 400 ? 'request-code is-error' : 'request-code';
    return `
      <div class="request-row"${request.id === previousRequestId ? ' style="animation: none"' : ''}>
        <time class="request-time">${escapeHtml(time)}</time>
        <span class="request-video">${escapeHtml(request.videoTitle)}</span>
        <span class="${serverClass}">${escapeHtml(request.serverName)}</span>
        <span class="${codeClass}">${request.status}</span>
      </div>
    `;
  }).join('');

  const latest = requests[0];
  routeBadge.textContent = latest.serverId ? `SERVED BY ${latest.serverName.toUpperCase()}` : 'NO SERVER AVAILABLE';
  previousRequestId = latest.id;
}

async function refreshStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Could not read server status.');
    const status = await response.json();
    renderServers(status.servers);
    renderRequests(status.requests);
  } catch {
    routeBadge.textContent = 'COORDINATOR UNREACHABLE';
  }
}

videoList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-video-id]');
  if (button) selectVideo(button.dataset.videoId);
});

serverGrid.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-server-id]');
  if (!button) return;

  button.disabled = true;
  try {
    await fetch(`/api/servers/${encodeURIComponent(button.dataset.serverId)}/failure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failed: button.dataset.failed === 'true' })
    });
    await refreshStatus();
  } catch {
    playerMessage.textContent = 'Could not update server availability. Try again.';
  } finally {
    button.disabled = false;
  }
});

player.addEventListener('error', () => {
  if (activeVideoId) playerMessage.textContent = 'This stream could not be loaded. Check that a server is online and the sample source is reachable.';
});

player.addEventListener('playing', () => {
  playerMessage.textContent = '';
});

async function initialize() {
  try {
    const response = await fetch('/api/videos');
    if (!response.ok) throw new Error('Could not load the video library.');
    const videos = await response.json();
    videos.forEach((video) => videosById.set(video.id, video));
    renderVideos(videos);
    if (videos[0]) selectVideo(videos[0].id);
  } catch {
    videoList.innerHTML = '<p class="empty-state">The library is unavailable. Refresh to try again.</p>';
  }

  await refreshStatus();
  window.setInterval(refreshStatus, 2500);
}

initialize();