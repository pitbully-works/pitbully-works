// 家計簿アプリと同じ仕様の関数電卓ロジック。
// eval は使わず、トークン化 → 逆ポーランド記法 → 評価の順で安全に計算する。
const SCI_TOKENS_MAX = 120;
const SCI_HISTORY_MAX = 30;
const SCI_DIGITS = 10;

const SCI_FUNCS = { sin: "sin", cos: "cos", tan: "tan", log: "log", ln: "ln", "√": "sqrt" };
const SCI_CONSTS = { "π": Math.PI, e: Math.E };
const SCI_OPS = {
  "+": { prec: 1, right: false },
  "-": { prec: 1, right: false },
  "*": { prec: 2, right: false },
  "/": { prec: 2, right: false },
  "^": { prec: 4, right: true },
};
const SCI_UNARY_PREC = 3;

export function newSci() {
  return { tokens: [], result: null, error: "", ans: 0, deg: true, history: [] };
}
function isSciDigit(t) { return /^[0-9.]$/.test(t); }
export function sciExpr(sci) {
  const tokens = Array.isArray(sci?.tokens) ? sci.tokens.slice(0, SCI_TOKENS_MAX) : [];
  return tokens.map((t) => (SCI_FUNCS[t] ? `${t}(` : String(t ?? "").slice(0, 8))).join("");
}
export function sciFormat(n) {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const r = Number(n.toPrecision(SCI_DIGITS));
  if (Math.abs(r) >= 1e15 || (r !== 0 && Math.abs(r) < 1e-9)) return r.toExponential(6);
  return String(r);
}
function sciTokenize(tokens, ans) {
  const out = [];
  let num = "";
  const pushNum = () => {
    if (num === "") return true;
    if ((num.match(/\./g) || []).length > 1 || num === ".") return false;
    out.push({ t: "num", v: Number(num) }); num = ""; return true;
  };
  const needsTimes = (next) => {
    const last = out[out.length - 1];
    if (!last) return false;
    const lastIsValue = last.t === "num" || last.t === "rparen";
    const nextIsValue = next === "num" || next === "func" || next === "lparen";
    return lastIsValue && nextIsValue;
  };
  for (const tk of tokens) {
    if (isSciDigit(tk)) { if (num === "" && needsTimes("num")) out.push({ t: "op", v: "*" }); num += tk; continue; }
    if (!pushNum()) return null;
    if (SCI_FUNCS[tk]) { if (needsTimes("func")) out.push({ t: "op", v: "*" }); out.push({ t: "func", v: SCI_FUNCS[tk] }, { t: "lparen" }); }
    else if (Object.prototype.hasOwnProperty.call(SCI_CONSTS, tk)) { if (needsTimes("num")) out.push({ t: "op", v: "*" }); out.push({ t: "num", v: SCI_CONSTS[tk] }); }
    else if (tk === "Ans") { if (needsTimes("num")) out.push({ t: "op", v: "*" }); out.push({ t: "num", v: Number(ans) || 0 }); }
    else if (tk === "(") { if (needsTimes("lparen")) out.push({ t: "op", v: "*" }); out.push({ t: "lparen" }); }
    else if (tk === ")") out.push({ t: "rparen" });
    else if (SCI_OPS[tk]) out.push({ t: "op", v: tk });
    else return null;
  }
  return pushNum() ? out : null;
}
function sciToRpn(list) {
  const out = [], stack = []; let prev = null;
  for (const tk of list) {
    if (tk.t === "num") out.push(tk);
    else if (tk.t === "func") stack.push(tk);
    else if (tk.t === "op") {
      const unary = (tk.v === "-" || tk.v === "+") && (prev === null || prev.t === "op" || prev.t === "lparen" || prev.t === "unary");
      if (unary) { stack.push({ t: "unary", v: tk.v }); prev = { t: "unary" }; continue; }
      while (stack.length) {
        const top = stack[stack.length - 1];
        const topPrec = top.t === "unary" ? SCI_UNARY_PREC : (top.t === "func" ? 9 : (SCI_OPS[top.v] || {}).prec);
        if (top.t === "lparen" || topPrec === undefined) break;
        const me = SCI_OPS[tk.v];
        if (topPrec > me.prec || (topPrec === me.prec && !me.right)) out.push(stack.pop()); else break;
      }
      stack.push(tk);
    } else if (tk.t === "lparen") stack.push(tk);
    else if (tk.t === "rparen") {
      let found = false;
      while (stack.length) { const top = stack.pop(); if (top.t === "lparen") { found = true; break; } out.push(top); }
      if (!found) return null;
      if (stack.length && stack[stack.length - 1].t === "func") out.push(stack.pop());
    }
    prev = tk;
  }
  while (stack.length) { const top = stack.pop(); if (top.t === "lparen") return null; out.push(top); }
  return out;
}
function sciDegSpecial(name, x) {
  const m = ((x % 360) + 360) % 360;
  if (!Number.isInteger(m)) return undefined;
  if (name === "sin") { if (m === 0 || m === 180) return 0; if (m === 90) return 1; if (m === 270) return -1; }
  if (name === "cos") { if (m === 90 || m === 270) return 0; if (m === 0) return 1; if (m === 180) return -1; }
  if (name === "tan") { if (m === 0 || m === 180) return 0; if (m === 90 || m === 270) return NaN; }
  return undefined;
}
function sciCallFunc(name, x, deg) {
  if (deg && ["sin","cos","tan"].includes(name) && Number.isFinite(x)) { const special = sciDegSpecial(name, x); if (special !== undefined) return special; }
  const a = deg ? (x * Math.PI) / 180 : x;
  if (name === "sin") return Math.sin(a); if (name === "cos") return Math.cos(a); if (name === "tan") return Math.tan(a);
  if (name === "log") return x > 0 ? Math.log10(x) : NaN; if (name === "ln") return x > 0 ? Math.log(x) : NaN;
  if (name === "sqrt") return x >= 0 ? Math.sqrt(x) : NaN; return NaN;
}
function sciRunRpn(rpn, deg) {
  const st = [];
  for (const tk of rpn) {
    if (tk.t === "num") { st.push(tk.v); continue; }
    if (tk.t === "unary") { if (!st.length) return null; st.push(tk.v === "-" ? -st.pop() : st.pop()); continue; }
    if (tk.t === "func") { if (!st.length) return null; st.push(sciCallFunc(tk.v, st.pop(), deg)); continue; }
    if (tk.t === "op") {
      if (st.length < 2) return null; const b = st.pop(), a = st.pop();
      if (tk.v === "+") st.push(a + b); else if (tk.v === "-") st.push(a - b); else if (tk.v === "*") st.push(a * b);
      else if (tk.v === "/") { if (b === 0) return { divZero: true }; st.push(a / b); } else if (tk.v === "^") st.push(Math.pow(a, b));
      continue;
    }
    return null;
  }
  return st.length === 1 ? { value: st[0] } : null;
}
export function sciEvaluate(tokens, opts = {}) {
  if (!Array.isArray(tokens) || !tokens.length) return { ok: false, error: "" };
  if (tokens.length > SCI_TOKENS_MAX) return { ok: false, error: "式が長すぎます" };
  const boundedTokens = tokens.slice(0, SCI_TOKENS_MAX);
  const list = sciTokenize(boundedTokens, Number.isFinite(opts.ans) ? opts.ans : 0); if (!list) return { ok: false, error: "式が正しくありません" };
  const rpn = sciToRpn(list); if (!rpn) return { ok: false, error: "かっこが合っていません" };
  const r = sciRunRpn(rpn, opts.deg !== false); if (!r) return { ok: false, error: "式が正しくありません" };
  if (r.divZero) return { ok: false, error: "0では割れません" }; if (!Number.isFinite(r.value)) return { ok: false, error: "計算できません" };
  return { ok: true, value: r.value };
}
export function sciPress(state, key) {
  const src = state && typeof state === "object" ? state : {};
  const s = newSci();
  s.tokens = Array.isArray(src.tokens) ? src.tokens.slice(0, SCI_TOKENS_MAX) : [];
  s.history = normalizeSciHistory(src.history);
  s.result = Number.isFinite(src.result) ? src.result : null;
  s.ans = Number.isFinite(src.ans) ? src.ans : 0;
  s.deg = typeof src.deg === "boolean" ? src.deg : true;
  s.error = "";
  const k = String(key).slice(0, 16);
  if (k === "AC") { const keep = { ans: s.ans, deg: s.deg, history: s.history }; return Object.assign(newSci(), keep); }
  if (k === "deg") { s.deg = !s.deg; return s; }
  if (k === "DEL") { if (s.result !== null) { s.result = null; return s; } s.tokens.pop(); return s; }
  if (k === "=") { const r = sciEvaluate(s.tokens, { ans: s.ans, deg: s.deg }); if (!r.ok) { s.error = r.error; return s; } s.result = r.value; s.ans = r.value; s.history = [{ expr: sciExpr(s), value: r.value }, ...s.history].slice(0, SCI_HISTORY_MAX); return s; }
  const isValueKey = isSciDigit(k) || SCI_FUNCS[k] || Object.prototype.hasOwnProperty.call(SCI_CONSTS, k) || k === "(" || k === "Ans";
  if (s.result !== null) { if (isValueKey) s.tokens = []; else s.tokens = String(sciFormat(s.result)).split(""); s.result = null; }
  if (s.tokens.length >= SCI_TOKENS_MAX) { s.error = "式が長すぎます"; return s; }
  if (!isSciDigit(k) && !SCI_FUNCS[k] && !SCI_OPS[k] && k !== "(" && k !== ")" && !Object.prototype.hasOwnProperty.call(SCI_CONSTS, k) && k !== "Ans") return s;
  s.tokens.push(k); return s;
}

