import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Headset,
  ImagePlus,
  Info,
  LifeBuoy,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { t, useLocale } from "../lib/i18n";
import {
  closeTicket,
  createTicket,
  getTicketDetail,
  getTicketList,
  markTicketRead,
  replyTicket,
  uploadTicketImage,
} from "../lib/api";
import type {
  SupportTicket,
  SupportTicketDetail,
  SupportTicketMessage,
} from "../lib/account-data";
import { buttonClass } from "./AccountDataUI";

const PAGE_SIZE = 10;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const systemMessageTranslations: Record<string, string> = {
  "We have received your ticket. Please wait patiently, and we will reply as soon as possible.":
    "We have received your ticket. Please wait patiently, and we will reply as soon as possible.",
  "This ticket has been closed. If you still need help, please create a new ticket. This ticket will be automatically deleted after 10 days. Thank you for your understanding and support.":
    "This ticket has been closed. If you still need help, please create a new ticket. This ticket will be automatically deleted after 10 days. Thank you for your understanding and support.",
};
const inputClass =
  "h-9 w-full border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#141b27] dark:text-gray-100";
const textareaClass =
  "w-full resize-y border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#141b27] dark:text-gray-100";

const ticketRef = (ticket: SupportTicket) =>
  ticket.ticket_no || String(ticket.id);
const formatDate = (seconds?: number) =>
  seconds && seconds > 0
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(seconds * 1000))
    : "-";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: t("ticket.statusOpen"),
    pending: t("ticket.statusPending"),
    processing: t("ticket.statusProcessing"),
    replied: t("ticket.statusReplied"),
    resolved: t("ticket.statusResolved"),
    closed: t("ticket.statusClosed"),
  };
  return labels[status] || status;
}

function statusTone(status: string) {
  if (status === "closed" || status === "resolved")
    return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-400";
  if (status === "replied" || status === "pending")
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300";
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300";
}

