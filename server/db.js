// server/db.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// STACKR_DB_FILE points the server at another file (a scratch database for
// tests, or an empty one); the default is the usual server/data/db_mock.json.
const FILE_PATH = process.env.STACKR_DB_FILE ? path.resolve(process.env.STACKR_DB_FILE) : path.join(DATA_DIR, "db_mock.json");

function loadData() {
  if (!fs.existsSync(FILE_PATH)) {
    const initial = { users: [], runs: [], studies: [], custom_loads: [] };
    fs.writeFileSync(FILE_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  try {
    const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    if (!Array.isArray(data.studies)) data.studies = [];   // older files predate studies
    if (!Array.isArray(data.custom_loads)) data.custom_loads = [];   // ... and custom loads
    return data;
  } catch (e) {
    return { users: [], runs: [], studies: [], custom_loads: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

class MockStatement {
  constructor(sql) {
    this.sql = sql.trim().replace(/\s+/g, " ");
  }

  get(...params) {
    const data = loadData();
    // 1. SELECT id FROM users WHERE email = ?
    if (this.sql.includes("SELECT id FROM users WHERE email = ?")) {
      const email = params[0];
      const found = data.users.find(u => u.email === email);
      return found ? { id: found.id } : undefined;
    }
    // 2. SELECT * FROM users WHERE id = ?
    if (this.sql.includes("SELECT * FROM users WHERE id = ?")) {
      const id = parseInt(params[0], 10);
      const found = data.users.find(u => u.id === id);
      return found;
    }
    // 3. SELECT * FROM users WHERE email = ?
    if (this.sql.includes("SELECT * FROM users WHERE email = ?")) {
      const email = params[0];
      const found = data.users.find(u => u.email === email);
      return found;
    }
    // 4. SELECT id,email,name,role,created_at FROM users WHERE id = ?
    if (this.sql.includes("SELECT id,email,name,role,created_at FROM users WHERE id = ?")) {
      const id = parseInt(params[0], 10);
      const found = data.users.find(u => u.id === id);
      if (found) {
        return {
          id: found.id,
          email: found.email,
          name: found.name,
          role: found.role,
          created_at: found.created_at,
          howto_hidden: !!found.howto_hidden
        };
      }
      return undefined;
    }
    // 5. SELECT * FROM runs WHERE id = ? AND user_id = ?
    if (this.sql.includes("SELECT * FROM runs WHERE id = ? AND user_id = ?")) {
      const id = parseInt(params[0], 10), user_id = parseInt(params[1], 10);
      return data.runs.find(r => r.id === id && r.user_id === user_id);
    }
    // 7. SELECT * FROM custom_loads WHERE id = ? AND user_id = ?
    if (this.sql.includes("SELECT * FROM custom_loads WHERE id = ? AND user_id = ?")) {
      const id = String(params[0]), user_id = parseInt(params[1], 10);
      return data.custom_loads.find(c => c.id === id && c.user_id === user_id);
    }
    // 6. SELECT * FROM studies WHERE id = ? AND user_id = ?
    if (this.sql.includes("SELECT * FROM studies WHERE id = ? AND user_id = ?")) {
      const id = parseInt(params[0], 10), user_id = parseInt(params[1], 10);
      return data.studies.find(s => s.id === id && s.user_id === user_id);
    }
    return undefined;
  }

  run(...params) {
    const data = loadData();
    // 1. INSERT INTO users (email, name, role, pass_hash) VALUES (?,?,?,?)
    if (this.sql.includes("INSERT INTO users")) {
      const [email, name, role, pass_hash] = params;
      const id = data.users.length ? Math.max(...data.users.map(u => u.id)) + 1 : 1;
      const newUser = {
        id,
        email,
        name,
        role: role || "researcher",
        pass_hash,
        created_at: new Date().toISOString()
      };
      data.users.push(newUser);
      saveData(data);
      return { lastInsertRowid: id };
    }
    // 2. INSERT INTO runs (must mirror the column list in auth.js)
    if (this.sql.includes("INSERT INTO runs")) {
      const [user_id, strategy, instance, n_items, space_util, dissipation, runtime_s, bins_used, placements_json, container_json,
             strategy_code, dataset, seed, csr, placed, label, result_json, convergence_json, status, error] = params;
      const id = data.runs.length ? Math.max(...data.runs.map(r => r.id)) + 1 : 1;
      const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) ? null : Number(v);
      const newRun = {
        id,
        user_id: parseInt(user_id, 10),
        strategy,
        instance,
        n_items: parseInt(n_items, 10),
        space_util: parseFloat(space_util),
        dissipation: parseFloat(dissipation),
        runtime_s: parseFloat(runtime_s),
        bins_used: parseInt(bins_used, 10),
        placements: placements_json ? JSON.parse(placements_json) : null,
        container: container_json ? JSON.parse(container_json) : null,
        strategy_code: strategy_code ?? null,
        dataset: dataset ?? null,
        seed: num(seed),
        csr: num(csr),
        placed: num(placed),
        label: label ?? null,
        result: result_json ? JSON.parse(result_json) : null,
        convergence: convergence_json ? JSON.parse(convergence_json) : null,
        status: status || "ok",          // ok | failed (the optimizer process exited with an error)
        error: error ?? null,
        created_at: new Date().toISOString()
      };
      data.runs.push(newRun);
      saveData(data);
      return { lastInsertRowid: id };
    }
    // UPDATE users SET howto_hidden = ? WHERE id = ?  ("How to use" pop-up: don't show again)
    if (this.sql.includes("UPDATE users SET howto_hidden = ?")) {
      const [hidden, id] = params;
      const row = data.users.find(u => u.id === parseInt(id, 10));
      if (!row) return { changes: 0 };
      row.howto_hidden = !!hidden;
      saveData(data);
      return { changes: 1 };
    }
    // 3. UPDATE runs SET label = ? WHERE id = ? AND user_id = ?
    if (this.sql.includes("UPDATE runs SET label = ?")) {
      const [label, id, user_id] = params;
      const row = data.runs.find(r => r.id === parseInt(id, 10) && r.user_id === parseInt(user_id, 10));
      if (!row) return { changes: 0 };
      row.label = label;
      saveData(data);
      return { changes: 1 };
    }
    // 5. INSERT INTO studies (user_id, name, size, status, file, progress_file, pid, params, imported, runs)
    if (this.sql.includes("INSERT INTO studies")) {
      const [user_id, name, size, status, file, progress_file, pid, params_json, imported, runs] = params;
      const id = data.studies.length ? Math.max(...data.studies.map(s => s.id)) + 1 : 1;
      data.studies.push({
        id,
        user_id: parseInt(user_id, 10),
        name, size, status, file,
        progress_file: progress_file ?? null,
        pid: pid ?? null,
        params: params_json ? JSON.parse(params_json) : null,
        imported: !!imported,
        runs: runs ?? null,
        created_at: new Date().toISOString()
      });
      saveData(data);
      return { lastInsertRowid: id };
    }
    // 6. UPDATE studies SET status = ? WHERE id = ?
    if (this.sql.includes("UPDATE studies SET status = ?")) {
      const [status, id] = params;
      const row = data.studies.find(s => s.id === parseInt(id, 10));
      if (!row) return { changes: 0 };
      row.status = status;
      saveData(data);
      return { changes: 1 };
    }
    // 7. DELETE FROM studies WHERE id = ? AND user_id = ?
    if (this.sql.includes("DELETE FROM studies WHERE id = ?")) {
      const [id, user_id] = params;
      const before = data.studies.length;
      data.studies = data.studies.filter(s => !(s.id === parseInt(id, 10) && s.user_id === parseInt(user_id, 10)));
      if (data.studies.length === before) return { changes: 0 };
      saveData(data);
      return { changes: 1 };
    }
    // 8. INSERT INTO custom_loads (id, user_id, name, source, n_boxes, file, summary)
    if (this.sql.includes("INSERT INTO custom_loads")) {
      const [id, user_id, name, source, n_boxes, file, summary_json] = params;
      data.custom_loads.push({
        id: String(id),
        user_id: parseInt(user_id, 10),
        name: name ?? null,
        source,
        n_boxes: parseInt(n_boxes, 10),
        file,
        summary: summary_json ? JSON.parse(summary_json) : null,
        created_at: new Date().toISOString()
      });
      saveData(data);
      return { lastInsertRowid: id };
    }
    // 9. DELETE FROM custom_loads WHERE id = ? AND user_id = ?
    if (this.sql.includes("DELETE FROM custom_loads WHERE id = ?")) {
      const [id, user_id] = params;
      const before = data.custom_loads.length;
      data.custom_loads = data.custom_loads.filter(c => !(c.id === String(id) && c.user_id === parseInt(user_id, 10)));
      if (data.custom_loads.length === before) return { changes: 0 };
      saveData(data);
      return { changes: 1 };
    }
    // 4. DELETE FROM runs WHERE id = ? AND user_id = ?
    if (this.sql.includes("DELETE FROM runs WHERE id = ?")) {
      const [id, user_id] = params;
      const before = data.runs.length;
      data.runs = data.runs.filter(r => !(r.id === parseInt(id, 10) && r.user_id === parseInt(user_id, 10)));
      if (data.runs.length === before) return { changes: 0 };
      saveData(data);
      return { changes: 1 };
    }
    return { lastInsertRowid: 0 };
  }

  all(...params) {
    const data = loadData();
    // SELECT * FROM runs WHERE user_id = ? ORDER BY id DESC LIMIT 100
    if (this.sql.includes("SELECT * FROM runs WHERE user_id = ?")) {
      const user_id = parseInt(params[0], 10);
      const filtered = data.runs
        .filter(r => r.user_id === user_id)
        .sort((a, b) => b.id - a.id)
        .slice(0, 100);
      return filtered;
    }
    // SELECT * FROM custom_loads WHERE user_id = ? ORDER BY created_at DESC
    if (this.sql.includes("SELECT * FROM custom_loads WHERE user_id = ?")) {
      const user_id = parseInt(params[0], 10);
      return data.custom_loads.filter(c => c.user_id === user_id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    // SELECT * FROM studies WHERE user_id = ? ORDER BY id DESC
    if (this.sql.includes("SELECT * FROM studies WHERE user_id = ?")) {
      const user_id = parseInt(params[0], 10);
      return data.studies.filter(s => s.user_id === user_id).sort((a, b) => b.id - a.id);
    }
    return [];
  }
}

class MockDatabase {
  exec(sql) {
    loadData();
  }
  pragma(sql) {
    // noop
  }
  prepare(sql) {
    return new MockStatement(sql);
  }
}

module.exports = new MockDatabase();