export function sciTokensFromExpr(expr) {
  const text = String(expr || "").slice(0, SCI_TOKENS_MAX * 8);
  const out = [];
  for (let i = 0; i < text.length;) {
    let matched = false;
    for (const name of ["sin", "cos", "tan", "log", "ln"]) {
      if (text.startsWith(name + "(", i)) { out.push(name); i += name.length + 1; matched = true; break; }
    }
    if (matched) continue;
    if (text.startsWith("√(", i)) { out.push("√"); i += 2; continue; }
    if (text.startsWith("Ans", i)) { out.push("Ans"); i += 3; continue; }
    out.push(text[i]); i += 1;
    if (out.length >= SCI_TOKENS_MAX) break;
  }
  return out.slice(0, SCI_TOKENS_MAX);
}

export function normalizeSciHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, SCI_HISTORY_MAX).map((h) => {
    if (!h || typeof h !== "object" || Array.isArray(h)) return null;
    const expr = String(h.expr == null ? "" : h.expr).slice(0, SCI_TOKENS_MAX * 4);
    const value = Number(h.value);
    return expr && Number.isFinite(value) ? { expr, value } : null;
  }).filter(Boolean);
}
export function sciClearHistory(state) { const s = Object.assign(newSci(), state || {}); s.history = []; return s; }