function Message({ message }: { message: SupportTicketMessage }) {
  const system = message.sender_role === "system";
  const self = message.sender_role === "user";
  const support = message.sender_role === "admin";
  const content = message.content.trim().replace(/^System:\s*/i, "");
  let images: string[] = [];
  try {
    const parsed: unknown = JSON.parse(message.images || "[]");
    if (Array.isArray(parsed)) {
      images = parsed.filter(
        (url): url is string =>
          typeof url === "string" && /^https?:\/\//i.test(url),
      );
    }
  } catch {
    images = [];
  }
  const AvatarIcon = system ? Info : self ? UserRound : Headset;
  const roleClass = system
    ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/15 dark:text-amber-300"
    : self
      ? "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/15 dark:text-blue-300"
      : support
        ? "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/15 dark:text-violet-300"
        : "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/15 dark:text-emerald-300";
  const bubbleClass = system
    ? "border-amber-200 bg-amber-50/80 dark:border-amber-400/20 dark:bg-amber-400/[0.07]"
    : self
      ? "border-blue-200 bg-blue-50/80 dark:border-blue-400/20 dark:bg-blue-400/[0.07]"
      : support
        ? "border-violet-200 bg-violet-50/80 dark:border-violet-400/20 dark:bg-violet-400/[0.07]"
        : "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/20 dark:bg-emerald-400/[0.07]";
  return (
    <div
      className={`flex items-end gap-2.5 ${self ? "flex-row-reverse" : "flex-row"}`}
    >
      <span
        className={`mb-1 flex h-8 w-8 shrink-0 items-center justify-center border ${roleClass}`}
        aria-label={system ? t("ticket.system") : self ? t("ticket.you") : t("ticket.support")}
        title={system ? t("ticket.system") : self ? t("ticket.you") : t("ticket.support")}
      >
        <AvatarIcon size={15} />
      </span>
      <article
        className={`max-w-[88%] min-w-0 border px-3.5 py-3 ${bubbleClass}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px]">
          <span className="font-semibold text-slate-700 dark:text-gray-200">
            {system
              ? t("ticket.system")
              : self
                ? t("ticket.you")
                : support
                  ? message.sender_name || t("ticket.support")
                  : message.sender_name}
          </span>
          <time className="text-slate-400">
            {formatDate(message.created_at)}
          </time>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700 dark:text-gray-300">
          {systemMessageTranslations[content]
            ? t(systemMessageTranslations[content])
            : message.content}
        </p>
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((url) => (
              <a href={url} target="_blank" rel="noreferrer" key={url}>
                <img
                  src={url}
                  alt={t("ticket.attachment")}
                  className="h-24 w-full border border-black/10 object-cover dark:border-white/10"
                />
              </a>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

function TicketImageInput({
  images,
  onChange,
  disabled,
  label,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  disabled: boolean;
  label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputId = `ticket-images-${label}`;
  const upload = async (files: FileList | null) => {
    const incoming = Array.from(files ?? []);
    if (!incoming.length || disabled || uploading) return;
    if (images.length >= MAX_IMAGES) {
      toast.error(t("ticket.imageLimit"));
      return;
    }
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of incoming.slice(0, MAX_IMAGES - images.length)) {
        if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
          toast.error(t("ticket.imageType", { name: file.name }));
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(t("ticket.imageSize", { name: file.name }));
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error(t("ticket.imageReadError")));
          reader.onerror = () => reject(new Error(t("ticket.imageReadError")));
          reader.readAsDataURL(file);
        });
        uploaded.push(
          await uploadTicketImage(
            dataUrl,
            file.name || `ticket-${Date.now()}.png`,
          ),
        );
      }
      if (uploaded.length) {
        onChange([...images, ...uploaded].slice(0, MAX_IMAGES));
        toast.success(t("ticket.imageUploaded"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (input) input.value = "";
    }
  };
  return (
    <div className="space-y-2">
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        disabled={disabled || uploading || images.length >= MAX_IMAGES}
        onChange={(event) => void upload(event.target.files)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={`inline-flex h-8 cursor-pointer items-center gap-2 border border-slate-200 px-2.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5 ${disabled || uploading || images.length >= MAX_IMAGES ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? (
            <LoaderCircle size={13} className="animate-spin" />
          ) : (
            <ImagePlus size={13} />
          )}
          {uploading ? t("ticket.uploading") : t("ticket.uploadImage")}
        </label>
        <span className="text-[10px] text-slate-400">
          {t("ticket.imageHint", { count: images.length })}
        </span>
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {images.map((url) => (
            <div
              key={url}
              className="group relative border border-slate-200 dark:border-white/10"
            >
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={t("ticket.attachment")}
                  className="h-16 w-full object-cover"
                />
              </a>
              <button
                type="button"
                title={t("common.remove")}
                aria-label={t("common.remove")}
                disabled={disabled || uploading}
                onClick={() => onChange(images.filter((image) => image !== url))}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-black/65 text-white hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TicketCenter() {
  useLocale();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRef, setSelectedRef] = useState("");
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState("");
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [createImages, setCreateImages] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "general",
    priority: "normal",
    content: "",
  });

  const loadList = useCallback(
    async (nextPage = page) => {
      setLoadingList(true);
      try {
        const result = await getTicketList({
          p: nextPage,
          page_size: PAGE_SIZE,
          ...(status ? { status } : {}),
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
        });
        setTickets(result.items || []);
        setTotal(result.total || 0);
        setPage(result.page || nextPage);
        if (
          selectedRef &&
          !(result.items || []).some(
            (ticket) => ticketRef(ticket) === selectedRef,
          )
        ) {
          setSelectedRef("");
          setDetail(null);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        setTickets([]);
      } finally {
        setLoadingList(false);
      }
    },
    [keyword, page, selectedRef, status],
  );

  const loadDetail = useCallback(async (ref: string) => {
    setSelectedRef(ref);
    setLoadingDetail(true);
    try {
      const value = await getTicketDetail(ref);
      setDetail(value);
      if (value.ticket.user_unread) {
        await markTicketRead(ref);
        setTickets((items) =>
          items.map((item) =>
            ticketRef(item) === ref ? { ...item, user_unread: false } : item,
          ),
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadList(1);
  }, [status, keyword]);

  const messages = useMemo(
    () =>
      [...(detail?.messages || [])].sort((a, b) => a.created_at - b.created_at),
    [detail],
  );
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedTicket = detail?.ticket;
  const isClosed = selectedTicket?.status === "closed";

  const submitCreate = async () => {
    if (form.title.trim().length === 0 || form.content.trim().length < 15)
      return;
    setSaving(true);
    try {
      const created = await createTicket({
        ...form,
        title: form.title.trim(),
        content: form.content.trim(),
        images: createImages,
      });
      const ref = ticketRef(created.ticket);
      setCreateOpen(false);
      setForm({
        title: "",
        category: "general",
        priority: "normal",
        content: "",
      });
      setCreateImages([]);
      setPage(1);
      await loadList(1);
      await loadDetail(ref);
      toast.success(t("ticket.created"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const submitReply = async () => {
    if (!selectedTicket || !reply.trim() || isClosed) return;
    setSaving(true);
    try {
      const updated = await replyTicket(
        ticketRef(selectedTicket),
        reply.trim(),
        replyImages,
      );
      setDetail(updated);
      setReply("");
      setReplyImages([]);
      await loadList(page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const submitClose = async () => {
    if (!selectedTicket || isClosed) return;
    setSaving(true);
    try {
      await closeTicket(ticketRef(selectedTicket));
      await loadDetail(ticketRef(selectedTicket));
      await loadList(page);
      toast.success(t("ticket.closedToast"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    const activeRef = selectedRef;
    await Promise.all([
      loadList(page),
      activeRef ? loadDetail(activeRef) : Promise.resolve(),
    ]);
  };

  return (
    <section className="flex min-h-[560px] w-full flex-1 flex-col text-slate-700 dark:text-gray-300">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
            <LifeBuoy size={17} />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("ticket.title")}
            </h1>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {t("ticket.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label={t("common.refresh")}
            title={t("common.refresh")}
            className={buttonClass}
            onClick={() => void refresh()}
            disabled={loadingList}
          >
            <RefreshCw
              size={13}
              className={loadingList ? "animate-spin" : ""}
            />
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
            onClick={() => setCreateOpen(true)}
          >
            <CirclePlus size={14} />
            {t("ticket.create")}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 border border-slate-200 bg-white dark:border-white/10 dark:bg-[#101722] lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)]">
        <aside
          className={`min-w-0 border-slate-200 dark:border-white/10 lg:border-r ${selectedRef ? "hidden lg:block" : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-white/10">
            <label className="relative min-w-[150px] flex-1">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setKeyword(search);
                }}
                placeholder={t("ticket.search")}
                className={`${inputClass} pl-8`}
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-9 border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-[#141b27]"
              aria-label={t("ticket.filterStatus")}
            >
              <option value="">{t("ticket.allStatuses")}</option>
              {[
                "open",
                "pending",
                "processing",
                "replied",
                "resolved",
                "closed",
              ].map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {loadingList && tickets.length === 0 ? (
              <div className="flex min-h-44 items-center justify-center text-xs text-slate-500">
                <LoaderCircle size={15} className="mr-2 animate-spin" />
                {t("common.loading")}
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center gap-2 px-5 text-center text-xs text-slate-500">
                <MessageSquareText size={20} className="text-slate-400" />
                {t("ticket.empty")}
              </div>
            ) : (
              tickets.map((ticket) => {
                const ref = ticketRef(ticket);
                return (
                  <button
                    key={ticket.id}
                    onClick={() => void loadDetail(ref)}
                    className={`block w-full border-b border-slate-100 px-3.5 py-3 text-left transition-colors dark:border-white/[0.06] ${selectedRef === ref ? "bg-blue-50/80 dark:bg-blue-400/[0.08]" : "hover:bg-slate-50 dark:hover:bg-white/[0.025]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-gray-100">
                        {ticket.title}
                      </span>
                      {ticket.user_unread && (
                        <span
                          className="mt-1 h-2 w-2 shrink-0 bg-blue-600"
                          aria-label={t("ticket.unread")}
                        />
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        {ref}
                      </span>
                      <span
                        className={`border px-1.5 py-0.5 text-[9px] font-medium ${statusTone(ticket.status)}`}
                      >
                        {statusLabel(ticket.status)}
                      </span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400">
                      {formatDate(
                        ticket.last_reply_at ||
                          ticket.updated_at ||
                          ticket.created_at,
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <footer className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[10px] text-slate-500 dark:border-white/10">
            <span>{t("ticket.total", { count: total })}</span>
            <div className="flex items-center gap-1.5">
              <button
                className="border border-slate-200 p-1.5 disabled:opacity-40 dark:border-white/10"
                disabled={page <= 1 || loadingList}
                aria-label={t("common.previous")}
                onClick={() => void loadList(page - 1)}
              >
                <ChevronLeft size={13} />
              </button>
              <span className="tabular-nums">
                {page} / {maxPage}
              </span>
              <button
                className="border border-slate-200 p-1.5 disabled:opacity-40 dark:border-white/10"
                disabled={page >= maxPage || loadingList}
                aria-label={t("common.next")}
                onClick={() => void loadList(page + 1)}
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </footer>
        </aside>

        <div
          className={`flex min-h-[440px] min-w-0 flex-col ${selectedRef ? "" : "hidden lg:flex"}`}
        >
          {loadingDetail ? (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
              <LoaderCircle size={15} className="mr-2 animate-spin" />
              {t("common.loading")}
            </div>
          ) : !selectedTicket ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-slate-400">
              <MessageSquareText size={24} />
              {t("ticket.selectTicket")}
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    className="lg:hidden"
                    onClick={() => setSelectedRef("")}
                    aria-label={t("common.back")}
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                      {selectedTicket.title}
                    </h2>
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      {ticketRef(selectedTicket)} ·{" "}
                      {formatDate(selectedTicket.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`border px-2 py-1 text-[10px] font-medium ${statusTone(selectedTicket.status)}`}
                  >
                    {statusLabel(selectedTicket.status)}
                  </span>
                  {!isClosed && (
                    <button
                      onClick={() => void submitClose()}
                      disabled={saving}
                      className="h-7 border border-slate-200 px-2 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      {t("ticket.close")}
                    </button>
                  )}
                </div>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 dark:bg-black/10">
                {messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))}
              </div>
              <div className="border-t border-slate-200 p-3 dark:border-white/10">
                {isClosed ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                    <Check size={14} />
                    {t("ticket.closedNotice")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-end gap-2">
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        rows={2}
                        maxLength={5000}
                        placeholder={t("ticket.replyPlaceholder")}
                        className={`${textareaClass} min-h-16 flex-1`}
                      />
                      <button
                        className="flex h-9 shrink-0 items-center gap-1.5 border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        disabled={saving || !reply.trim()}
                        onClick={() => void submitReply()}
                      >
                        {saving ? (
                          <LoaderCircle size={13} className="animate-spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        {t("ticket.send")}
                      </button>
                    </div>
                    <TicketImageInput
                      images={replyImages}
                      onChange={setReplyImages}
                      disabled={saving || isClosed}
                      label="reply"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setCreateOpen(false)
          }
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-create-title"
            className="w-full max-w-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#111821]"
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <h2
                id="ticket-create-title"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                {t("ticket.newTicket")}
              </h2>
              <button
                aria-label={t("common.close")}
                onClick={() => setCreateOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="space-y-3 p-4">
              <label className="block space-y-1.5 text-[10px] font-medium text-slate-600 dark:text-gray-300">
                {t("ticket.subject")}
                <input
                  autoFocus
                  maxLength={120}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  className={inputClass}
                  placeholder={t("ticket.subjectPlaceholder")}
                />
              </label>
              <TicketImageInput
                images={createImages}
                onChange={setCreateImages}
                disabled={saving}
                label="create"
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-[10px] font-medium text-slate-600 dark:text-gray-300">
                  {t("ticket.category")}
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="general">
                      {t("ticket.categoryGeneral")}
                    </option>
                    <option value="account">
                      {t("ticket.categoryAccount")}
                    </option>
                    <option value="billing">
                      {t("ticket.categoryBilling")}
                    </option>
                    <option value="technical">
                      {t("ticket.categoryTechnical")}
                    </option>
                    <option value="other">{t("ticket.categoryOther")}</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-[10px] font-medium text-slate-600 dark:text-gray-300">
                  {t("ticket.priority")}
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm({ ...form, priority: event.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="low">{t("ticket.priorityLow")}</option>
                    <option value="normal">{t("ticket.priorityNormal")}</option>
                    <option value="high">{t("ticket.priorityHigh")}</option>
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5 text-[10px] font-medium text-slate-600 dark:text-gray-300">
                {t("ticket.description")}
                <textarea
                  rows={6}
                  maxLength={5000}
                  value={form.content}
                  onChange={(event) =>
                    setForm({ ...form, content: event.target.value })
                  }
                  className={`${textareaClass} min-h-32`}
                  placeholder={t("ticket.descriptionPlaceholder")}
                />
                <span className="block text-right font-normal text-slate-400">
                  {form.content.trim().length} / 5000
                </span>
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-white/10">
              <button
                className={buttonClass}
                onClick={() => setCreateOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  saving ||
                  !form.title.trim() ||
                  form.content.trim().length < 15
                }
                onClick={() => void submitCreate()}
              >
                {saving && <LoaderCircle size={13} className="animate-spin" />}
                {t("ticket.submit")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
