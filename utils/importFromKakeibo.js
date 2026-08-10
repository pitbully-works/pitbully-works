// ============================================================================
// utils/importFromKakeibo.js
//
// 家計簿アプリ（かけいぼ）から渡されたデータを取り込む。
//
// 【なぜ専用の処理が要るか】
// 通常の「バックアップの読み込み」は、自分自身が書き出した完全なデータを
// 戻すためのもので、配列は丸ごと入れ替える。それで正しい。
//
// ところが家計簿から来るのは<b>一部だけ</b>。たとえば生命保険なら
// 名前・保険料・払う期間しか持っていない。これを丸ごと入れ替えると、
// こちらで入れた benefits（入院・手術・死亡などの保障）や customBenefits が
// 消えてしまう。民間年金の currentBalance なども同じ。
//
// そこで、家計簿から届いた項目<b>だけ</b>を上書きし、
// こちらにしかない項目はそのまま残す。
//
// 【届かなかった分類には触らない】
// 家計簿に登録が無いだけの分類は、そもそも送られてこない（送り手側で外している）。
// 万一 banks: [] のような空配列が届いても、「全部消せ」とは解釈しない。
// 明示的に消す機能は無いので、消す指示と受け取ってはいけない。
//
// 【どの行と どの行を対応させるか】
// id があればそれを最優先。無ければ名前で対応させるが、
// 同じ名前が複数あるときは<b>取り違えないように、対応させない</b>（新しい行として足す）。
//
// ここは純粋関数だけ。DOM も React も触らない。
// ============================================================================

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/** 家計簿から来たデータかどうか。通常のバックアップと見分けるための印。 */
export function isKakeiboPayload(parsed) {
  return !!(parsed && typeof parsed === "object" && parsed.source === "kakeibo");
}

// ----------------------------------------------------------------------------
// 金額の単位の見張り（受信ガード）
// ----------------------------------------------------------------------------
// 家計簿アプリは、内部では「最小通貨単位」で金額を持っている。
//   日本   … 1 = 1円          （倍率 1）
//   米英加豪 … 1 = 1セント/ペニー （倍率 100）
// こちらへ渡すときは主単位（ドル・円）へ戻したうえで、
//   amount_unit: "major"
//   minor_unit_scale: 1 or 100
// を必ず添えることになっている。
//
// もしこの取り決めが崩れて最小単位のまま届いたら、$12.34 が $1,234.00 になる。
// 逆向きなら 1/100 になる。どちらも黙って通ると、その場では気づけない。
//
// そこで、**"major" と明記されているときだけ取り込む**。
// 印が無い・別の値・知らない値なら、金額にはいっさい触れず取り込みを止める。
// こちらで倍率を推測して直す、ということは絶対にしない。
// 金額の値から単位を当てるのは不可能だから（1234 は $1,234.00 とも $12.34 とも読める）。
export const KAKEIBO_AMOUNT_UNIT = "major";

/**
 * 家計簿から来たデータの金額の単位を確かめる。
 * @returns {{ok: boolean, unit: string, reason: string}}
 *   ok     … true のときだけ取り込んでよい
 *   unit   … 実際に届いた値（画面に出して原因が分かるようにする）
 *   reason … "" / "missing"（印が無い） / "unknown"（別の値）
 */
export function checkKakeiboAmountUnit(payload) {
  const raw = isPlainObject(payload) ? payload.amount_unit : undefined;
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, unit: "", reason: "missing" };
  }
  if (raw === KAKEIBO_AMOUNT_UNIT) return { ok: true, unit: raw, reason: "" };
  return { ok: false, unit: typeof raw === "string" ? raw : String(raw), reason: "unknown" };
}

const EMPTY_INSURANCE_BENEFITS = Object.freeze({
  hospitalizationPerDay: 0,
  hospitalizationDaysLimit: 0,
  hospitalizationSurgery: 0,
  daySurgery: 0,
  radiationPerSession: 0,
  advancedMedical: 0,
  death: 0,
});

function normalizeInsurancePolicy(row) {
  if (!isPlainObject(row)) return null;
  return {
    ...row,
    benefits: {
      ...EMPTY_INSURANCE_BENEFITS,
      ...(isPlainObject(row.benefits) ? row.benefits : {}),
    },
    customBenefits: Array.isArray(row.customBenefits)
      ? row.customBenefits.filter(isPlainObject)
      : [],
  };
}

function normalizeImportedList(key, list) {
  if (!Array.isArray(list)) return list;
  if (key === "insurancePolicies") {
    return list.map(normalizeInsurancePolicy).filter(Boolean);
  }
  return list;
}

/**
 * 1件ぶんを重ねる。届いた項目だけを上書きし、こちらにしかない項目は残す。
 * 入れ子のオブジェクト（benefits など）も、丸ごと置き換えずに重ねる。
 */
