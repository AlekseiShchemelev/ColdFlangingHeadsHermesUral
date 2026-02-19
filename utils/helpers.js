function generateColors(count) {
  const palette = [
    "#3b82f6",
    "#ef4444",
    "#eab308",
    "#22c55e",
    "#a855f7",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6b7280",
    "#8b5cf6",
    "#0ea5e9",
    "#84cc16",
    "#f43f5e",
    "#64748b",
    "#d946ef",
  ];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}
