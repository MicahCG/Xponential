"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FollowerDataPoint {
  date: string;
  followers: number;
}

export function FollowerChart({ data }: { data: FollowerDataPoint[] }) {
  const growth =
    data.length >= 2 ? data[data.length - 1].followers - data[0].followers : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm font-medium">Follower Growth</CardTitle>
        {data.length >= 2 && (
          <span
            className={
              growth >= 0
                ? "text-sm font-semibold text-green-500"
                : "text-sm font-semibold text-rose-500"
            }
          >
            {growth >= 0 ? "+" : ""}
            {growth.toLocaleString()} since tracking began
          </span>
        )}
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Follower snapshots are captured daily — check back tomorrow to see
            your growth chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={data}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(v) => [Number(v).toLocaleString(), "Followers"]}
              />
              <Line
                dataKey="followers"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
