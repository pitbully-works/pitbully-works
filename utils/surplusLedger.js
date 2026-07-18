// ============================================================================
// utils/surplusLedger.js
//
// 余剰金の「使う」台帳（surplusLedger）まわりの、UI・エンジン結線・テストで共有する
// 純粋関数だけを置く。React にも DOM にも依存しない（テストしやすさと一貫性のため）。
//
// 【設計の要（変更なし）】
//   ・余剰金は銀行預金の内訳（別資産ではない）。
//   ・シミュレーション開始後に発生した余剰金（＋初期入力分）だけを管理する。
//   ・一度使った余剰金は二重に使えない（エンジンが実使用額を1回だけ引く）。
//   ・利用者は「用途（category）」だけを選ぶ。種別（kind: consume / transfer）は
//     用途から自動判定する（surplusKindForCategory）。UI・buildPlanInput・テストが
//     この 1 つの関数を共有するので、判定がズレない。
//   ・consume … 実消費。銀行プールから一度だけ引く＝総資産がその分だけ減る。
//   ・transfer … NISAへ回す/銀行へ戻す等。総資産不変のラベル移動（エンジンに渡さない）。
// ============================================================================

// 用途の一覧（表示順）。翻訳キーは "surplusCategory_" + value（ja.js / en.js 側）。
export const SURPLUS_CATEGORIES = [
  "living",   // 生活費
  "medical",  // 医療費
  "travel",   // 旅行
  "car",      // 車
  "reform",   // リフォーム
  "toNisa",   // NISAへ回す（付け替え）
  "toBank",   // 銀行へ戻す（付け替え）
  "other",    // その他（メモ）
];

// 付け替え（総資産不変）になる用途。これ以外は消費。
const TRANSFER_CATEGORIES = new Set(["toNisa", "toBank"]);

// 種別（kind）として妥当な値。これ以外（未設定・空文字・誤った文字列）は「明示されていない」と扱う。
const VALID_KINDS = new Set(["consume", "transfer"]);

// 旧バージョンの保存データで使われていた用途名 → 現在の用途名。
// 例：古いデータの "nisa" / "bank" は、現在の "toNisa" / "toBank"（付け替え）と同じ意味。
// これを吸収しないと、古い付け替えの行が「不明な用途」→ 消費と推定され、
// 総資産を減らしてしまう（資金移動なのに資産が減る＝方針違反）。
const LEGACY_CATEGORY_ALIASES = {
  nisa: "toNisa",
  bank: "toBank",
  toNISA: "toNisa",
  transferToNisa: "toNisa",
  transferToBank: "toBank",
};

// 用途 → 種別（kind）。toNisa / toBank だけ transfer、それ以外は消費。
export function surplusKindForCategory(category) {
  return TRANSFER_CATEGORIES.has(canonicalSurplusCategory(category)) ? "transfer" : "consume";
}

// 用途が既知のものか（不明な値は "other" 扱いにするための判定に使える）。
export function isKnownSurplusCategory(category) {
  return SURPLUS_CATEGORIES.includes(category);
}

/**
 * 用途名の正規化。既知ならそのまま、旧名なら現在の名前へ読み替え、
 * それ以外（未設定・不明な文字列）は "other" にする。
 *
 * @param {string} category 保存されていた用途名
 * @returns {string} 既知の用途名（SURPLUS_CATEGORIES のいずれか）
 */
export function canonicalSurplusCategory(category) {
  if (isKnownSurplusCategory(category)) return category;
  const alias = LEGACY_CATEGORY_ALIASES[category];
  return alias && isKnownSurplusCategory(alias) ? alias : "other";
}

/**
 * 種別（kind）の決定ルール。台帳の解釈は必ずこの1関数を通す。
 *
 * 【優先順位（この順で確定し、後段が前段を上書きしない）】
 *   ① 保存されている kind が "consume" / "transfer" と明示されていれば、必ずそれを使う。
 *      用途（category）と矛盾していても勝手に書き換えない。利用者が記録した意図を、
 *      アプリ側の推定で塗り潰さないため。
 *   ② kind が欠落・空文字・不正値のときだけ、用途から推定する（用途の既定の意味）。
 *
 * 【なぜ①が必要か】
 *   「車」の用途で記録された行でも、利用者が資金移動として扱っていた保存データがあり得る。
 *   ①が無いと、その行が再読み込みのたびに消費へ変わり、総資産が減って見える
 *   （＝資金移動は総資産を増減させない、という設計方針が壊れる）。
 *
 * @param {object} entry 台帳1行
 * @returns {"consume"|"transfer"} 種別
 */
