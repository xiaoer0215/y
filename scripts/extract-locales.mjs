// Emit a reviewable patch; never rewrite files directly.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import { execFileSync } from "node:child_process";

const catalogPath = "src/locales/zh-CN.json";
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : {};
const existingKeys = new Set(Object.keys(catalog));
const semantic = {
  "设置": "settings.title", "界面语言": "settings.language", "工作台": "nav.workspace",
  "模型广场": "nav.models", "密钥管理": "nav.keys", "个人中心": "nav.account",
  "工具与环境": "nav.tools", "重新载入": "common.reload", "打开": "common.open",
  "下一步": "common.next", "上一步": "common.previous", "取消": "common.cancel",
  "保存": "common.save", "刷新": "common.refresh", "关闭": "common.close",
  "充值": "account.topup", "通用": "settings.general", "外观": "settings.appearance",
  "关于": "settings.about", "检查更新": "settings.checkUpdates", "粘贴": "common.paste",
};
const han = /[\u3400-\u9fff]/;
const skipped = [];
function keyFor(value) {
  const key = semantic[value] ?? `ui.${crypto.createHash("sha1").update(value).digest("hex").slice(0, 12)}`;
  if (catalog[key] && catalog[key] !== value) throw new Error(`Key collision: ${key}`);
  catalog[key] = value;
  return JSON.stringify(key);
}
function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walkFiles(path.join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [path.join(dir, entry.name)] : []);
}
const files = process.argv.includes("--extra")
  ? ["src/lib/account-data.ts", "src/lib/dynamic-pricing.ts", "src/lib/useModelFetch.ts", "src/lib/desktop-settings.ts", "src/lib/api.ts"]
  : ["src/App.tsx", ...walkFiles("src/components"), "src/lib/useAuth.tsx"];
