import { useId, useState, type FormEvent } from "react";
import { Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { sendFeishuFeedback } from "../lib/api";
import { t, useLocale } from "../lib/i18n";
import { usePreferences } from "../lib/preferences";
import { buttonClass, cardClass, fieldClass } from "./AccountDataUI";

export default function FeedbackPanel({ version }: { version: string }) {
  useLocale();
  const id = useId();
  const { preferences } = usePreferences();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const isMeaningful = (value: string, minimum: number, maximum: number) => {
    const chars = Array.from(value.trim());
    if (chars.length < minimum || chars.length > maximum) return false;
    const unique = new Set(chars);
    let run = 1;
    let longestRun = 1;
    for (let index = 1; index < chars.length; index += 1) {
      run = chars[index] === chars[index - 1] ? run + 1 : 1;
      longestRun = Math.max(longestRun, run);
    }
    return unique.size > 1 && longestRun < 6;
  };
  const notifyError = (code: string) => {
    toast.error(t(`feedback.error.${code}`));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!preferences.feishuWebhook) return notifyError("notConfigured");
    if (!isMeaningful(title, 5, 120))
      return notifyError("invalidTitle");
    if (!isMeaningful(details, 15, 5000))
      return notifyError("invalidDetails");
    setSending(true);
    try {
      await sendFeishuFeedback({
        webhook: preferences.feishuWebhook,
        title: title.trim(),
        details: details.trim(),
        contact: contact.trim(),
        appVersion: version,
      });
      toast.success(t("feedback.sent"));
      setTitle("");
      setDetails("");
      setContact("");
    } catch (cause) {
      const code = String(cause instanceof Error ? cause.message : cause);
      notifyError(
        [
          "invalidWebhook",
          "invalidTitle",
          "invalidDetails",
          "invalidContact",
          "network",
          "rejected",
          "response",
          "desktopOnly",
        ].includes(code)
          ? code
          : "network",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={(event) => void submit(event)}
        className={cardClass + " space-y-5 p-6"}
      >
        <header className="flex items-start gap-3">
          <MessageSquareText
            size={22}
            className="mt-1 shrink-0 text-blue-500"
          />
          <div>
            <h2 className="text-base font-semibold">{t("feedback.title")}</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              {t("feedback.description")}
            </p>
          </div>
        </header>
        <div className="space-y-2 text-xs font-medium">
          <label htmlFor={`${id}-subject`} className="block">
            {t("feedback.subject")}
          </label>
          <input
            id={`${id}-subject`}
            required
            maxLength={120}
            disabled={sending}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            className={fieldClass + " w-full"}
            placeholder={t("feedback.subjectPlaceholder")}
          />
        </div>
        <div className="space-y-2 text-xs font-medium">
          <label htmlFor={`${id}-details`} className="block">
            {t("feedback.details")}
          </label>
          <textarea
            id={`${id}-details`}
            required
            maxLength={5000}
            disabled={sending}
            value={details}
            onChange={(event) => {
              setDetails(event.target.value);
            }}
            rows={7}
            className={fieldClass + " w-full resize-y leading-6"}
            placeholder={t("feedback.detailsPlaceholder")}
          />
        </div>
        <div className="space-y-2 text-xs font-medium">
          <label htmlFor={`${id}-contact`} className="block">
            {t("feedback.contact")}
          </label>
          <input
            id={`${id}-contact`}
            maxLength={200}
            disabled={sending}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            className={fieldClass + " w-full"}
            placeholder={t("feedback.contactPlaceholder")}
          />
        </div>
        <p className="text-xs leading-6 text-slate-500">
          {t("feedback.dataNotice", { version })}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5 dark:border-white/10">
          <button
            type="submit"
            disabled={sending || !preferences.feishuWebhook}
            className={
              buttonClass +
              " border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
            }
          >
            {sending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
            {t(sending ? "feedback.sending" : "feedback.send")}
          </button>
        </div>
      </form>
    </div>
  );
}
