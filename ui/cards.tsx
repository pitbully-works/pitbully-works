// ============================================================================
// ui/cards.jsx
// 数値サマリーカード（StatCard）。国にも制度にも依存しない、値を表示するだけの部品。
// App.jsx と各国パネルの双方から使うため ui/ に置く（中身は App.jsx にあったものと完全に同一）。
// ============================================================================

import { useState } from "react";
import { GuideButton } from "./guides.jsx";

// 数値サマリーカード（StatCard）。国にも制度にも依存しない、値を表示するだけの部品。
// hint（任意）を渡すと、ラベル横に「?」が出て、押すと一言ヘルプを表示する（既存呼び出しは
// hint なし＝従来と完全に同じ挙動）。
function StatCard({ label, value, sub, tone, hint }) {
  const [showHint, setShowHint] = useState(false);
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-label">
        {label}
        {hint ? <GuideButton open={showHint} onToggle={() => setShowHint((v) => !v)} /> : null}
      </div>
      <div className="stat-value mono">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
      {hint && showHint ? <div className="stat-sub" style={{ marginTop: 4, opacity: 0.85 }}>{hint}</div> : null}
    </div>
  );
}

export { StatCard };
