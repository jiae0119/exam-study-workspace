import fs from "node:fs";
import path from "node:path";

const root = path.resolve("..", "문제");
const names = ["미디어와 문화정책 8-1.json", "미디어와 문화정책 8-2.json", "미디어와 문화정책 8-3.json"];
const rootKeys = new Set(["course", "week", "set", "topic", "structure", "generatedAt"]);
const qKeys = new Set(["week", "set", "num", "category", "source_slide"]);

for (const name of names) {
  const file = path.join(root, name);
  const raw = fs.readFileSync(file, "utf8");
  const j = JSON.parse(raw);
  for (const k of Object.keys(j)) {
    if (rootKeys.has(k)) delete j[k];
  }
  if (Array.isArray(j.questions)) {
    for (const q of j.questions) {
      if (q && typeof q === "object") {
        for (const k of qKeys) delete q[k];
      }
    }
  }
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n", "utf8");
  console.log("ok", name);
}
