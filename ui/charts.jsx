// ============================================================================
// ui/charts.jsx
// 銘柄別内訳の共通UI部品（国に依存しない部品）。
// App.jsx から PIE_COLORS / AllocationCharts / AllocationBreakdown を
// そのまま切り出したもので、色・グラフ設定・JSXは一切変更していない。
// ============================================================================

import { useContext } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from "recharts";
import { LocaleContext } from "./locale.js";
import { MoneyInput } from "./inputs.jsx";

const PIE_COLORS = ["#4FA8D8", "#D9A54F", "#8FBF7F", "#B08FD6", "#C2694F", "#7BC9E0", "#E6B0A6", "#6FA88A"];

// 銘柄別の内訳（金額を入れると割合を自動計算し、円グラフで表示）
// 円グラフ＋棒グラフ（同じitems/合計から生成するので常に連動する）。編集UIを持たない読み取り専用版。
function AllocationCharts({ items, height = 180 }) {
  const { money, t } = useContext(LocaleContext);
  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  if (total <= 0) return null;
  const renderPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name, value }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#B7C2C7" fontSize={7.5} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
        {`${name} ${money(value)}（${(percent * 100).toFixed(0)}%）`}
      </text>
    );
  };
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={items} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={65}
            label={renderPieLabel}
            labelLine={false}
          >
            {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => money(v)} contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={Math.max(90, items.length * 32)}>
        <BarChart
          data={items.map((it) => ({ name: it.name, pct: (it.amount / total) * 100, amount: it.amount }))}
          layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
        >
          <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} stroke="#7C8A90" fontSize={10} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={10} width={90} />
          <Tooltip
            formatter={(v, n, p) => (n === "pct" ? [`${v.toFixed(1)}% (${money(p.payload.amount)})`, t("colPercent")] : [money(v), n])}
            contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }}
          />
          <Bar dataKey="pct" radius={[0, 2, 2, 0]}>
            {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            <LabelList
              dataKey="amount"
              position="right"
              formatter={(v) => money(v)}
              style={{ fill: "#E7ECEE", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function AllocationBreakdown({ items, newItem, onNewItemChange, onAdd, onRemove, onUpdate }) {
  const { t } = useContext(LocaleContext);
  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  return (
    <div>
      {items.length > 0 && (
        <table className="watchlist" style={{ marginBottom: 8 }}>
          <thead><tr><th>{t("colName")}</th><th>{t("colAmount")}</th><th>{t("colPercent")}</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="inline-num" value={it.name}
                    onChange={(e) => onUpdate(i, "name", e.target.value)}
                  />
                </td>
                <td style={{ width: 96 }}>
                  <MoneyInput
                    className="inline-num" value={it.amount}
                    onChange={(v) => onUpdate(i, "amount", v === "" ? 0 : v)}
                  />
                </td>
                <td className="mono" style={{ width: 52 }}>{total > 0 ? `${((it.amount / total) * 100).toFixed(1)}%` : "—"}</td>
                <td style={{ width: 24 }}>
                  <button className="del-btn" onClick={() => onRemove(i)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="add-row" style={{ marginBottom: total > 0 ? 8 : 0 }}>
        <input placeholder={t("holdingNamePlaceholder")} value={newItem.name} onChange={(e) => onNewItemChange({ ...newItem, name: e.target.value })} />
        <MoneyInput placeholder={t("amountPlaceholderMan")} value={newItem.amount} onChange={(v) => onNewItemChange({ ...newItem, amount: v })} />
        <button className="add-btn" onClick={onAdd}><Plus size={15} /></button>
      </div>
      <AllocationCharts items={items} />
    </div>
  );
}


export { PIE_COLORS, AllocationCharts, AllocationBreakdown };
