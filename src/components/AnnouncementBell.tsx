import { t, useLocale } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Megaphone } from "lucide-react";
import { getSiteStatus, getSiteNotice } from "../lib/api";
import type { Announcement, SiteStatus } from "../types";
import { buttonClass, DetailDialog, Pagination } from "./AccountDataUI";

type Notice = Announcement & {
  source: "announcement" | "push" | "notice";
  routes?: string[];
  endAt?: string;
};
const storageKey = "uocode.announcements.v2";
function revision(item: Notice) {
  return JSON.stringify([
    item.source,
    item.id,
    item.content,
    item.extra,
    item.publishDate,
    item.endAt,
    item.routes,
  ]);
}
function loadState(): { read: string[]; archive: Notice[] } {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return {
      read: Array.isArray(data.read)
        ? data.read.filter((x: unknown) => typeof x === "string")
        : [],
      archive: Array.isArray(data.archive)
        ? data.archive.filter((x: Notice) => x && typeof x.content === "string")
        : [],
    };
  } catch {
    return { read: [], archive: [] };
  }
}
function notices(status: SiteStatus, text: string): Notice[] {
  const list: Notice[] =
    status.announcements_enabled === false
      ? []
      : (status.announcements ?? []).map((a) => ({
          ...a,
          source: "announcement",
        }));
  if (status.top_notice_enabled)
    for (const [i, a] of (status.top_notice_items ?? []).entries()) {
      const content =
        a.contentZh || a.content_zh || a.content || a.contentEn || a.content_en;
      if (
        typeof content !== "string" ||
        !Number.isFinite(Date.parse(a.startAt)) ||
        Date.parse(a.startAt) > Date.now() ||
        (a.endAt && Date.parse(a.endAt) < Date.now())
      )
        continue;
      list.push({
        id: a.id ?? i,
        content,
        publishDate: a.startAt,
        endAt: a.endAt,
        routes: a.routes,
        type: a.type,
        source: "push",
      });
    }
  if (text.trim())
    list.push({ id: "site-notice", content: text.trim(), source: "notice" });
  return list
    .filter(
      (a) =>
        typeof a.content === "string" &&
        a.content.trim() &&
        (!a.publishDate ||
          !Number.isFinite(Date.parse(a.publishDate)) ||
          Date.parse(a.publishDate) <= Date.now()),
    )
    .sort(
      (a, b) =>
        (Date.parse(b.publishDate ?? "") || Number(b.id) || 0) -
        (Date.parse(a.publishDate ?? "") || Number(a.id) || 0),
    );
}
function NoticeBody({ item }: { item: Notice }) {
  useLocale();
  return (
    <article className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Megaphone size={14} />
        <span>
          {item.source === "push" ? t("ui.eb6894bd6701") : t("ui.cf89e8675ec5")}
        </span>
        {item.publishDate && Number.isFinite(Date.parse(item.publishDate)) && (
          <time>
            {new Date(item.publishDate).toLocaleString("zh-CN", {
              hour12: false,
            })}
          </time>
        )}
      </div>
      <p
        className={`whitespace-pre-wrap break-words text-sm leading-7 ${item.type === "warning" || item.type === "notice" ? "text-amber-500" : item.type === "error" ? "text-red-500" : ""}`}
      >
        {item.content}
      </p>
      {item.extra && (
        <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-500">
          {item.extra}
        </p>
      )}
    </article>
  );
}

