import { NodeCardSelector } from "./NodeCardSelector";
export function UrlSelector(props: {
  value: string;
  customUrl?: string;
  onChange: (url: string) => void;
}) {
  return <NodeCardSelector {...props} />;
}
