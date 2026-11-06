// Self-hosted static file server shared by test_flow.mjs and test_analysis.mjs -
// no external tooling needed, matches "npm run serve" but on a random free port.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
};

export async function startServer() {
  const server = http.createServer((req, res) => {
    const file = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(process.cwd(), file);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Runs each file as its own vm.Script (with a real absolute filename) in the
// jsdom window's internal VM context, in order. Unlike window.eval(), this is
// a "Script" evaluation goal rather than an "Eval" one, so top-level
// let/const/class declarations in one file ARE visible to files run after it
// in the same context - matching how classic <script> tags share one global
// scope in a real browser - while also giving each file a real path on disk,
// which is what lets c8/V8 coverage attribute executed code back to it.
export function runPageScripts(dom, filePaths) {
  const context = dom.getInternalVMContext();
  for (const filePath of filePaths) {
    const absPath = path.resolve(filePath);
    const script = new vm.Script(fs.readFileSync(absPath, "utf-8"), { filename: absPath });
    script.runInContext(context);
  }
}
