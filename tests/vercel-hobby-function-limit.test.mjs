import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Vercel deployment stays within the Hobby 12-function limit', () => {
  const functionFiles = fs.readdirSync(path.join(root, 'api'))
    .filter((name) => /\.(?:js|mjs|ts)$/.test(name));
  assert.equal(functionFiles.length, 12, `Expected 12 Vercel functions, found ${functionFiles.length}: ${functionFiles.join(', ')}`);
  assert.equal(functionFiles.includes('opportunities.js'), false);
  assert.equal(fs.existsSync(path.join(root, 'lib', 'opportunities-handler.js')), true);
});

test('/api/opportunities is preserved through the shared jobs function', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const jobs = fs.readFileSync(path.join(root, 'api', 'jobs.js'), 'utf8');
  assert.deepEqual(vercel.routes[0], {
    src: '/api/opportunities',
    dest: '/api/jobs?service=opportunities',
  });
  assert.match(jobs, /require\('\.\.\/lib\/opportunities-handler'\)/);
  assert.match(jobs, /toLowerCase\(\) === 'opportunities'/);
});
