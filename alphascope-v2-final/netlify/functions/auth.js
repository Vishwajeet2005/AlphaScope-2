const { ok, err, preflight, signToken, hashPassword, checkPassword } = require('./utils');
const { findUser, createUser, safeUser } = require('./db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const path = event.path.replace('/.netlify/functions/auth', '').replace('/api/auth', '');

  // POST /api/auth/register
  if (event.httpMethod === 'POST' && path === '/register') {
    let body;
    try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }
    const { username, email, password } = body;
    if (!username || !email || !password) return err('username, email and password required');
    if (username.length < 3) return err('Username must be at least 3 characters');
    if (password.length < 6) return err('Password must be at least 6 characters');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Invalid email');

    const hashed = hashPassword(password);
    const result = createUser(username.trim(), email.trim().toLowerCase(), hashed);
    if (result.error) return err(result.error);

    const token = signToken({ id: result.user.id, username: result.user.username });
    return ok({ token, user: safeUser(result.user), message: 'Account created' }, 201);
  }

  // POST /api/auth/login
  if (event.httpMethod === 'POST' && path === '/login') {
    let body;
    try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }
    const { username, password } = body;
    if (!username || !password) return err('username and password required');

    const user = findUser(username.trim());
    if (!user) return err('Invalid username or password', 401);
    if (!checkPassword(password, user.password)) return err('Invalid username or password', 401);

    const token = signToken({ id: user.id, username: user.username });
    return ok({ token, user: safeUser(user) });
  }

  return err('Not found', 404);
};