export default function AnnouncementBell({
  enabled,
  route = "/dashboard/overview",
}: {
  enabled: boolean;
  route?: string;
}) {
  useLocale();
  const state = useRef(loadState());
  const [items, setItems] = useState<Notice[]>([]);
  const [read, setRead] = useState(state.current.read);
  const [archive, setArchive] = useState(state.current.archive);
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Notice | null>(null);
  const [pushed, setPushed] = useState<Notice | null>(null);
  const [error, setError] = useState("");
  const dismissed = useRef(new Set<string>());
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.current));
    } catch {
      /* Storage may be unavailable. */
    }
  };
  useEffect(() => {
    let active = true,
      busy = false;
    let lastNotice = "";
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const [status, notice] = await Promise.allSettled([
          getSiteStatus(),
          getSiteNotice(),
        ]);
        if (!active) return;
        if (status.status === "rejected") throw status.reason;
        if (notice.status === "fulfilled") lastNotice = notice.value;
        const list = notices(status.value, lastNotice);
        setItems(list);
        state.current.archive = [
          ...new Map(
            [...list, ...state.current.archive].map((a) => [revision(a), a]),
          ).values(),
        ].slice(0, 200);
        setArchive([...state.current.archive]);
        save();
        setError(notice.status === "rejected" ? t("ui.1fc21dcdfd73") : "");
      } catch {
        if (active) setError(t("ui.bdcc4278ab87"));
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 60000);
    window.addEventListener("focus", poll);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, []);
  const mark = (list: Notice[]) => {
    state.current.read = [
      ...new Set([...state.current.read, ...list.map(revision)]),
    ].slice(-2000);
    setRead([...state.current.read]);
    save();
  };
  useEffect(() => {
    if (!enabled || history || pushed) return;
    const show = () => {
      if (document.querySelector("dialog[open], [data-modal-blocking='true']"))
        return;
      const now = Date.now();
      const active = items.filter(
        (a) =>
          (!a.publishDate ||
            !Number.isFinite(Date.parse(a.publishDate)) ||
            Date.parse(a.publishDate) <= now) &&
          (!a.endAt || Date.parse(a.endAt) >= now) &&
          (!a.routes?.length ||
            a.routes.some(
              (r) => route === r || (r !== "/" && route.startsWith(r + "/")),
            )),
      );
      const latest = active.find((a) => a.source === "announcement");
      const next = active.find(
        (a) =>
          (a.source !== "announcement" || a === latest) &&
          !state.current.read.includes(revision(a)) &&
          !dismissed.current.has(revision(a)),
      );
      if (next) setPushed(next);
    };
    const timer = window.setInterval(show, 1200);
    return () => clearInterval(timer);
  }, [enabled, history, items, pushed, read, route]);
  const ordered = [...archive].sort(
    (a, b) =>
      (Date.parse(b.publishDate ?? "") || 0) -
      (Date.parse(a.publishDate ?? "") || 0),
  );
  const visible = ordered.slice((page - 1) * 10, page * 10);
  const unread = archive.filter((a) => !read.includes(revision(a))).length;
  const dismiss = () => {
    if (pushed) dismissed.current.add(revision(pushed));
    setPushed(null);
  };
  return (
    <>
      <button
        type="button"
        aria-label={t("ui.b9bde0d7ff0f", {
          v0: unread ? t("ui.b625516db133", { v0: unread }) : "",
        })}
        title={t("ui.3b0d9756e934")}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10"
        onClick={() => {
          setPage(1);
          setHistory(true);
          setDetail(null);
        }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
        )}
      </button>
      {history && (
        <DetailDialog
          title={t("ui.53276299c766")}
          close={() => {
            setHistory(false);
            setDetail(null);
          }}
        >
          {error && <p className="text-xs text-amber-500">{error}</p>}
          {detail ? (
            <>
              <button className={buttonClass} onClick={() => setDetail(null)}>
                {t("ui.1d8365a84807")}
              </button>
              <NoticeBody item={detail} />
              {!read.includes(revision(detail)) && (
                <button className={buttonClass} onClick={() => mark([detail])}>
                  <CheckCheck size={14} />
                  {t("ui.b1971f6896b4")}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t("message.525267e82433", { v0: unread })}</span>
                {unread > 0 && (
                  <button className={buttonClass} onClick={() => mark(archive)}>
                    <CheckCheck size={14} />
                    {t("ui.ac210d6e7dbb")}
                  </button>
                )}
              </div>
              {!archive.length && (
                <p className="py-10 text-center text-slate-500">
                  {t("ui.17b836f389fb")}
                </p>
              )}
              {visible.map((a) => (
                <button
                  key={revision(a)}
                  className="block w-full rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                  onClick={() => setDetail(a)}
                >
                  <div className="mb-2 flex gap-2 text-xs text-slate-500">
                    <span>
                      {a.source === "push"
                        ? t("ui.eb6894bd6701")
                        : t("ui.3f9569532847")}
                    </span>
                    <time className="ml-auto">
                      {a.publishDate &&
                      Number.isFinite(Date.parse(a.publishDate))
                        ? new Date(a.publishDate).toLocaleDateString()
                        : t("feature.undated")}
                    </time>
                    {!read.includes(revision(a)) && (
                      <span className="text-blue-500">
                        {t("ui.1e230aa2012d")}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 break-words text-sm leading-6">
                    {a.content}
                  </p>
                </button>
              ))}
              <Pagination
                page={page}
                total={ordered.length}
                size={10}
                setPage={setPage}
              />
            </>
          )}
        </DetailDialog>
      )}
      {pushed && enabled && (
        <DetailDialog
          title={
            pushed.source === "announcement"
              ? t("ui.a07ae26dd261")
              : t("ui.eb6894bd6701")
          }
          close={dismiss}
        >
          <NoticeBody item={pushed} />
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
            <button className={buttonClass} onClick={dismiss}>
              {t("ui.a983c0043ed8")}
            </button>
            <button
              className={
                buttonClass + " bg-blue-500 text-white hover:!bg-blue-600"
              }
              onClick={() => {
                mark([pushed]);
                setPushed(null);
              }}
            >
              <CheckCheck size={14} />
              {t("ui.9852cdd66868")}
            </button>
          </div>
        </DetailDialog>
      )}
    </>
  );
}
