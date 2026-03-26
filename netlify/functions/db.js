const fs = require('fs');
const path = require('path');

// In Netlify, /tmp is the only writable dir at runtime.
// For persistent storage across invocations on Netlify, use environment variable
// USERS_DB as a JSON string, or upgrade to Netlify Blobs / Fauna.
// For local dev: writes to data/users.json
const DB_PATH = process.env.NETLIFY
  ? '/tmp/users.json'
  : path.join(__dirname, '../../data/users.json');

const BM_BASE = process.env.NETLIFY
  ? '/tmp'
  : path.join(__dirname, '../../data');

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    // seed from env var if available (for Netlify persistence workaround)
    if (process.env.USERS_SEED) {
      try { return JSON.parse(process.env.USERS_SEED); } catch {}
    }
    return { users: [] };
  }
}

function writeDB(db) {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return true;
  } catch (e) {
    console.error('writeDB error:', e.message);
    return false;
  }
}

function findUser(username) {
  const db = readDB();
  return db.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

function findUserById(id) {
  const db = readDB();
  return db.users.find(u => u.id === id) || null;
}

function createUser(username, email, hashedPassword) {
  const db = readDB();
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { error: 'Username already taken' };
  }
  if (db.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
    return { error: 'Email already registered' };
  }
  const user = {
    id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    username,
    email,
    password: hashedPassword,
    created_at: new Date().toISOString(),
    bookmarks: [],
  };
  db.users.push(user);
  writeDB(db);
  return { user };
}

function getBookmarks(userId) {
  const user = findUserById(userId);
  return user ? (user.bookmarks || []) : [];
}

function addBookmark(userId, stock) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) return { error: 'User not found' };
  if (!user.bookmarks) user.bookmarks = [];
  if (user.bookmarks.find(b => b.symbol === stock.symbol)) {
    return { error: 'Already bookmarked' };
  }
  user.bookmarks.push({ ...stock, bookmarked_at: new Date().toISOString() });
  writeDB(db);
  return { ok: true };
}

function removeBookmark(userId, symbol) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) return { error: 'User not found' };
  user.bookmarks = (user.bookmarks || []).filter(b => b.symbol !== symbol);
  writeDB(db);
  return { ok: true };
}

function safeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

module.exports = { findUser, findUserById, createUser, getBookmarks, addBookmark, removeBookmark, safeUser };
