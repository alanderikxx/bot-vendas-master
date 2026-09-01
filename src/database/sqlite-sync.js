/**
 * Wrapper sobre sql.js com inicialização assíncrona uma única vez.
 * Após initDb() ser chamado, todas as operações são síncronas.
 *
 * Uso:
 *   const { initDb, db, ... } = require('./database');
 *   await initDb();  // só na inicialização do bot
 */

const fs   = require('fs');
const path = require('path');

let SQL     = null;
let _db     = null;
let _dbPath = null;

async function initSqlJs(dbPath) {
  if (_db) return; // já inicializado

  _dbPath = dbPath;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const initFn    = require('sql.js');
  const wasmPath  = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);

  SQL = await initFn({ wasmBinary });

  if (fs.existsSync(dbPath)) {
    _db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    _db = new SQL.Database();
  }

  // PRAGMAs
  for (const p of ['journal_mode=WAL', 'synchronous=NORMAL', 'foreign_keys=ON', 'cache_size=10000']) {
    try { _db.run(`PRAGMA ${p}`); } catch {}
  }

  // Auto-save a cada 5s
  const si = setInterval(() => _save(), 5000);
  si.unref();
  process.on('exit',    () => _save());
  process.on('SIGINT',  () => { _save(); process.exit(0); });
  process.on('SIGTERM', () => { _save(); process.exit(0); });
}

function _save() {
  if (!_db || !_dbPath) return;
  try { fs.writeFileSync(_dbPath, Buffer.from(_db.export())); } catch {}
}

function _run(sql, params = []) {
  try {
    _db.run(sql, params);
    return { changes: _db.getRowsModified(), lastInsertRowid: 0 };
  } catch (e) {
    if (e.message?.includes('already exists')) return { changes: 0 };
    throw e;
  }
}

// ─── API pública (igual ao better-sqlite3) ───────────────────────────────────

const db = {
  pragma(stmt)  { try { _run(`PRAGMA ${stmt}`); } catch {} },
  exec(sql) {
    for (const s of sql.split(';').map(x => x.trim()).filter(Boolean)) {
      try { _run(s); } catch (e) {
        if (!e.message?.includes('already exists')) throw e;
      }
    }
  },
  prepare(sql) {
    return {
      run(...params)  { return _run(sql, params.flat()); },
      get(...params)  {
        const stmt = _db.prepare(sql);
        stmt.bind(params.flat());
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row;
      },
      all(...params)  {
        const rows = [], stmt = _db.prepare(sql);
        stmt.bind(params.flat());
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
    };
  },
  transaction(fn) {
    return function(...args) {
      _run('BEGIN');
      try   { const r = fn(...args); _run('COMMIT'); _save(); return r; }
      catch (e) { try { _run('ROLLBACK'); } catch {} throw e; }
    };
  },
  save: _save,
};

module.exports = { initSqlJs, db };