function overlayItem(mine, incoming) {
  if (!isPlainObject(incoming)) return mine;
  if (!isPlainObject(mine)) return { ...incoming };
  const out = { ...mine };
  Object.keys(incoming).forEach((key) => {
    const v = incoming[key];
    if (v === undefined) return;                       // 届いていない項目は触らない
    if (isPlainObject(v) && isPlainObject(out[key])) out[key] = overlayItem(out[key], v);
    else out[key] = v;
  });
  return out;
}

/**
 * 対応する既存の行を探す。
 *  1. id が一致するもの（最優先）
 *  2. 名前が一致するものが「ちょうど1件」のとき（複数あれば取り違えるので使わない）
 * @returns {number} 見つかった位置。無ければ -1
 */
function findMatch(list, incoming, usedIndexes) {
  const free = (i) => !usedIndexes.has(i);
  if (incoming && incoming.id != null && incoming.id !== "") {
    const byId = list.findIndex((r, i) => free(i) && r && r.id === incoming.id);
    if (byId >= 0) return byId;
  }
  const name = incoming && typeof incoming.name === "string" ? incoming.name.trim() : "";
  if (!name) return -1;
  const hits = [];
  list.forEach((r, i) => {
    if (free(i) && r && typeof r.name === "string" && r.name.trim() === name) hits.push(i);
  });
  return hits.length === 1 ? hits[0] : -1;   // 同名が複数 → 取り違えないよう対応させない
}

/**
 * 配列を重ねる。丸ごと入れ替えない。
 *  ・対応する行が見つかれば、届いた項目だけ上書き
 *  ・見つからなければ、新しい行として足す
 *  ・届かなかった既存の行は、そのまま残す（消さない）
 */
export function mergeList(mine, incoming) {
  // 配列の各行は「オブジェクト」であることが前提。
  // null / 文字列 / 数値などを state に混ぜると、App 側の自動保存や集計で
  // row.balance のような参照をした瞬間に白画面になる可能性がある。
  // 入口で不正行を捨て、既存側に残っていた不正行もここで除去する。
  const current = Array.isArray(mine) ? mine.filter(isPlainObject) : [];
  const rows = Array.isArray(incoming) ? incoming.filter(isPlainObject) : [];
  if (rows.length === 0) return current;      // 空配列は「全部消せ」ではない
  const out = current.map((r) => ({ ...r }));
  const used = new Set();
  const added = [];
  rows.forEach((row) => {
    const at = findMatch(out, row, used);
    if (at >= 0) {
      used.add(at);
      out[at] = overlayItem(out[at], row);
    } else {
      added.push({ ...row });
    }
  });
  return out.concat(added);
}

/**
 * 家計簿から来た inputs を、いまの inputs へ重ねる。
 * 届かなかった分類には、いっさい手を触れない。
 *
 * @param {object} current いまの inputs
 * @param {object} payload 家計簿が書き出したもの（{ source, inputs, ... }）
 * @returns {{inputs: object, touched: string[], birthMismatch: object|null}}
 */
export function mergeKakeiboInputs(current, payload) {
  const base = isPlainObject(current) ? current : {};
  const incoming = isPlainObject(payload) && isPlainObject(payload.inputs) ? payload.inputs : {};
  const out = { ...base };
  const touched = [];

  Object.keys(incoming).forEach((key) => {
    const v = incoming[key];
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      if (v.length === 0) return;                       // 空配列は無視（消さない）
      // 既存側だけ先に補修する。家計簿から来た行を先に補完すると、
      // 「届いていない customBenefits」を []、「届いていない benefits」を 0 として
      // 既存の保障内容へ上書きしてしまうため、incoming はそのまま重ねる。
      // マージ後に最終結果を補修すれば、新規保険にも安全な既定値が入る。
      const merged = mergeList(normalizeImportedList(key, base[key]), v);
      out[key] = normalizeImportedList(key, merged);
      touched.push(key);
      return;
    }
    if (isPlainObject(v)) {
      if (Object.keys(v).length === 0) return;          // 空のかたまりも無視
      out[key] = overlayItem(base[key], v);
      touched.push(key);
      return;
    }
    out[key] = v;
    touched.push(key);
  });

  /* 生年月日は勝手に書き換えない。食い違っていたら知らせるだけにする。 */
  let birthMismatch = null;
  const fromKakeibo = payload && typeof payload.birth === "string" ? payload.birth : "";
  const mine = base && typeof base.birthDate === "string" ? base.birthDate : "";
  if (fromKakeibo && mine && fromKakeibo !== mine) {
    birthMismatch = { kakeibo: fromKakeibo, lifePlan: mine };
  }

  return { inputs: out, touched, birthMismatch };
}
