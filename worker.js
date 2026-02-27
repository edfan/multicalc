// Cloudflare Worker CORS proxy — deploy to cors-header-proxy.edwardzfan.workers.dev
// Usage: https://cors-header-proxy.edwardzfan.workers.dev/?url=https://rk9.gg/pairings/...

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const target = url.searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    // Only allow proxying to rk9.gg
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }
    if (!targetUrl.hostname.endsWith('rk9.gg')) {
      return new Response('Only rk9.gg URLs are allowed', { status: 403 });
    }

    // Forward HX-Request header if present (needed for HTMX partial responses)
    const fetchHeaders = {};
    if (request.headers.get('HX-Request')) {
      fetchHeaders['HX-Request'] = 'true';
    }

    const resp = await fetch(target, { headers: fetchHeaders });
    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': resp.headers.get('Content-Type') || 'text/html',
      },
    });
  },
};
