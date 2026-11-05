import { t, useLocale } from "../../lib/i18n";
import type { TokenItem } from "../../types";
import KeysPanel from "../KeysPanel";
import { DetailDialog } from "../AccountDataUI";

export interface TokenSelectModalProps {
  open: boolean;
  selectedTokenId?: number | null;
  onSelectKey: (apiKey: string, token: TokenItem) => void | Promise<void>;
  onClose: () => void;
  toolName?: string;
  accentColor?: "blue" | "purple" | "emerald" | "orange";
}

export function TokenSelectModal({
  open,
  selectedTokenId,
  onSelectKey,
  onClose,
  toolName = t("ui.3239502ee7fe"),
}: TokenSelectModalProps) {
  useLocale();
  if (!open) return null;
  return (
    <DetailDialog
      title={t("ui.407716f81b21", { v0: toolName })}
      close={onClose}
    >
      <KeysPanel
        selection={{ selectedTokenId, onSelectKey, onClose, toolName }}
      />
    </DetailDialog>
  );
}
