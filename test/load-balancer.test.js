import assert from 'node:assert/strict';
import test from 'node:test';
import { RoundRobinLoadBalancer } from '../src/load-balancer.js';

function servers() {
  return [
    { id: 'server-a', enabled: true, healthy: true },
    { id: 'server-b', enabled: true, healthy: true }
  ];
}

test('routes eligible requests in round-robin order', () => {
  const balancer = new RoundRobinLoadBalancer();
  const pool = servers();

  assert.equal(balancer.pick(pool).id, 'server-a');
  assert.equal(balancer.pick(pool).id, 'server-b');
  assert.equal(balancer.pick(pool).id, 'server-a');
});

test('skips an unavailable server and continues routing to the live one', () => {
  const balancer = new RoundRobinLoadBalancer();
  const pool = servers();
  pool[0].enabled = false;

  assert.equal(balancer.pick(pool).id, 'server-b');
  assert.equal(balancer.pick(pool).id, 'server-b');
});

test('returns no destination when every server is unavailable', () => {
  const balancer = new RoundRobinLoadBalancer();
  const pool = servers().map((server) => ({ ...server, healthy: false }));

  assert.equal(balancer.pick(pool), null);
});

test('resumes round-robin distribution when a failed server returns', () => {
  const balancer = new RoundRobinLoadBalancer();
  const pool = servers();
  pool[0].enabled = false;

  assert.equal(balancer.pick(pool).id, 'server-b');
  pool[0].enabled = true;
  assert.equal(balancer.pick(pool).id, 'server-a');
  assert.equal(balancer.pick(pool).id, 'server-b');
});