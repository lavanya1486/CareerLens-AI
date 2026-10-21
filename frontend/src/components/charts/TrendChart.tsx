import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard } from "../../api/types";
import { formatDate } from "../../lib/format";

export function TrendChart({ points }: { points: Dashboard["trend"]["points"] }) {
  const data = points.map((p, i) => ({ ...p, index: i + 1, label: formatDate(p.createdAt) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="#e5dcc8" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="index" tick={{ fill: "#6b7262", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#d3c7ad" }} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#6b7262", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#fffdf8", border: "1px solid #e5dcc8", borderRadius: 12, fontSize: 13 }}
            labelFormatter={(_, payload) => (payload?.[0]?.payload as { name?: string; label?: string } | undefined)?.name ?? ""}
            formatter={(value, _name, item) => [`${Number(value).toFixed(1)} · ${(item.payload as { label: string }).label}`, "Score"]}
          />
          <Line type="monotone" dataKey="score" stroke="#4f6b49" strokeWidth={2.5} dot={{ r: 4, fill: "#fffdf8", stroke: "#4f6b49", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#d4ae45" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
