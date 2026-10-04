import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatMoney } from '@/lib/utils';

type Point = { month: string; totalCents: number };

const PLOT_HEIGHT = 200;
const AXIS_LEFT = 52;
const AXIS_BOTTOM = 28;
const TOP_PAD = 22; // room for the cap label
const MAX_BAR = 24;

const monthDate = (key: string) => new Date(`${key}-01T00:00:00Z`);
const monthShort = (key: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(monthDate(key));
const monthLong = (key: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    monthDate(key),
  );

/** Axis scale with a clean step (1/2/2.5/5 × 10ⁿ) so every tick is a round number. */
function niceScale(value: number, targetTicks = 4) {
  if (value <= 0) return { max: 100_000, step: 25_000 }; // $0–$1,000 placeholder axis
  const raw = value / targetTicks;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * exp >= raw)! * exp;
  return { max: Math.ceil(value / step) * step, step };
}

function compactMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

/** Column with a 4px rounded data-end and a square base on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function RevenueChart({ data, currency }: { data: Point[]; currency: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0); // measured; nothing is drawn until we know it
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showTable]);

  const total = data.reduce((s, d) => s + d.totalCents, 0);
  const { max, step } = niceScale(Math.max(...data.map((d) => d.totalCents)));
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const plotW = Math.max(0, width - AXIS_LEFT);
  const band = plotW / data.length;
  const barW = Math.min(MAX_BAR, band * 0.6);
  const y = (v: number) => TOP_PAD + PLOT_HEIGHT - (v / max) * PLOT_HEIGHT;
  const labelEvery = band < 34 ? 2 : 1;
  const last = data.length - 1;
  const activePoint = active !== null ? data[active] : null;

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Revenue</CardTitle>
          <CardDescription className="mt-1">Collected per month · last 12 months</CardDescription>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {formatMoney(total, currency)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
        >
          {showTable ? 'Chart' : 'Table'}
        </Button>
      </CardHeader>
      <CardContent>
        {showTable ? (
          <table className="w-full text-sm">
            <caption className="sr-only">Revenue collected per month</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Month</th>
                <th className="py-2 text-right font-medium">Collected</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.month} className="border-b last:border-0">
                  <td className="py-2">{monthLong(d.month)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(d.totalCents, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div
            ref={wrapRef}
            className="relative"
            style={{ minHeight: TOP_PAD + PLOT_HEIGHT + AXIS_BOTTOM }}
            onMouseLeave={() => setActive(null)}
          >
            {width > 0 && (
              <svg
                width={width}
                height={TOP_PAD + PLOT_HEIGHT + AXIS_BOTTOM}
                role="img"
                aria-label={`Revenue per month for the last 12 months, ${formatMoney(total, currency)} in total`}
                className="block overflow-visible"
              >
                {ticks.map((t) => (
                  <g key={t}>
                    <line
                      x1={AXIS_LEFT}
                      x2={width}
                      y1={y(t)}
                      y2={y(t)}
                      className="stroke-border"
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                    <text
                      x={AXIS_LEFT - 10}
                      y={y(t)}
                      dy="0.32em"
                      textAnchor="end"
                      className="fill-muted-foreground text-[11px] tabular-nums"
                    >
                      {compactMoney(t, currency)}
                    </text>
                  </g>
                ))}

                {data.map((d, i) => {
                  const x = AXIS_LEFT + i * band;
                  const h = (d.totalCents / max) * PLOT_HEIGHT;
                  const dim = active !== null && active !== i;
                  return (
                    <g key={d.month}>
                      {h > 0 && (
                        <path
                          d={barPath(x + (band - barW) / 2, y(d.totalCents), barW, h)}
                          className={cn('fill-primary transition-opacity', dim && 'opacity-40')}
                        />
                      )}
                      {i === last && d.totalCents > 0 && active === null && (
                        <text
                          x={x + band / 2}
                          y={y(d.totalCents) - 7}
                          textAnchor="middle"
                          className="fill-foreground text-[11px] font-medium"
                        >
                          {compactMoney(d.totalCents, currency)}
                        </text>
                      )}
                      {(last - i) % labelEvery === 0 && (
                        <text
                          x={x + band / 2}
                          y={TOP_PAD + PLOT_HEIGHT + 18}
                          textAnchor="middle"
                          className={cn(
                            'text-[11px]',
                            i === last ? 'fill-foreground font-medium' : 'fill-muted-foreground',
                          )}
                        >
                          {monthShort(d.month)}
                        </text>
                      )}
                      {/* Hit target: the whole column band, larger than the bar itself. */}
                      <rect
                        x={x}
                        y={TOP_PAD}
                        width={band}
                        height={PLOT_HEIGHT}
                        fill="transparent"
                        tabIndex={0}
                        role="button"
                        aria-label={`${monthLong(d.month)}: ${formatMoney(d.totalCents, currency)}`}
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive(null)}
                        className="cursor-default outline-none"
                      />
                    </g>
                  );
                })}
              </svg>
            )}

            {activePoint && active !== null && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-card px-3 py-2 text-sm shadow-lg"
                style={{
                  left: Math.min(Math.max(AXIS_LEFT + active * band + band / 2, 70), width - 70),
                  top: Math.max(y(activePoint.totalCents) - 8, 8),
                }}
              >
                <p className="text-xs text-muted-foreground">{monthLong(activePoint.month)}</p>
                <p className="font-semibold">{formatMoney(activePoint.totalCents, currency)}</p>
              </div>
            )}

            {total === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pb-6">
                <p className="rounded-md bg-card/90 px-3 py-1.5 text-sm text-muted-foreground">
                  Revenue shows up here as invoices get paid.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TopClients({
  clients,
  currency,
}: {
  clients: { id: string; name: string; totalCents: number }[];
  currency: string;
}) {
  const max = Math.max(1, ...clients.map((c) => c.totalCents));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top clients</CardTitle>
        <CardDescription className="mt-1">By revenue collected · last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ol className="space-y-4">
            {clients.map((c, i) => (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}</span>
                    {c.name}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(c.totalCents, currency)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (c.totalCents / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
