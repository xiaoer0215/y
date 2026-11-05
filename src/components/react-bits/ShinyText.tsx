import React from "react";

export interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 4,
  className = "",
  color,
  shineColor,
}) => {
  if (disabled) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      className={`inline-block font-semibold bg-clip-text text-transparent transition-all ${className}`}
      style={{
        backgroundImage:
          color && shineColor
            ? `linear-gradient(120deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`
            : undefined,
        backgroundSize: "250% 100%",
        animation: `shine ${speed}s ease-in-out infinite`,
      }}
    >
      {text}
    </span>
  );
};

export default ShinyText;
