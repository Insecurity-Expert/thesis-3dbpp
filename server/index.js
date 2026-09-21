const express   = require("express");
const cors      = require("cors");
const fs        = require("fs");
const path      = require("path");
const { spawn } = require("child_process");
const readline  = require("readline");
const WebSocket = require("ws");
const cookieParser = require("cookie-parser");
const { router: authRouter } = require("./auth");

const app     = express();
const PORT    = 3001;
const WS_PORT = 3002;

const DATA_ROOT = path.join(__dirname, "..", "data", "CLP-Datasets-Main", "BR");
const RAW_DIR   = path.join(__dirname, "..", "data", "raw");
const SAMPLE    = path.join(__dirname, "..", "experiments", "samples", "sample30_seed42.json");
const OPTIMIZER = path.join(__dirname, "..", "optimizer", "main_optimizer.py");

// Strategy names as the UI sends them -> main_optimizer.py codes.
const STRATEGY_MAP = {
  "DGWO": "DGWO", "MOGWO": "MOGWO",
  "Sequential": "SEQ", "SEQ": "SEQ",
  "Repair-based": "REP", "REP": "REP",
  "HDGWO": "HDGWO",
};

// numba compiles on first use (1-2 s, cached to disk after the first ever run).
// Pay that cost at server start, not in front of an audience.
const warmup = { state: "cold", startedAt: null, finishedAt: null, error: null };

