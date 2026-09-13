import { spawn } from 'node:child_process';

const api = spawn(process.execPath, ['scripts/dev-api.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  stdio: 'inherit',
  env: process.env,
});

function stop(code = 0) {
  api.kill();
  vite.kill();
  process.exit(code);
}

api.on('error', (error) => {
  console.error('[chat-genie] Local tenant bridge failed to start:', error);
  stop(1);
});
vite.on('error', (error) => {
  console.error('[chat-genie] Vite failed to start:', error);
  stop(1);
});
api.on('exit', (code) => {
  if (code && !vite.killed) stop(code);
});
vite.on('exit', (code) => {
  if (!api.killed) stop(code ?? 0);
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
