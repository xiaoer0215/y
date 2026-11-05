import { t, useLocale, getLocale } from "../lib/i18n";
import { useState, useRef, useMemo } from "react";
import {
  Activity,
  Clock,
  BarChart2,
  TrendingUp,
  Layers,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { ChannelTrendPoint } from "../types";

export type TrendChartMode = "ribbon" | "area" | "bar";

const hasTrendData = (point: ChannelTrendPoint) =>
  point.total_requests > 0 && !point.is_synthetic;
const hasDisplayData = (point: ChannelTrendPoint) => point.total_requests > 0;

export interface HealthTrendVisualizerProps {
  trendPoints?: ChannelTrendPoint[];
  groupName: string;
  successRate: number;
  avgLatency: number;
  totalRequests?: number;
  failedRequests?: number;
  hours?: number;
  accentColor?: "blue" | "purple" | "emerald" | "orange";
  compact?: boolean;
  className?: string;
  defaultChartType?: TrendChartMode;
}

export function HealthTrendVisualizer({
  trendPoints: suppliedTrendPoints = [],
  groupName,
  successRate,
  avgLatency,
  totalRequests,
  hours = 1,
  accentColor = "blue",
  compact = false,
  className,
  defaultChartType,
}: HealthTrendVisualizerProps) {
  useLocale();
  const trendPoints = useMemo(() => {
    if (suppliedTrendPoints.length > 0) return suppliedTrendPoints;

    const count = compact ? 24 : 30;
    const end = Math.floor(Date.now() / 1000);
    const step = Math.max(60, Math.floor((hours * 3600) / count));
    return Array.from({ length: count }, (_, index) => ({
      timestamp: end - step * (count - index - 1),
      total_requests: 0,
      failed_requests: 0,
      success_rate: 0,
      avg_response_time: 0,
      has_data: false,
    }));
  }, [suppliedTrendPoints, compact, hours]);
  const displayTrendPoints = useMemo(() => {
    if (!trendPoints.some(hasTrendData)) return trendPoints;
    return trendPoints.map((point) =>
      hasTrendData(point)
        ? point
        : {
            ...point,
            total_requests: 1,
            failed_requests: 0,
            success_rate: 100,
            avg_response_time: 0,
            has_data: true,
            is_synthetic: true,
          },
    );
  }, [trendPoints]);
  const accentHex =
    accentColor === "purple"
      ? "#a855f7"
      : accentColor === "emerald"
        ? "#10b981"
        : accentColor === "orange"
          ? "#f97316"
          : "#3b82f6";

  // 模式偏好：分段健康条 (ribbon, 默认官方风) | 平滑波形曲线 (area) | 宽幅遥测柱 (bar)
  const [chartMode, setChartMode] = useState<TrendChartMode>(() => {
    if (defaultChartType) return defaultChartType;
    try {
      const saved = localStorage.getItem("ai_helper_trend_chart_mode");
      if (saved === "ribbon" || saved === "area" || saved === "bar") {
        return saved as TrendChartMode;
      }
    } catch {}
    return "ribbon"; // 默认首选连续分段健康条 (GitHub Status / Cloudflare 风格，饱满连续无空隙)
  });

  const handleSwitchMode = (mode: TrendChartMode) => {
    setChartMode(mode);
    try {
      localStorage.setItem("ai_helper_trend_chart_mode", mode);
    } catch {}
  };

  const [activeTooltip, setActiveTooltip] = useState<{
    point: ChannelTrendPoint;
    index: number;
    xPercent: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // 格式化时间戳 (时:分)
  const formatTime = (ts: number) => {
    if (!ts) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString(getLocale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 桶宽随统计窗口变化。
  const formatTimeRange = (ts: number) => {
    if (!ts) return "";
    const start = formatTime(ts);
    const end = formatTime(
      ts + (hours * 3600) / Math.max(trendPoints.length, 1),
    );
    return `${start} ~ ${end}`;
  };

  // 格式化耗时
  const formatLatency = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "-";
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    return `${seconds.toFixed(2)}s`;
  };

  // 生成专属于当前实例的安全英数 SVG ID (彻底根除由于中文/空格导致的纯黑渲染 Bug)
  const safeId = useMemo(() => {
    const clean = groupName.replace(/[^a-zA-Z0-9]/g, "");
    const rand = Math.random().toString(36).substring(2, 8);
    return `trend_${clean || "grp"}_${rand}`;
  }, [groupName, getLocale()]);

  const gradientId = `grad_${safeId}`;
  const glowId = `glow_${safeId}`;

  // 统计总失败数
  const totalFailedInTrend = useMemo(() => {
    return trendPoints.reduce(
      (acc, p) => acc + (hasTrendData(p) ? p.failed_requests || 0 : 0),
      0,
    );
  }, [trendPoints, getLocale()]);

  const totalRequestsInTrend = useMemo(() => {
    return trendPoints.reduce(
      (acc, p) => acc + (hasTrendData(p) ? p.total_requests || 0 : 0),
      0,
    );
  }, [trendPoints, getLocale()]);

  // 生成 SVG 平滑贝塞尔曲线路径 (超轻通透渐变波形)
  const curvePaths = useMemo(() => {
    if (!trendPoints || trendPoints.length === 0) return null;

    const width = 640;
    const height = compact ? 62 : 74;
    const padX = 14;
    const padTop = 10;
    const padBottom = 16;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;
    const n = trendPoints.length;

    const coords = displayTrendPoints.map((pt, i) => {
      const x = n === 1 ? width / 2 : padX + (i / (n - 1)) * plotW;
      const rate = hasDisplayData(pt) ? pt.success_rate : 0;
      // 成功率映射到 y 轴 (100% 在 padTop, 0% 在 padTop + plotH)
      const y =
        padTop + plotH - (Math.max(0, Math.min(100, rate)) / 100) * plotH;
      return { x, y, pt, i };
    });

    // 绘制光滑三次方贝塞尔曲线 (Catmull-Rom 贝塞尔平滑)
    const baselineY = height - padBottom;

    const segments: Array<typeof coords> = [];
    let currentSegment: typeof coords = [];
    for (const coord of coords) {
      if (hasDisplayData(coord.pt)) {
        currentSegment.push(coord);
      } else if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
    if (currentSegment.length > 0) segments.push(currentSegment);

    const paths = segments.map((segment) => {
      let lineD = `M ${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)}`;
      for (let i = 0; i < segment.length - 1; i++) {
        const p0 = segment[Math.max(0, i - 1)];
        const p1 = segment[i];
        const p2 = segment[i + 1];
        const p3 = segment[Math.min(segment.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        lineD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }

      return {
        lineD,
        areaD:
          segment.length > 1
            ? `${lineD} L ${segment[segment.length - 1].x.toFixed(1)} ${baselineY} L ${segment[0].x.toFixed(1)} ${baselineY} Z`
            : null,
      };
    });

    return { paths, coords, width, height, baselineY, padTop };
  }, [displayTrendPoints, compact, getLocale()]);

  const firstPt = trendPoints[0];
  const lastPt = trendPoints[trendPoints.length - 1];
  const bucketMinutes = Math.max(
    1,
    Math.round((hours * 60) / Math.max(trendPoints.length, 1)),
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-black/30 p-3 space-y-2.5 transition-all select-none",
        className,
      )}
    >
      {/* 走势图顶部信息与三模态切换药丸 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-gray-200">
            <Activity size={13} className="text-emerald-500 animate-pulse" />
            <span>{t("message.b95241ec140e", { v0: hours })}</span>
          </div>

          <span className="text-[10px] font-mono text-slate-400 dark:text-gray-500 bg-white/70 dark:bg-white/5 px-1.5 py-0.2 rounded border border-slate-200/50 dark:border-white/5">
            {t("message.bb58c4aa3f0c", {
              v0: trendPoints.length,
              v1: bucketMinutes,
            })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* 时间跨度 */}
          <span className="text-[10px] font-mono text-slate-400 dark:text-gray-500 hidden sm:inline-block">
            {formatTime(firstPt.timestamp)} → {formatTime(lastPt.timestamp)}
          </span>

          {/* 模式切换器：分段条 (默认) | 丝滑曲线 | 遥测柱 */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/10 border border-slate-200/80 dark:border-white/10 text-[10px]">
            <button
              type="button"
              onClick={() => handleSwitchMode("ribbon")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                chartMode === "ribbon"
                  ? "bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-800 dark:text-gray-400",
              )}
              title={t("ui.0718953f7b2f")}
            >
              <Layers size={10} />
              <span>{t("ui.b3e23d4ea270")}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode("area")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                chartMode === "area"
                  ? "bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-800 dark:text-gray-400",
              )}
              title={t("ui.a3122a625cc5")}
            >
              <TrendingUp size={10} />
              <span>{t("ui.c66f9c681516")}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode("bar")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                chartMode === "bar"
                  ? "bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-800 dark:text-gray-400",
              )}
              title={t("ui.10e801f164b1")}
            >
              <BarChart2 size={10} />
              <span>{t("ui.b63f3d7b6562")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 图表主呈现区 ── */}
      <div className="relative">
        {chartMode === "ribbon" ? (
          /* ── 模式 1：连续分段健康条 (GitHub Status / Cloudflare 官方经典风，彻底解决空隙与稀疏问题) ── */
          <div className="py-1">
            <div
              className={cn(
                "flex items-stretch gap-[3px] w-full",
                compact ? "h-7" : "h-9",
              )}
            >
              {displayTrendPoints.map((pt, idx) => {
                const hasData = hasDisplayData(pt);
                const rate = pt.success_rate;
                const isHovered = activeTooltip?.index === idx;

                let segmentColor =
                  "bg-slate-200/90 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700";
                let glowShadow = "";
                if (hasData) {
                  if (rate >= 95) {
                    segmentColor =
                      "bg-emerald-500 hover:bg-emerald-400 dark:bg-emerald-500 dark:hover:bg-emerald-400";
                    glowShadow = "shadow-[0_0_10px_rgba(16,185,129,0.45)]";
                  } else if (rate >= 80) {
                    segmentColor =
                      "bg-teal-500 hover:bg-teal-400 dark:bg-teal-500 dark:hover:bg-teal-400";
                    glowShadow = "shadow-[0_0_10px_rgba(20,184,166,0.45)]";
                  } else if (rate >= 50) {
                    segmentColor =
                      "bg-amber-500 hover:bg-amber-400 dark:bg-amber-500 dark:hover:bg-amber-400";
                    glowShadow = "shadow-[0_0_10px_rgba(245,158,11,0.45)]";
                  } else {
                    segmentColor =
                      "bg-rose-500 hover:bg-rose-400 dark:bg-rose-500 dark:hover:bg-rose-400";
                    glowShadow = "shadow-[0_0_10px_rgba(239,68,68,0.45)]";
                  }
                }

                const isFirst = idx === 0;
                const isLast = idx === displayTrendPoints.length - 1;

                return (
                  <div
                    key={pt.timestamp || idx}
                    className={cn(
                      "relative flex-1 cursor-pointer transition-all duration-150 select-none overflow-hidden group",
                      isFirst && "rounded-l-md",
                      isLast && "rounded-r-md",
                      !isFirst && !isLast && "rounded-[2px]",
                      segmentColor,
                      isHovered &&
                        `scale-y-115 -translate-y-0.5 z-20 ${glowShadow} brightness-110`,
                    )}
                    onMouseEnter={(e) => {
                      const rect =
                        containerRef.current?.getBoundingClientRect();
                      const elemRect = e.currentTarget.getBoundingClientRect();
                      const xPct = rect
                        ? ((elemRect.left + elemRect.width / 2 - rect.left) /
                            rect.width) *
                          100
                        : (idx / (displayTrendPoints.length - 1 || 1)) * 100;
                      setActiveTooltip({
                        point: pt,
                        index: idx,
                        xPercent: xPct,
                      });
                    }}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    {/* 顶部微高光细线，营造精致玻璃切片质感 */}
                    <div className="absolute inset-x-0 top-0 h-[1.5px] bg-white/25 pointer-events-none" />

                    {/* 如果该时段有失败，底部微红色警示条 */}
                    {hasData && pt.failed_requests > 0 && rate >= 80 && (
                      <div className="absolute inset-x-0 bottom-0 h-[2.5px] bg-rose-400/90 pointer-events-none" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : chartMode === "bar" ? (
          /* ── 模式 2：宽幅遥测立柱 (Grafana / Cloudflare Analytics 自适应饱满柱状图) ── */
          <div className="py-1">
            <div
              className={cn(
                "flex items-end gap-1.5 w-full px-0.5",
                compact ? "h-11" : "h-14",
              )}
            >
              {displayTrendPoints.map((pt, idx) => {
                const hasData = hasDisplayData(pt);
                const rate = pt.success_rate;
                const isHovered = activeTooltip?.index === idx;

                // 槽道填充高度 (根据成功率计算，最低保持 20% 以便美感与触控)
                const heightPct = Math.max(22, Math.round((rate / 100) * 100));

                let barGradient =
                  "from-slate-300 to-slate-200 dark:from-white/10 dark:to-white/5";
                if (hasData) {
                  if (rate >= 90)
                    barGradient = "from-emerald-600 to-emerald-400";
                  else if (rate >= 70)
                    barGradient = "from-teal-600 to-teal-400";
                  else if (rate >= 50)
                    barGradient = "from-amber-600 to-amber-400";
                  else barGradient = "from-rose-600 to-rose-400";
                }

                return (
                  <div
                    key={pt.timestamp || idx}
                    className="relative flex-1 h-full flex flex-col justify-end cursor-pointer group"
                    onMouseEnter={(e) => {
                      const rect =
                        containerRef.current?.getBoundingClientRect();
                      const elemRect = e.currentTarget.getBoundingClientRect();
                      const xPct = rect
                        ? ((elemRect.left + elemRect.width / 2 - rect.left) /
                            rect.width) *
                          100
                        : (idx / (displayTrendPoints.length - 1 || 1)) * 100;
                      setActiveTooltip({
                        point: pt,
                        index: idx,
                        xPercent: xPct,
                      });
                    }}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    {/* 槽道背景 (Groove Track) */}
                    <div className="w-full h-full rounded-md bg-slate-100/90 dark:bg-white/[0.04] p-0.5 flex flex-col justify-end items-stretch overflow-hidden border border-slate-200/50 dark:border-white/5 group-hover:border-slate-300 dark:group-hover:border-white/15 transition-all">
                      {/* 柱体内填充 */}
                      {hasData && (
                        <div
                          className={cn(
                            "w-full rounded-[3px] bg-gradient-to-t transition-all duration-300 relative",
                            barGradient,
                            isHovered &&
                              "brightness-115 shadow-sm scale-y-[1.02]",
                          )}
                          style={{ height: `${heightPct}%` }}
                        >
                          {/* 顶部微高光 */}
                          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-white/40 rounded-t-[3px]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── 模式 3：通透丝滑折线 (Silk Sparkline，彻底杜绝黑底，超轻通透) ── */
          <div className="relative py-1">
            {curvePaths && (
              <div className="relative w-full overflow-hidden">
                <svg
                  viewBox={`0 0 ${curvePaths.width} ${curvePaths.height}`}
                  className={cn(
                    "w-full overflow-visible",
                    compact ? "h-14" : "h-16",
                  )}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={accentHex}
                        stopOpacity="0.25"
                      />
                      <stop
                        offset="60%"
                        stopColor={accentHex}
                        stopOpacity="0.05"
                      />
                      <stop
                        offset="100%"
                        stopColor={accentHex}
                        stopOpacity="0.0"
                      />
                    </linearGradient>
                    <filter
                      id={glowId}
                      x="-20%"
                      y="-20%"
                      width="140%"
                      height="140%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="1"
                        stdDeviation="1.5"
                        floodColor={accentHex}
                        floodOpacity="0.35"
                      />
                    </filter>
                  </defs>

                  {/* 参考虚线 (顶部基准线与底部基准线) */}
                  <line
                    x1="14"
                    y1={curvePaths.padTop}
                    x2={curvePaths.width - 14}
                    y2={curvePaths.padTop}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-white/5"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                  />
                  <line
                    x1="14"
                    y1={curvePaths.baselineY}
                    x2={curvePaths.width - 14}
                    y2={curvePaths.baselineY}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-white/5"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                  />

                  {/* 丝滑轻盈面积填充 (安全透明渐变，绝不出现纯黑) */}
                  {curvePaths.paths.map((path, index) => (
                    <g key={index}>
                      {path.areaD && (
                        <path d={path.areaD} fill={`url(#${gradientId})`} />
                      )}
                      <path
                        d={path.lineD}
                        fill="none"
                        stroke={accentHex}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter={`url(#${glowId})`}
                      />
                    </g>
                  ))}

                  {/* 丝滑主折线 */}
                  {/* 数据点与悬停触控区 */}
                  {curvePaths.coords.map(({ x, y, pt, i }) => {
                    const isHovered = activeTooltip?.index === i;
                    const hasData = hasDisplayData(pt);
                    return (
                      <g
                        key={pt.timestamp || i}
                        className="cursor-pointer"
                        onMouseEnter={(e) => {
                          const rect =
                            containerRef.current?.getBoundingClientRect();
                          const elemRect =
                            e.currentTarget.getBoundingClientRect();
                          const xPct = rect
                            ? ((elemRect.left +
                                elemRect.width / 2 -
                                rect.left) /
                                rect.width) *
                              100
                            : (i / (trendPoints.length - 1 || 1)) * 100;
                          setActiveTooltip({
                            point: pt,
                            index: i,
                            xPercent: xPct,
                          });
                        }}
                        onMouseLeave={() => setActiveTooltip(null)}
                      >
                        <circle cx={x} cy={y} r="8" fill="transparent" />
                        {hasData && (
                          <circle
                            cx={x}
                            cy={y}
                            r={isHovered ? 4 : 2.5}
                            className={cn(
                              "transition-all duration-150",
                              isHovered
                                ? "fill-white stroke-emerald-500 stroke-2"
                                : "fill-emerald-500",
                            )}
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        )}

        {/* ── 动态跟随悬停 Tooltip (精致玻璃拟态卡片) ── */}
        {activeTooltip && (
          <div
            className="absolute -top-2 pointer-events-none z-30 px-3 py-2 rounded-xl bg-slate-900/95 dark:bg-zinc-900/95 text-white text-[11px] shadow-2xl border border-white/10 whitespace-nowrap transition-all duration-75 flex flex-col gap-1 backdrop-blur-md"
            style={{
              left: `${Math.max(12, Math.min(88, activeTooltip.xPercent))}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/10">
              <div className="flex items-center gap-1.5 font-sans font-medium text-slate-200">
                <Clock size={11} className="text-slate-400" />
                <span className="font-mono text-[10px]">
                  {formatTimeRange(activeTooltip.point.timestamp)}
                </span>
              </div>
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded text-[10px] font-bold font-mono",
                  hasDisplayData(activeTooltip.point)
                    ? activeTooltip.point.success_rate >= 90
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : activeTooltip.point.success_rate >= 70
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-white/10 text-slate-300 border border-white/10",
                )}
              >
                {hasDisplayData(activeTooltip.point)
                  ? `${activeTooltip.point.success_rate.toFixed(1)}%`
                  : t("ui.a36e57bab446")}
              </span>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-slate-300 pt-0.5 font-mono">
              {activeTooltip.point.avg_response_time > 0 && (
                <span className="text-slate-300">
                  {t("ui.0dcffe12764c")}
                  <strong className="text-white">
                    {formatLatency(activeTooltip.point.avg_response_time)}
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部时间刻度与健康度结论标尺 */}
      <div className="flex items-center justify-between pt-1 px-1 text-[10px] font-mono text-slate-400 dark:text-gray-500">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-white/20" />
          <span>
            {t("message.17cc336de679", {
              v0: hours,
              v1: formatTime(firstPt.timestamp),
            })}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-medium font-sans">
          {totalFailedInTrend > 0 ? (
            <>
              <AlertTriangle size={11} className="text-amber-500" />
              <span className="text-amber-600 dark:text-amber-400">
                {t("ui.38ea54b47c8f")}
              </span>
            </>
          ) : totalRequestsInTrend > 0 ? (
            <>
              <CheckCircle2 size={11} className="text-emerald-500" />
              <span className="text-slate-600 dark:text-gray-300">
                {t("message.279f0ade601b", { v0: trendPoints.length })}
              </span>
            </>
          ) : (
            <span className="text-slate-400 dark:text-gray-500">
              {t("ui.a36e57bab446")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span>
            {t("message.4b299484880e", { v0: formatTime(lastPt.timestamp) })}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* 非 compact 模式下的扩展指标信息 */}
      {!compact && totalRequests !== undefined && (
        <div className="pt-1.5 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{t("ui.e77037cc2448")}</span>
              <strong className="text-slate-800 dark:text-gray-200 font-mono font-semibold">
                {totalRequests > 0 ? `${successRate.toFixed(1)}%` : "-"}
              </strong>
            </span>

            <span className="flex items-center gap-1">
              <Clock size={10} className="text-slate-400" />
              <span>{t("ui.b7e99241c858")}</span>
              <strong className="text-slate-800 dark:text-gray-200 font-mono font-semibold">
                {formatLatency(avgLatency)}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default HealthTrendVisualizer;
