const { ok, err, preflight, getAuthUser } = require('./utils');
const { getBookmarks, addBookmark, removeBookmark } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const user = getAuthUser(event);
  if (!user) return err('Unauthorized', 401);

  // Extract symbol from path — handles both:
  //   /.netlify/functions/bookmarks/SYMBOL  (direct)
  //   /.netlify/functions/bookmarks/:splat  (via redirect)
  const rawPath = event.path || '';
  const afterFn = rawPath
    .replace(/.*\/\.netlify\/functions\/bookmarks/, '')
    .replace(/.*\/api\/bookmarks/, '');
  // afterFn is "" or "/SYMBOL"
  const symbol = afterFn.replace(/^\//, '').trim();

  // GET /api/bookmarks
  if (event.httpMethod === 'GET' && !symbol) {
    return ok(getBookmarks(user.id));
  }

  // POST /api/bookmarks
  if (event.httpMethod === 'POST' && !symbol) {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON'); }
    if (!body.symbol) return err('symbol required');
    const result = addBookmark(user.id, {
      symbol: body.symbol,
      name:   body.name   || body.symbol,
      sector: body.sector || '',
      price:  Number(body.price) || 0,
    });
    if (result.error) return err(result.error);
    return ok({ ok: true, bookmarks: getBookmarks(user.id) });
  }

  // DELETE /api/bookmarks/:symbol
  if (event.httpMethod === 'DELETE' && symbol) {
    const result = removeBookmark(user.id, decodeURIComponent(symbol));
    return ok({ ok: true, bookmarks: getBookmarks(user.id) });
  }

  return err('Not found', 404);
};
