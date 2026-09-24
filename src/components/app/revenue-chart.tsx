"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function RevenueChart({ data }: { data: { label: string; invoiced: number; received: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#f4f4f5" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#71717a" }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 12, fill: "#71717a" }} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip
            cursor={{ fill: "#f4f4f5" }}
            formatter={(value, name) => [full.format(Number(value)), name === "invoiced" ? "Invoiced" : "Received"]}
            contentStyle={{ borderRadius: 8, borderColor: "#e4e4e7", fontSize: 13 }}
          />
          <Legend formatter={(v: string) => (v === "invoiced" ? "Invoiced" : "Received (incl. TDS)")} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="invoiced" fill="#99f6e4" radius={[3, 3, 0, 0]} />
          <Bar dataKey="received" fill="#0f766e" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
