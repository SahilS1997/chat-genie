import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function normalizeBasePath(value) {
  const basePath = value?.trim() || '/';
  if (!basePath.startsWith('/')) {
    throw new Error('VITE_APP_BASE_PATH must start with "/".');
  }
  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

const basePath = normalizeBasePath(process.env.VITE_APP_BASE_PATH);
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Chat Genie</title>
    <script>window.location.replace(${JSON.stringify(basePath)});</script>
  </head>
  <body>
    <p>Opening Chat Genie...</p>
  </body>
</html>
`;

await writeFile(resolve(import.meta.dirname, '../dist/404.html'), html);
