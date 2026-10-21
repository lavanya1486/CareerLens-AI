import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard } from "../../api/types";

export function DemandChart({ skills }: { skills: Dashboard["mostRequestedSkills"] }) {
  const data = skills.map((s) => ({ skill: s.skill, Matched: s.matched, "Not matched": s.requested - s.matched }));
  return (
    <div className="w-full" style={{ height: Math.max(180, data.length * 34 + 50) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }} barCategoryGap={8}>
          <CartesianGrid stroke="#e5dcc8" strokeDasharray="3 4" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: "#6b7262", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="skill" width={110} tick={{ fill: "#23291f", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#f1f5ef" }} contentStyle={{ background: "#fffdf8", border: "1px solid #e5dcc8", borderRadius: 12, fontSize: 13 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Matched" stackId="a" fill="#67855f" radius={[4, 0, 0, 4]} />
          <Bar dataKey="Not matched" stackId="a" fill="#e0a88f" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
