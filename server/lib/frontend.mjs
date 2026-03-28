import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DIST_DIR, STATIC_CONTENT_TYPES } from './config.mjs';
import { sendStatic } from './http.mjs';

function getStaticContentType(filePath) {
  return STATIC_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function resolveStaticFile(pathname) {
  const normalizedPathname = pathname === '/' ? '/index.html' : pathname;
  const sanitizedPath = path
    .normalize(normalizedPathname)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '');
  const absolutePath = path.resolve(DIST_DIR, sanitizedPath);

  if (absolutePath !== DIST_DIR && !absolutePath.startsWith(`${DIST_DIR}${path.sep}`)) {
    return null;
  }

  try {
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) {
      return null;
    }

    return absolutePath;
  } catch {
    return null;
  }
}

export async function tryServeFrontend(request, response, url) {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    return false;
  }

  if (url.pathname.startsWith('/api/')) {
    return false;
  }

  const requestedFile = await resolveStaticFile(url.pathname);
  const shouldFallbackToIndex = path.extname(url.pathname) === '';
  const filePath =
    requestedFile || (shouldFallbackToIndex ? await resolveStaticFile('/index.html') : null);

  if (!filePath) {
    return false;
  }

  const contentType = getStaticContentType(filePath);
  const body = request.method === 'HEAD' ? '' : await readFile(filePath);
  sendStatic(response, 200, body, contentType);
  return true;
}