let patch = "*** Begin Patch\n";
const patches = [];
let modified = 0;
for (const filename of files) {
  const source = fs.readFileSync(filename, "utf8");
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  let translated = false;
  let memoDeps = false;
  function add(start, end, value, list) { list.push({ start, end, value }); }
  function insideFunction(node) {
    for (let p = node.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true;
    return false;
  }
  function technical(node) {
    let child = node;
    for (let p = node.parent; p; child = p, p = p.parent) {
      if (ts.isTypeNode(p)) return true;
      if (ts.isJsxAttribute(p)) return !["title", "label", "description", "placeholder", "aria-label", "alt", "hint", "hintText", "badgeText", "subtitle", "sublabel", "successLabel", "idleLabel", "toolName", "emptyText"].includes(p.name.getText(sf));
      if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && child === p.name) return true;
      if (ts.isElementAccessExpression(p) && child === p.argumentExpression) return true;
      if (ts.isCaseClause(p) && child === p.expression) return true;
      if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
      if (ts.isCallExpression(p) && p.arguments.includes(child)) {
        const method = ts.isPropertyAccessExpression(p.expression) ? p.expression.name.text : "";
        if (["includes", "startsWith", "endsWith", "indexOf", "lastIndexOf", "replace", "replaceAll", "split", "match", "test"].includes(method)) return true;
      }
      if (ts.isStatement(p) || ts.isJsxExpression(p)) break;
    }
    return false;
  }
  function jsxValue(text) {
    // Match JSX's whitespace folding, then decode entities moved into JS strings.
    const lines = text.replace(/\r/g, "").split("\n");
    return lines.map((line, i) => {
      let value = line.replace(/\t/g, " ");
      if (i > 0) value = value.replace(/^ +/, "");
      if (i < lines.length - 1) value = value.replace(/ +$/, "");
      return value;
    }).filter(Boolean).join(" ").replace(/&(?:amp|lt|gt|quot|apos|#x[\da-f]+|#\d+);/gi, entity => {
      const simple = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
      return simple[entity] ?? String.fromCodePoint(entity.startsWith("&#x") ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10));
    });
  }
  function rewritten(node) {
    const nested = [];
    visit(node, nested);
    let result = source.slice(node.getStart(sf), node.end);
    for (const edit of nested.sort((a,b) => b.start-a.start)) result = result.slice(0,edit.start-node.getStart(sf)) + edit.value + result.slice(edit.end-node.getStart(sf));
    return result;
  }
  function visit(node, list = edits) {
    if (ts.isTemplateExpression(node) && han.test(node.head.text + node.templateSpans.map(s => s.literal.text).join("")) && !technical(node)) {
      let value = node.head.text;
      const params = node.templateSpans.map((span, index) => {
        value += `{{v${index}}}` + span.literal.text;
        return `v${index}: ${rewritten(span.expression)}`;
      });
      add(node.getStart(sf), node.end, `t(${keyFor(value)}, { ${params.join(", ")} })`, list);
      translated = true;
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) && han.test(node.text) && !technical(node)) {
      const value = ts.isJsxText(node) ? jsxValue(node.text) : node.text;
      if (!value.trim()) return;
      const call = `t(${keyFor(value)})`;
      const parent = node.parent;
      if (ts.isJsxText(node)) add(node.pos, node.end, `{${call}}`, list);
      else if (ts.isJsxAttribute(parent)) add(node.getStart(sf), node.end, `{${call}}`, list);
      else if (!insideFunction(node)) {
        if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
          add(parent.getStart(sf), parent.end, `get ${parent.name.getText(sf)}() { return ${call}; }`, list);
        } else { skipped.push(`${filename}: ${value}`); return; }
      } else add(node.getStart(sf), node.end, call, list);
      translated = true;
      return;
    }
    ts.forEachChild(node, child => visit(child, list));
  }
  visit(sf);
  if (!translated) continue;
  function addHooks(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && node.body) {
      const name = node.name?.getText(sf) ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(sf) : "");
      if (/^[A-Z]/.test(name) && ts.isBlock(node.body) && !node.body.getText(sf).includes("useLocale();")) {
        add(node.body.getStart(sf) + 1, node.body.getStart(sf) + 1, "\n  useLocale();", edits);
      }
    }
    // Locale-dependent labels must not remain cached by useMemo.
    if (ts.isCallExpression(node) && node.expression.getText(sf) === "useMemo" && node.arguments.length > 1 && ts.isArrayLiteralExpression(node.arguments[1]) && !node.arguments[1].getText(sf).includes("getLocale()")) {
      const deps = node.arguments[1];
      add(deps.end - 1, deps.end - 1, `${deps.elements.length ? ", " : ""}getLocale()`, edits);
      memoDeps = true;
    }
    ts.forEachChild(node, addHooks);
  }
  addHooks(sf);
  let output = source;
  for (const edit of edits.sort((a,b) => b.start-a.start)) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  let relative = path.relative(path.dirname(filename), "src/lib/i18n").replaceAll("\\", "/");
  if (!relative.startsWith(".")) relative = `./${relative}`;
  const hooked = edits.some(edit => edit.value.includes("useLocale();"));
  if (!source.includes(`from ${JSON.stringify(relative)}`)) output = `import { t${hooked ? ", useLocale" : ""}${memoDeps ? ", getLocale" : ""} } from ${JSON.stringify(relative)};\n` + output;
  const diff = execFileSync("python", ["-c", `
import sys,json,difflib
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
d=json.load(sys.stdin)
lines=list(difflib.unified_diff(d['source'].splitlines(),d['output'].splitlines(),n=2,lineterm=''))[2:]
print('\\n'.join('@@' if line.startswith('@@') else line for line in lines))
`], { input: JSON.stringify({ source, output }), encoding: "utf8" });
  const filePatch = `*** Update File: ${filename.replaceAll("\\", "/")}\n${diff}`;
  patch += filePatch;
  patches.push(filePatch);
  modified++;
}
const json = JSON.stringify(Object.fromEntries(Object.entries(catalog).sort(([a],[b])=>a.localeCompare(b))), null, 2) + "\n";
if (fs.existsSync(catalogPath)) {
  patch += `*** Update File: ${catalogPath}\n@@\n` + fs.readFileSync(catalogPath,"utf8").trimEnd().split(/\r?\n/).map(line=>`-${line}`).join("\n")+"\n" + json.trimEnd().split("\n").map(line=>`+${line}`).join("\n")+"\n";
} else patch += `*** Add File: ${catalogPath}\n` + json.trimEnd().split("\n").map(line=>`+${line}`).join("\n")+"\n";
patch += "*** End Patch\n";
if (process.argv.includes("--prepare")) {
  const dir = "output/i18n-patches";
  fs.mkdirSync(dir, { recursive: true });
  const paths = [];
  for (let index = 0; index < patches.length; index++) {
    const target = `${dir}/${String(index).padStart(2, "0")}.patch`;
    fs.writeFileSync(target, `*** Begin Patch\n${patches[index]}*** End Patch\n`, "utf8");
    paths.push(target);
  }
  // Stage the catalog in small additive hunks for bounded tool output.
  const entries = Object.entries(catalog).filter(([key]) => !existingKeys.has(key)).sort(([a],[b]) => a.localeCompare(b));
  for (let offset = 0; offset < entries.length; offset += 120) {
    const target = `${dir}/catalog-${process.argv.includes("--extra") ? "extra-" : ""}${String(offset).padStart(4, "0")}.patch`;
    const lines = entries.slice(offset, offset + 120).map(([key,value]) => `+  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join("\n");
    const body = offset === 0 && !fs.existsSync(catalogPath)
      ? `*** Add File: ${catalogPath}\n+{\n${lines}\n+  "catalog.version": "1"\n+}\n`
      : `*** Update File: ${catalogPath}\n@@\n${lines}\n   "catalog.version": "1"${fs.readFileSync(catalogPath, "utf8").includes('"catalog.version": "1",') ? "," : ""}\n`;
    fs.writeFileSync(target, `*** Begin Patch\n${body}*** End Patch\n`, "utf8");
    paths.push(target);
  }
  console.log(JSON.stringify({ paths, keys: entries.length, skipped }, null, 2));
} else if (process.argv.includes("--patch")) process.stdout.write(patch);
else console.log(JSON.stringify({ modified, keys: Object.keys(catalog).length, skipped }, null, 2));
