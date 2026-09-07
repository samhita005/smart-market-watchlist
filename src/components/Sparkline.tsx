interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

export function Sparkline({ data, width = 80, height = 24, positive }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const isPositive = positive ?? data[data.length - 1] >= data[0];
  const color = isPositive ? "#10b981" : "#ef4444";

  // Area path
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="inline-block">
      <polygon points={areaPoints} fill={color} opacity={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