export function resolveSurplusKind(entry) {
  const e = entry && typeof entry === "object" ? entry : {};
  const explicit = typeof e.kind === "string" ? e.kind.trim() : "";
  if (VALID_KINDS.has(explicit)) return explicit;               // ① 明示された kind を最優先
  return surplusKindForCategory(canonicalSurplusCategory(e.category)); // ② 用途から推定
}

// ============================================================================
// 台帳の正規化
//
// 【なぜ必要か】
//   台帳は保存データ（localStorage / バックアップJSON）から復元されるため、
//   古いバージョンで作られた行には id や kind が無いことがある。
//     ・kind が無い行は「consume 判定」から漏れ、使ったはずの余剰金が引かれない。
//     ・id が無い（または重複した）行は、エンジンが返す実使用額・不足額を
//       台帳行に正しく紐付けられず、削除ボタンも別の行を巻き込む。
//   そこで、画面表示・エンジン結線・削除のすべてが「正規化済みの台帳」を見るようにして、
//   表示と計算と操作が同じ1本のデータを共有するようにする。
//
// 【非破壊】入力配列も各要素も一切書き換えない（常に新しい配列・新しいオブジェクトを返す）。
// 【決定的】同じ入力からは常に同じ id が得られる（index 由来なので再読込でもブレない）。
// ============================================================================

// id が無い行に与える決定的な id（index 由来）。
const fallbackId = (index) => `surplus-${index}`;

/**
 * 台帳1行の正規化。
 *   ・category … 既知でなければ "other"（旧名 "nisa" / "bank" は現行名へ読み替える）。
 *   ・kind     … resolveSurplusKind の優先順位で決める。
 *                明示された kind が最優先で、欠落・不正値のときだけ用途から推定する。
 *                用途と矛盾していても、正規化が kind を書き換えることはない。
 *   ・amount   … 数値化して 0 未満は 0。
 *   ・age      … 数値化（非数値は NaN のまま返し、呼び出し側の有限判定で落とす）。
 *   ・id       … 無ければ index 由来の決定的な id を与える。
 *
 * @param {object} entry 台帳1行（保存データ由来の欠損を許容）
 * @param {number} index 配列内の位置（id 生成に使う）
 * @returns {object} 正規化された新しい行
 */
export function normalizeSurplusEntry(entry, index = 0) {
  const e = entry && typeof entry === "object" ? entry : {};
  // 用途は正規化するが、種別は resolveSurplusKind の優先順位に従う。
  // （明示された kind は用途と矛盾していても維持する＝正規化で上書きしない）
  const category = canonicalSurplusCategory(e.category);
  const kind = resolveSurplusKind(e);
  const amount = Math.max(0, Number(e.amount) || 0);
  const id = e.id === undefined || e.id === null || e.id === "" ? fallbackId(index) : String(e.id);
  return {
    ...e,
    id,
    age: Number(e.age),
    kind,
    category,
    amount,
    memo: typeof e.memo === "string" ? e.memo : "",
  };
}

/**
 * 台帳全体の正規化。id の重複も解消する（重複したまま残すと、実使用額の紐付けと
 * 削除操作が別の行を巻き込み、「二重に使えない」保証が表示側で崩れるため）。
 *
 * @param {Array} list inputs.surplusLedger（未定義・非配列も許容）
 * @returns {Array} 正規化された新しい配列
 */
export function normalizeSurplusLedger(list) {
  const src = Array.isArray(list) ? list : [];
  const seen = new Set();
  return src.map((entry, index) => {
    const e = normalizeSurplusEntry(entry, index);
    let id = e.id;
    // 同じ id が既に使われていたら、位置由来の一意な id へ置き換える。
    if (seen.has(id)) {
      let candidate = `${id}#${index}`;
      let n = index;
      while (seen.has(candidate)) candidate = `${id}#${++n}`;
      id = candidate;
    }
    seen.add(id);
    return id === e.id ? e : { ...e, id };
  });
}

/**
 * 台帳から1行を削除する（純粋関数）。
 * 削除前に正規化するので、id を持たない古い保存データの行でも確実に1行だけ消える。
 * 返り値は正規化済みの新しい配列で、これを inputs.surplusLedger に入れ直すと、
 * 次のレンダリングで buildPlanInput → runIntegratedPlan が走り、
 * 余剰金残高は「削除後の台帳」から丸ごと再計算される（差分の巻き戻しはしない）。
 *
 * @param {Array} list 台帳
 * @param {string} id  削除する行の id
 * @returns {Array} 削除後の新しい配列
 */
export function removeSurplusEntry(list, id) {
  const target = id === undefined || id === null ? null : String(id);
  return normalizeSurplusLedger(list).filter((e) => e.id !== target);
}

