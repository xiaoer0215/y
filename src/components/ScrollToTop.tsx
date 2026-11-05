import { useEffect, useState, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { t, useLocale } from "../lib/i18n";
import { IconButton } from "./ui/IconButton";

export default function ScrollToTop({
  container,
}: {
  container: RefObject<HTMLElement>;
}) {
  useLocale();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setVisible(element.scrollTop > 240);
    update();
    element.addEventListener("scroll", update, { passive: true });
    return () => element.removeEventListener("scroll", update);
  }, [container]);
  if (!visible) return null;
  return (
    <IconButton
      label={t("common.backToTop")}
      className="absolute bottom-5 right-6 z-30 h-9 w-9 border border-slate-200 bg-white text-slate-600 shadow-md dark:border-white/10 dark:bg-[#171c29] dark:text-gray-200"
      onClick={() =>
        container.current?.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        })
      }
    >
      <ArrowUp size={17} />
    </IconButton>
  );
}
