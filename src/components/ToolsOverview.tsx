import { t, useLocale } from "../lib/i18n";
import { ShieldCheck, Wrench, FolderGit2, ArrowUpRight } from "lucide-react";
import { cardClass, buttonClass } from "./AccountDataUI";

export default function ToolsOverview({
  initialize,
  diagnose,
  paths,
}: {
  initialize: () => void;
  diagnose: () => void;
  paths: () => void;
}) {
  useLocale();
  const tools = [
    {
      title: t("ui.52898ef02ec2"),
      description: t("ui.5d1c7f451a50"),
      icon: ShieldCheck,
      color: "text-blue-500",
      action: initialize,
      button: t("ui.f11a095b0c89"),
    },
    {
      title: t("ui.657d1f6df463"),
      description: t("ui.4ecf583ee8af"),
      icon: Wrench,
      color: "text-amber-500",
      action: diagnose,
      button: t("ui.db447a5c337f"),
    },
    {
      title: t("ui.90092ad4bdfc"),
      description: t("ui.ac49840db3cc"),
      icon: FolderGit2,
      color: "text-emerald-500",
      action: paths,
      button: t("ui.4c767321b489"),
    },
  ];
  return (
    <section>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
        {t("ui.88ffbfb66113")}
      </h1>
      <p className="mt-2 mb-6 text-xs text-slate-500">{t("ui.74f81c33fc8f")}</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {tools.map(
          ({ title, description, icon: Icon, color, action, button }) => (
            <article
              key={title}
              className={cardClass + " flex flex-col items-start p-5"}
            >
              <div
                className={
                  "mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 " +
                  color
                }
              >
                <Icon size={20} />
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {title}
              </h2>
              <p className="mt-2 mb-5 flex-1 text-xs leading-6 text-slate-500">
                {description}
              </p>
              <button className={buttonClass} onClick={action}>
                {button}
                <ArrowUpRight size={12} />
              </button>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