// ============================================================================
// 使用結果の要約（表示専用）
//
// エンジン（runIntegratedPlan）は oneTimeExpenseResults として
//   { id, age, requestedAmount, actuallySpent, insufficientSurplusAmount }
// を返す。これを台帳の行と突き合わせて、画面が「実際に使えた金額」と「不足額」を
// 表示できる形にまとめる。計算はしない（エンジンの返り値をそのまま読むだけ）。
// ============================================================================

// 台帳1行の使用状態。
export const SURPLUS_USE_STATUS = {
  TRANSFER: "transfer",      // 付け替え（総資産不変。エンジンには渡していない）
  FULL: "full",              // 要求額を全額使えた
  PARTIAL: "partial",        // 一部だけ使えた（余剰金不足）
  NONE: "none",              // 1円も使えなかった（余剰金残高が0）
  NOT_APPLIED: "notApplied", // 反映対象外（現在年齢より過去、または想定寿命より先）
};

/**
 * 台帳 × エンジン結果 → 行ごとの使用状況。
 *
 * @param {Array} ledger                 inputs.surplusLedger
 * @param {Array} oneTimeExpenseResults  integrated.oneTimeExpenseResults
 * @returns {Array} 各行 { id, age, kind, category, amount, memo,
 *                        requestedAmount, actuallySpent, insufficientSurplusAmount, status }
 */
export function summarizeSurplusUsage(ledger, oneTimeExpenseResults) {
  const entries = normalizeSurplusLedger(ledger);
  // id ごとの結果キュー。万一 id が重複していても、先頭から1件ずつ取り出して
  // 1行に1結果だけを割り当てる（1つの結果を2行で使い回さない＝二重表示を防ぐ）。
  const queues = new Map();
  (Array.isArray(oneTimeExpenseResults) ? oneTimeExpenseResults : []).forEach((r) => {
    if (!r || r.id === undefined || r.id === null) return;
    const key = String(r.id);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(r);
  });

  return entries.map((e) => {
    const row = {
      id: e.id, age: e.age, kind: e.kind, category: e.category,
      amount: e.amount, memo: e.memo,
      requestedAmount: e.amount,
    };
    // 付け替えはエンジンに渡していないので、資産の増減も不足額も無い。
    if (e.kind === "transfer") {
      return { ...row, actuallySpent: 0, insufficientSurplusAmount: 0, status: SURPLUS_USE_STATUS.TRANSFER };
    }
    const queue = queues.get(String(e.id));
    const result = queue && queue.length ? queue.shift() : null;
    // 結果が無い＝エンジンが処理対象にしていない行（過去の支出・想定寿命より先の年齢）。
    // 不足額としては数えない（余剰金が足りないのではなく、そもそも反映されていない）。
    if (!result) {
      return { ...row, actuallySpent: 0, insufficientSurplusAmount: 0, status: SURPLUS_USE_STATUS.NOT_APPLIED };
    }
    const actuallySpent = Math.max(0, Number(result.actuallySpent) || 0);
    const insufficientSurplusAmount = Math.max(0, Number(result.insufficientSurplusAmount) || 0);
    const requestedAmount = Number.isFinite(Number(result.requestedAmount))
      ? Number(result.requestedAmount)
      : e.amount;
    const status =
      insufficientSurplusAmount <= 0 ? SURPLUS_USE_STATUS.FULL
        : actuallySpent > 0 ? SURPLUS_USE_STATUS.PARTIAL
          : SURPLUS_USE_STATUS.NONE;
    return { ...row, requestedAmount, actuallySpent, insufficientSurplusAmount, status };
  });
}

/**
 * 使用状況の合計（表示専用）。要求額・実使用額・不足額の合計を返す。
 * 付け替え（transfer）と未反映（notApplied）は消費ではないので合計に入れない。
 *
 * @param {Array} summary summarizeSurplusUsage の結果
 * @returns {object} { requested, spent, shortfall }
 */
export function totalSurplusUsage(summary) {
  const list = Array.isArray(summary) ? summary : [];
  return list.reduce((acc, r) => {
    if (!r || r.status === SURPLUS_USE_STATUS.TRANSFER || r.status === SURPLUS_USE_STATUS.NOT_APPLIED) return acc;
    return {
      requested: acc.requested + (Number(r.requestedAmount) || 0),
      spent: acc.spent + (Number(r.actuallySpent) || 0),
      shortfall: acc.shortfall + (Number(r.insufficientSurplusAmount) || 0),
    };
  }, { requested: 0, spent: 0, shortfall: 0 });
}
