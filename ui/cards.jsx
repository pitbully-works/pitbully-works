// ============================================================================
// ui/cards.jsx
// 数値サマリーカード（StatCard）。国にも制度にも依存しない、値を表示するだけの部品。
// App.jsx と各国パネルの双方から使うため ui/ に置く（中身は App.jsx にあったものと完全に同一）。
// ============================================================================

function StatCard({ label, value, sub, tone }) {
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export { StatCard };
