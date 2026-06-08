/**
 * Safe JSON fetch — avoids showing raw HTML when API returns an error page.
 */
(function (global) {
  async function parseJsonResponse(res) {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();
    if (!text) return { data: {}, text: '' };
    if (ct.includes('application/json') || (text.trim().startsWith('{') || text.trim().startsWith('['))) {
      try {
        return { data: JSON.parse(text), text };
      } catch (e) {
        throw new Error('Server returned invalid JSON.');
      }
    }
    if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
      throw new Error(
        res.status === 404
          ? 'Service not found. Check that the backend is deployed and the URL is correct.'
          : 'Server returned an HTML error page instead of JSON. Try again or contact support.'
      );
    }
    throw new Error(text.slice(0, 200) || 'Unexpected server response');
  }

  async function apiPost(path, body, options) {
    options = options || {};
    const res = await fetch(path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
      body: JSON.stringify(body)
    });
    const { data } = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
    return data;
  }

  global.DgApiJson = { parseJsonResponse, apiPost };
})(typeof window !== 'undefined' ? window : global);
