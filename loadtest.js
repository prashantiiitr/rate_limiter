const autocannon = require('autocannon');

async function runTest({
  title,
  url,
  headers = {},
  duration = 10,
  connections = 10,
}) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Running: ${title}`);
  console.log(
    `URL: ${url} | connections: ${connections} | duration: ${duration}s`
  );
  console.log('─'.repeat(50));

  const result = await autocannon({
    url,
    duration,
    connections,
    headers,
    setupClient: (client) => {
      client.on('response', (statusCode) => {
        if (statusCode === 429) process.stdout.write('✗');
        else process.stdout.write('·');
      });
    },
  });

  console.log(`\n\nResults:`);
  console.log(`  Requests/sec:   ${result.requests.average}`);
  console.log(`  Latency avg:    ${result.latency.average}ms`);
  console.log(`  Latency p99:    ${result.latency.p99}ms`);
  console.log(`  2xx responses:  ${result['2xx']}`);
  console.log(`  Non-2xx:        ${result.non2xx}`);
  console.log(`  Errors:         ${result.errors}`);

  return result;
}

async function main() {
  const BASE = 'http://localhost:3000';

  await runTest({
    title: 'Baseline — /health',
    url: `${BASE}/health`,
    connections: 20,
    duration: 5,
  });

  await runTest({
    title: 'Sliding Window Log — /api/search',
    url: `${BASE}/api/search`,
    headers: { 'x-user-id': 'loadtest-user' },
    connections: 5,
    duration: 5,
  });

  await runTest({
    title: 'Sliding Window Counter — /api/feed',
    url: `${BASE}/api/feed`,
    headers: { 'x-user-id': 'loadtest-user-2' },
    connections: 10,
    duration: 5,
  });

  await runTest({
    title: 'Multi-tier — /api/premium',
    url: `${BASE}/api/premium`,
    headers: { 'x-user-id': 'premium-user' },
    connections: 10,
    duration: 5,
  });

  console.log('\n\nLoad test complete.');
  process.exit(0);
}

main().catch(console.error);