function warmOptimizer() {
  warmup.state = "warming";
  warmup.startedAt = Date.now();
  // REP exercises decode + evaluate + repair, so every compiled kernel is touched.
  const proc = spawn("python", [
    OPTIMIZER, "350", "--dataset", "wtpack", "--raw-dir", RAW_DIR,
    "--strategy", "REP", "--pop-size", "3", "--max-iter", "1", "--seed", "0",
  ], { env: { ...process.env, PYTHONMALLOC: "malloc" } });
  let stderr = "";
  proc.stderr.on("data", (c) => { stderr += c.toString(); });
  proc.on("close", (code) => {
    warmup.finishedAt = Date.now();
    if (code === 0) {
      warmup.state = "warm";
      console.log(`\u{1F525}  Optimizer warm (numba compiled) in ${((warmup.finishedAt - warmup.startedAt) / 1000).toFixed(1)} s`);
    } else {
      warmup.state = "error";
      warmup.error = stderr.split("\n").filter(Boolean).slice(-3).join(" | ");
      console.log(`\u26A0\uFE0F  Optimizer warm-up failed (exit ${code}): ${warmup.error}`);
    }
  });
  proc.on("error", (err) => { warmup.state = "error"; warmup.error = err.message; });
}

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket server (port 3002)
//
// Each client connection owns its own Python child process.
// Protocol (client → server):
//   { action: "run",  instancePath: "<abs path>", maxTime?: 90 }
//   { action: "stop" }
//
// Protocol (server → client, each message is a JSON line from Python or a
// synthetic control message):
//   { type: "instance_info",    container, n_items, lower_bound }
//   { type: "iteration_update", iteration, max_iter, best_bins,
//           best_dissipation, best_composite, temperature,
//           last_udhc, udhc_accepted, solution:[...] }
//   { type: "integration_applied", bins_reduced_by, new_bins }
//   { type: "instance_complete", bins_used, lower_bound, gap_pct,
//           dissipation, composite_score, volume_util_pct, runtime_s,
//           container, n_items, items:[...] }
//   { type: "stopped" }
//   { type: "error",       error: "..." }
//   { type: "run_closed",  code: 0|1 }
// ─────────────────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on("connection", (ws) => {
  console.log("WS client connected");
  let childProc = null;

  function send(obj) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function killChild() {
    if (childProc) {
      try { childProc.kill("SIGTERM"); } catch {}
      childProc = null;
    }
  }

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.action === "run") {
      killChild(); // abort any prior run for this connection

      const pyStrategy = STRATEGY_MAP[msg.strategy] || "SEQ";
      const maxTime = Math.min(Number(msg.maxTime) || 90, 300);
      let argv;

      if (msg.dataset === "wtpack") {
        const id = Number(msg.instanceId);
        if (!Number.isInteger(id) || id < 0 || id > 699) {
          send({ type: "error", error: "instanceId must be an integer in 0..699" });
          return;
        }
        // Tuning is UI-driven; clamp so a typo cannot launch a multi-hour run.
        const popSize = Math.min(Math.max(Number(msg.popSize) || 10, 3), 60);
        const maxIter = Math.min(Math.max(Number(msg.maxIter) || 60, 1), 2000);
        argv = [
          OPTIMIZER, String(id), "--dataset", "wtpack", "--raw-dir", RAW_DIR,
          "--stream", "--strategy", pyStrategy,
          "--pop-size", String(popSize), "--max-iter", String(maxIter),
        ];
        if (msg.lambda !== undefined) argv.push("--lambda", String(Number(msg.lambda)));
        for (const k of ["w", "f", "b", "a"]) {
          const v = msg["lambda_" + k];
          if (v !== undefined) argv.push("--lambda-" + k, String(Number(v)));
        }
        if (msg.enforceSupport === false)   argv.push("--no-enforce-support");
        if (msg.enforceFragility === false) argv.push("--no-enforce-fragility");
        if (msg.seed !== undefined && msg.seed !== null) argv.push("--seed", String(Number(msg.seed)));
      } else {
        // Legacy BR JSON path: unchanged.
        const instancePath = msg.instancePath;
        if (!instancePath) {
          send({ type: "error", error: "instancePath required" });
          return;
        }
        const norm = path.resolve(instancePath);
        if (!norm.startsWith(path.resolve(DATA_ROOT))) {
          send({ type: "error", error: "Path outside data directory" });
          return;
        }
        if (!fs.existsSync(norm)) {
          send({ type: "error", error: "File not found" });
          return;
        }
        argv = [OPTIMIZER, norm, "--stream", "--max-time", String(maxTime), "--strategy", pyStrategy];
      }

      console.log("PY spawn:", argv.slice(1).join(" "));
      childProc = spawn("python", argv, { cwd: path.join(__dirname, ".."), env: { ...process.env, PYTHONMALLOC: "malloc" } });

      // Keep the tail of stderr so a Python traceback can travel to the UI
      // with run_closed instead of dying as a bare exit code.
      let stderrTail = "";
      let lastError = null;

      const rl = readline.createInterface({ input: childProc.stdout, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const t = line.trim();
        if (!t) return;
        let msg;
        try {
          msg = JSON.parse(t);
        } catch (e) {
          // Never drop a line silently: this is exactly how an Infinity in the
          // final envelope hid a broken run for three strategies.
          console.error("PY unparsable stdout line:", t.slice(0, 300));
          send({ type: "error", error: "Optimizer emitted a non-JSON line: " + t.slice(0, 200) });
          return;
        }
        if (msg && msg.type === "error") lastError = msg.error;
        send(msg);
      });

      childProc.stderr.on("data", (d) => {
        const text = d.toString();
        process.stderr.write("PY: " + text);
        stderrTail = (stderrTail + text).slice(-4000);
      });

      childProc.on("exit", (code) => console.error("PY exited:", code));

      childProc.on("close", (code) => {
        rl.close();
        // Surface the most specific message we have: the JSON error envelope
        // if Python sent one, else the last traceback lines from stderr.
        const tail = stderrTail.trim().split("\n").filter(Boolean).slice(-6).join("\n");
        send({ type: "run_closed", code, error: code === 0 ? null : (lastError || tail || null) });
        childProc = null;
      });

      childProc.on("error", (err) => {
        console.error("PY spawn error:", err.message);
        send({ type: "error", error: "Could not start python: " + err.message });
        childProc = null;
      });
    }

    if (msg.action === "stop") {
      killChild();
      send({ type: "stopped" });
    }
  });

  ws.on("close", () => {
    console.log("WS client disconnected");
    killChild();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ready  -> { state: "cold"|"warming"|"warm"|"error", warm, seconds, error }
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/ready", (req, res) => {
  const end = warmup.finishedAt || Date.now();
  res.json({
    state: warmup.state,
    warm: warmup.state === "warm",
    seconds: warmup.startedAt ? (end - warmup.startedAt) / 1000 : null,
    error: warmup.error,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instances?dataset=wtpack
// Returns the sampled wtpack instances with provenance (preprocessing/sampling.py).
// Without the query it returns the legacy BR JSON listing.
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/instances", (req, res) => {
  if (req.query.dataset === "wtpack") {
    try {
      if (!fs.existsSync(SAMPLE)) {
        return res.status(404).json({ error: "sample file not found: " + SAMPLE });
      }
      const prov = JSON.parse(fs.readFileSync(SAMPLE, "utf8"));
      const instances = prov.selected.map((c) => ({
        instance_id:   c.instance_id,
        br_class:      c.br_class,
        file:          c.file,
        n_boxes:       c.n_boxes,
        n_types:       c.n_types,
        fragile_rate:  c.fragile_rate,
        fragile_count: c.fragile_count,
        container:     c.container,
        label: c.br_class + " \u2014 instance " + c.instance_id + " \u2014 " + c.n_boxes +
               " boxes \u2014 " + Math.round(c.fragile_rate * 100) + "% fragile",
      }));
      return res.json({ dataset: "wtpack", seed: prov.seed, count: instances.length, instances });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  try {
    const instances = [];
    if (!fs.existsSync(DATA_ROOT)) {
      return res.json({ count: 0, instances, warning: "BR dataset directory not found: " + DATA_ROOT });
    }
    const sets = fs.readdirSync(DATA_ROOT)
      .filter((n) => fs.statSync(path.join(DATA_ROOT, n)).isDirectory())
      .sort((a, b) => parseInt(a.replace("BR", "")) - parseInt(b.replace("BR", "")));

    for (const setName of sets) {
      const setPath = path.join(DATA_ROOT, setName);
      const files   = fs.readdirSync(setPath)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => parseInt(a) - parseInt(b));

      for (const file of files) {
        instances.push({
          set:   setName,
          file,
          label: `${setName} / ${file}`,
          path:  path.join(setPath, file),
        });
      }
    }
    res.json({ count: instances.length, instances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instance-details
// Returns details (container dimensions and items list) of a selected instance.
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/instance-details", (req, res) => {
  const instancePath = req.query.path;
  if (!instancePath) {
    return res.status(400).json({ error: "path parameter is required" });
  }
  try {
    const resolved = path.resolve(instancePath);
    if (!resolved.startsWith(path.resolve(DATA_ROOT))) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: "Instance not found" });
    }
    const content = fs.readFileSync(resolved, "utf8");
    const parsed = JSON.parse(content);

    // Map parsed format to front-end expected properties
    const container = parsed.Objects && parsed.Objects[0] ? {
      L: parsed.Objects[0].Length,
      H: parsed.Objects[0].Height,
      D: parsed.Objects[0].Depth
    } : null;

    const items = (parsed.Items || []).map((it, idx) => ({
      id: it.id || `BOX-${String(idx + 1).padStart(3, "0")}`,
      L: it.Length,
      H: it.Height,
      D: it.Depth,
      Qty: it.Demand,
      Type: it.Type || "Standard",
      Weight: it.Weight || parseFloat((10 + (idx * 3.5) % 15).toFixed(1)), // synthetic weight
      Stop: it.Stop || 1
    }));

    res.json({ container, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/instances/custom
// Creates or updates the custom run configuration file.
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/instances/custom", (req, res) => {
  try {
    const { container, items } = req.body;
    if (!container || !items) {
      return res.status(400).json({ error: "container and items are required" });
    }

    const customDir = path.join(DATA_ROOT, "custom");
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }
    const filePath = path.join(customDir, "custom.json");

    const formatted = {
      Name: "custom",
      Objects: [{
        Length: Number(container.L),
        Height: Number(container.H),
        Depth: Number(container.D),
        Stock: null,
        Cost: 0
      }],
      Items: items.map((it) => ({
        id: it.id,
        Length: Number(it.L),
        C1_Length: 0,
        Height: Number(it.H),
        C1_Height: 1,
        Depth: Number(it.D),
        C1_Depth: 0,
        Demand: Number(it.Qty),
        DemandMax: null,
        Type: it.Type || "Standard",
        Weight: Number(it.Weight || 0),
        Stop: Number(it.Stop || 1),
        Value: 0
      }))
    };

    fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2));
    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  HTTP API  →  http://localhost:${PORT}`);
  console.log(`✅  WebSocket →  ws://localhost:${WS_PORT}`);
  console.log(`    BR JSON   →  ${DATA_ROOT}${fs.existsSync(DATA_ROOT) ? "" : "  (missing)"}`);
  console.log(`    wtpack    →  ${RAW_DIR}`);
  console.log(`    sample    →  ${SAMPLE}\n`);
  warmOptimizer();
});
