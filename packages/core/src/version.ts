/** "v1.2.3" 또는 "1.2.3" 형식을 비교한다. a가 크면 양수. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, "").split("-")[0]!.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
