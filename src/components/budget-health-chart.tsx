"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BudgetCategory } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

export function BudgetHealthChart({ data }: { data: BudgetCategory[] }) {
  return (
    <div className="h-80 w-full" aria-label="Budget health chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dedfd5" vertical={false} />
          <XAxis dataKey="category" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `£${Number(value)}`}
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{
              borderColor: "#dedfd5",
              borderRadius: "8px",
              boxShadow: "0 12px 30px rgba(23, 33, 31, 0.12)",
            }}
          />
          <Legend />
          <Bar dataKey="budget" name="Budget" fill="#46684f" radius={[6, 6, 0, 0]} />
          <Bar dataKey="spent" name="Spent" fill="#1f7a73" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
