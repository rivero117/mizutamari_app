export function createTapFishOverlay(point, fishCount = 3) {
  const count = Math.min(Math.max(Number(fishCount) || 1, 1), 8);
  const x = Math.min(Math.max(Number(point.x) || 0.5, 0), 1);
  const y = Math.min(Math.max(Number(point.y) || 0.5, 0), 1);

  return Array.from({ length: count }, (_, index) => ({
    id: `fish-${index + 1}`,
    x: Math.min(Math.max(x + (index - (count - 1) / 2) * 0.08, 0.05), 0.95),
    y: Math.min(Math.max(y + (index % 2 === 0 ? -0.03 : 0.04), 0.05), 0.95),
    scale: 0.9 + index * 0.04,
    rotation: index % 2 === 0 ? -8 : 8
  }));
}
