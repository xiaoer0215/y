// Keep sentences and counts in one message so each language controls word order.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const catalogPath = "src/locales/zh-CN.json";
const beforeCatalog = fs.readFileSync(catalogPath, "utf8");
const catalog = JSON.parse(beforeCatalog);
const paths = [];
let messages = 0;
function diffPatch(filename, source, output) {
  const diff = execFileSync("python", ["-c", `import sys,json,difflib
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
d=json.load(sys.stdin)
lines=list(difflib.unified_diff(d['source'].splitlines(),d['output'].splitlines(),n=2,lineterm=''))[2:]
print('\\n'.join('@@' if line.startswith('@@') else line for line in lines))`], { input: JSON.stringify({ source, output }), encoding: "utf8" });
  const target = `output/i18n-patches/sentence-${paths.length}.patch`;
  fs.writeFileSync(target, `*** Begin Patch\n*** Update File: ${filename}\n${diff}*** End Patch\n`, "utf8");
  paths.push(target);
}
for (const sf of program.getSourceFiles()) {
  if (!sf.fileName.includes("/src/") && !sf.fileName.includes("\\src\\")) continue;
  if (!sf.fileName.endsWith(".tsx")) continue;
  const source = sf.text;
  const edits = [];
  function scalar(node) {
    const type = checker.getTypeAtLocation(node);
    const allowed = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike;
    return type.isUnion() ? type.types.every(t => Boolean(t.flags & allowed)) : Boolean(type.flags & allowed);
  }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      let text = "", count = 0, translated = false, valid = true;
      const values = [];
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          if (child.text.trim()) text += child.text;
          else if (!child.text.includes("\n")) text += child.text;
        } else if (ts.isJsxExpression(child) && child.expression) {
          const expression = child.expression;
          if (ts.isCallExpression(expression) && expression.expression.getText(sf) === "t" && expression.arguments.length === 1 && ts.isStringLiteral(expression.arguments[0]) && catalog[expression.arguments[0].text]) {
            text += catalog[expression.arguments[0].text];
            translated = true;
          } else if (ts.isStringLiteral(expression)) text += expression.text;
          else if (scalar(expression)) {
            text += `{{v${values.length}}}`;
            values.push(expression.getText(sf));
          } else { valid = false; break; }
          count++;
        } else { valid = false; break; }
      }
      if (valid && translated && count > 1 && values.length > 0) {
        const key = `message.${crypto.createHash("sha1").update(text).digest("hex").slice(0,12)}`;
        catalog[key] = text;
        const args = values.map((value,index)=>`v${index}: ${value}`).join(", ");
        edits.push({ start: node.children.pos, end: node.children.end, value: `{t(${JSON.stringify(key)}, { ${args} })}` });
        messages++;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!edits.length) continue;
  let output = source;
  for (const edit of edits.sort((a,b)=>b.start-a.start)) output = output.slice(0,edit.start) + edit.value + output.slice(edit.end);
  diffPatch(path.relative(process.cwd(), sf.fileName).replaceAll("\\","/"), source, output);
}
diffPatch(catalogPath, beforeCatalog, JSON.stringify(catalog,null,2)+"\n");
console.log(JSON.stringify({ paths, messages }, null, 2));
