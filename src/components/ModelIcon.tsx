import { BRAND } from "../lib/brand";
import { t, useLocale } from "../lib/i18n";
import { useState } from "react";
import { Bot } from "lucide-react";
import { SiGooglegemini, SiAnthropic } from "react-icons/si";
import { ClaudeIcon, OpenAIIcon } from "./BrandIcons";
import xai from "../assets/model-icons/xai.svg";
import qwen from "../assets/model-icons/qwen-color.svg";
import deepseek from "../assets/model-icons/deepseek-color.svg";
import moonshot from "../assets/model-icons/moonshot.svg";
import zhipu from "../assets/model-icons/zhipu-color.svg";
import spark from "../assets/model-icons/spark-color.svg";

export default function ModelIcon({
  name,
  icon,
  vendor,
  size = 20,
  compact = false,
}: {
  name: string;
  icon?: string;
  vendor?: string;
  size?: number;
  compact?: boolean;
}) {
  useLocale();
  const [failedUrl, setFailedUrl] = useState("");
  const hint = `${icon ?? ""} ${vendor ?? ""} ${name}`.toLowerCase();
  const url =
    icon && /^(https:\/\/|\/[^/])/.test(icon)
      ? icon.startsWith("/")
        ? `${BRAND.siteUrl}${icon}`
        : icon
      : "";
  let mark;
  const brandAsset = /xai|grok/.test(hint)
    ? { src: xai, mono: true }
    : /deepseek/.test(hint)
      ? { src: deepseek, mono: false }
      : /qwen|alibaba|通义/.test(hint)
        ? { src: qwen, mono: false }
        : /moonshot|kimi/.test(hint)
          ? { src: moonshot, mono: true }
          : /zhipu|glm|智谱/.test(hint)
            ? { src: zhipu, mono: false }
            : /spark|讯飞/.test(hint)
              ? { src: spark, mono: false }
              : null;
  if (url && failedUrl !== url)
    mark = (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    );
  else if (brandAsset)
    mark = (
      <img
        src={brandAsset.src}
        alt=""
        width={size}
        height={size}
        className={brandAsset.mono ? "dark:invert" : ""}
      />
    );
  else if (/claude/.test(hint))
    mark = <ClaudeIcon size={size} useOfficialColor />;
  else if (/anthropic/.test(hint))
    mark = <SiAnthropic size={size} className="text-[#c98469]" />;
  else if (/gemini|google|gemma/.test(hint))
    mark = <SiGooglegemini size={size} className="text-blue-500" />;
  else if (
    /gpt|openai|codex|dall-e|o[134]-|sora|whisper|text-embedding/.test(hint)
  )
    mark = <OpenAIIcon size={size} />;
  else mark = <Bot size={size} className="text-slate-500 dark:text-gray-400" />;
  return (
    <span
      role="img"
      aria-label={t("ui.9dc5149fc73b", { v0: name })}
      className={
        "inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-slate-800 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-gray-100 " +
        (compact ? "h-8 w-8" : "h-10 w-10")
      }
    >
      <span aria-hidden="true" className="inline-flex">
        {mark}
      </span>
    </span>
  );
}
