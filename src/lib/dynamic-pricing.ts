import { t } from "./i18n";
// Parse a bounded display-only subset. Server expressions are never executed.
type Node =
  | { kind: "atom"; value: string }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "choice"; test: Node; yes: Node; no: Node };
export interface PriceTier {
  condition: string;
  label: string;
  prices: Record<string, number>;
  fixed?: number;
}
export const usageLabels: Record<string, string> = {
  get p() {
    return t("ui.e8850440f247");
  },
  get c() {
    return t("ui.ded698ae1e7e");
  },
  get cr() {
    return t("ui.987b1086b2c4");
  },
  get cc() {
    return t("ui.732298044dc7");
  },
  get cc1h() {
    return t("ui.d62e5d375099");
  },
  get img() {
    return t("ui.25afb06916c1");
  },
  get img_o() {
    return t("ui.632375a16eb3");
  },
  get img_cr() {
    return t("ui.7c5ab430e8d4");
  },
  get ai() {
    return t("ui.bed332274fda");
  },
  get ao() {
    return t("ui.509a71c60f45");
  },
  get ac() {
    return t("ui.a2845c4e91eb");
  },
};
const precedence: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  "==": 3,
  "!=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
};

function parse(source: string): Node {
  if (source.length > 16000) throw new Error("limit");
  source = source.replace(/^\s*v1:/, "");
  const tokens: string[] = [];
  const re =
    /\s*("(?:[^"\\]|\\.)*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z_][a-zA-Z_\d]*|<=|>=|==|!=|&&|\|\||[()+*/?,:<>-])/gy;
  let offset = 0;
  while (offset < source.length && source.slice(offset).trim()) {
    re.lastIndex = offset;
    const match = re.exec(source);
    if (!match || tokens.length >= 3000) throw new Error("unsupported");
    tokens.push(match[1]);
    offset = re.lastIndex;
  }
  let cursor = 0;
  const take = (token: string) => {
    if (tokens[cursor++] !== token) throw new Error("syntax");
  };
  function expr(min = 0, depth = 0): Node {
    if (depth > 48) throw new Error("depth");
    let left: Node;
    const token = tokens[cursor++];
    if (!token) throw new Error("end");
    if (token === "(") {
      left = expr(0, depth + 1);
      take(")");
    } else if (/^[a-zA-Z_]/.test(token) && tokens[cursor] === "(") {
      cursor++;
      const args: Node[] = [];
      if (tokens[cursor] !== ")") {
        do {
          args.push(expr(0, depth + 1));
          if (tokens[cursor] !== ",") break;
          cursor++;
        } while (args.length < 8);
      }
      take(")");
      left = { kind: "call", name: token, args };
    } else if (/^(?:[a-zA-Z_]|\d|\.|\")/.test(token))
      left = { kind: "atom", value: token };
    else throw new Error("atom");
    while (
      precedence[tokens[cursor]] !== undefined &&
      precedence[tokens[cursor]] >= min
    ) {
      const op = tokens[cursor++];
      left = {
        kind: "binary",
        op,
        left,
        right: expr(precedence[op] + 1, depth + 1),
      };
    }
    if (min === 0 && tokens[cursor] === "?") {
      cursor++;
      const yes = expr(0, depth + 1);
      take(":");
      left = { kind: "choice", test: left, yes, no: expr(0, depth + 1) };
    }
    return left;
  }
  const root = expr();
  if (cursor !== tokens.length) throw new Error("trailing");
  return root;
}

function number(node: Node): number | null {
  if (node.kind !== "atom" || !/^(?:\d|\.)/.test(node.value)) return null;
  const value = Number(node.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function linear(node: Node): Record<string, number> | null {
  if (node.kind === "atom") {
    if (Object.prototype.hasOwnProperty.call(usageLabels, node.value))
      return { [node.value]: 1 };
    return number(node) === 0 ? {} : null;
  }
  if (node.kind !== "binary") return null;
  if (node.op === "+") {
    const a = linear(node.left),
      b = linear(node.right);
    if (!a || !b) return null;
    const out = { ...a };
    for (const [key, value] of Object.entries(b))
      out[key] = (out[key] ?? 0) + value;
    return out;
  }
  if (node.op === "*" || node.op === "/") {
    let scalar = number(node.right),
      values = linear(node.left);
    if (node.op === "*" && scalar === null) {
      scalar = number(node.left);
      values = linear(node.right);
    }
    if (scalar === null || !values || (node.op === "/" && scalar === 0))
      return null;
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        node.op === "*" ? value * scalar! : value / scalar!,
      ]),
    );
  }
  return null;
}

function condition(node: Node, invert = false): string | null {
  if (node.kind !== "binary") return null;
  if (["&&", "||"].includes(node.op)) {
    const a = condition(node.left),
      b = condition(node.right);
    return a && b
      ? `${invert ? t("ui.208cef38dc8c") : ""}（${a}${node.op === "&&" ? t("ui.6405e692fa45") : t("ui.ec7f383eb3ef")}${b}）`
      : null;
  }
  const variable = node.left.kind === "atom" ? node.left.value : "";
  const value = number(node.right);
  if (!["len", "p", "c"].includes(variable) || value === null) return null;
  const opposite: Record<string, string> = {
    "<": ">=",
    "<=": ">",
    ">": "<=",
    ">=": "<",
    "==": "!=",
    "!=": "==",
  };
  const signs: Record<string, string> = {
    "<": "<",
    "<=": "≤",
    ">": ">",
    ">=": "≥",
    "==": "=",
    "!=": "≠",
  };
  const op = invert ? opposite[node.op] : node.op;
  if (!signs[op]) return null;
  return `${variable === "len" ? t("ui.25606d824aad") : variable === "p" ? t("ui.9d32a2154c97") : t("ui.68254701a051")} ${signs[op]} ${value.toLocaleString("en-US")} Token`;
}

export function readPricingTiers(source: string | undefined): PriceTier[] {
  if (!source) return [];
  try {
    const tiers: PriceTier[] = [];
    function walk(node: Node, conditions: string[] = [], label = "") {
      if (tiers.length >= 32) throw new Error("tiers");
      if (node.kind === "choice") {
        const yes = condition(node.test),
          no = condition(node.test, true);
        if (!yes || !no) throw new Error("condition");
        walk(node.yes, [...conditions, yes], label);
        walk(node.no, [...conditions, no], label);
        return;
      }
      if (
        node.kind === "call" &&
        node.name === "tier" &&
        node.args.length === 2 &&
        node.args[0].kind === "atom" &&
        node.args[0].value.startsWith('"')
      ) {
        walk(node.args[1], conditions, JSON.parse(node.args[0].value));
        return;
      }
      let fixed: number | undefined;
      let prices: Record<string, number> | null = null;
      if (
        node.kind === "call" &&
        node.name === "fixed" &&
        node.args.length === 1
      )
        fixed = number(node.args[0]) ?? undefined;
      else prices = linear(node);
      if (fixed === undefined && !prices) throw new Error("price");
      if (
        prices &&
        Object.values(prices).some((v) => !Number.isFinite(v) || v < 0)
      )
        throw new Error("number");
      tiers.push({
        condition: conditions.join("；") || t("ui.b53be5c873bc"),
        label,
        prices: prices ?? {},
        fixed,
      });
    }
    walk(parse(source));
    return tiers;
  } catch {
    return [];
  }
}
