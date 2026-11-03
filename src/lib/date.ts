/** 日付は端末のタイムゾーン（日本なら JST）で "YYYY-MM-DD" 文字列として扱う */

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** 月曜始まりの週の初日 */
export function startOfWeek(s: string): string {
  const d = parseDate(s);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return toDateStr(d);
}

export function startOfMonth(s: string): string {
  const d = parseDate(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(s: string): string {
  const d = parseDate(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/** start〜end（両端含む）の日付一覧 */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let s = start; s <= end; s = addDays(s, 1)) out.push(s);
  return out;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function formatJP(s: string, withWeekday = true): string {
  const d = parseDate(s);
  const base = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withWeekday ? `${base}(${WEEKDAYS[d.getDay()]})` : base;
}

export function formatShort(s: string): string {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 今の時刻から食事区分を推測 */
export function guessMealType(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  if (h >= 4 && h < 10) return "breakfast";
  if (h >= 10 && h < 15) return "lunch";
  if (h >= 17 && h < 23) return "dinner";
  return "snack";
}
