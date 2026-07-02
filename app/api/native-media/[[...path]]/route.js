const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'cookie',
  'authorization',
  'x-api-key',
]);

function gatewayBaseUrl() {
  return process.env.NATIVE_MEDIA_GATEWAY_URL || 'http://127.0.0.1:19334';
}

function proxyHeaders(headers) {
  const next = new Headers();
  for (const [key, value] of headers) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) next.set(key, value);
  }
  return next;
}

function targetUrl(request) {
  const incoming = new URL(request.url);
  const target = new URL(gatewayBaseUrl());
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}

async function proxyNativeMedia(request) {
  const init = {
    method: request.method,
    headers: proxyHeaders(request.headers),
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
    init.duplex = 'half';
  }
  const response = await fetch(targetUrl(request), init);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxyHeaders(response.headers),
  });
}

export const GET = proxyNativeMedia;
export const POST = proxyNativeMedia;
export const PATCH = proxyNativeMedia;
export const DELETE = proxyNativeMedia;
