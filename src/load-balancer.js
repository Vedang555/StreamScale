export class RoundRobinLoadBalancer {
  constructor() {
    this.cursor = 0;
  }

  pick(servers) {
    for (let offset = 0; offset < servers.length; offset += 1) {
      const index = (this.cursor + offset) % servers.length;
      const server = servers[index];

      if (server.enabled && server.healthy) {
        this.cursor = (index + 1) % servers.length;
        return server;
      }
    }

    return null;
  }
}