import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";

export interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: "start" | "end" | "center";
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  encryptedClassName?: string;
  parentClassName?: string;
  animateOn?: "view" | "hover" | "mount";
}

export const DecryptedText: React.FC<DecryptedTextProps> = ({
  text,
  speed = 40,
  maxIterations = 12,
  sequential = true,
  revealDirection = "start",
  useOriginalCharsOnly = false,
  characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()",
  className = "",
  parentClassName = "",
  encryptedClassName = "text-blue-500/70",
  animateOn = "mount",
}) => {
  const [displayText, setDisplayText] = useState<string>(text);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(
    new Set(),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const availableChars = useMemo<string[]>(() => {
    return useOriginalCharsOnly
      ? Array.from(new Set(text.split(""))).filter((char) => char !== " ")
      : characters.split("");
  }, [useOriginalCharsOnly, text, characters]);

  const shuffleText = useCallback(
    (originalText: string, currentRevealed: Set<number>) => {
      return originalText
        .split("")
        .map((char, i) => {
          if (char === " ") return " ";
          if (currentRevealed.has(i)) return originalText[i];
          return availableChars[
            Math.floor(Math.random() * availableChars.length)
          ];
        })
        .join("");
    },
    [availableChars],
  );

  const triggerDecrypt = useCallback(() => {
    setRevealedIndices(new Set());
    setIsAnimating(true);
  }, []);

  useEffect(() => {
    if (animateOn === "mount") {
      triggerDecrypt();
    }
  }, [animateOn, triggerDecrypt]);

  useEffect(() => {
    if (!isAnimating) return;

    let currentIteration = 0;

    intervalRef.current = setInterval(() => {
      setRevealedIndices((prevRevealed) => {
        if (sequential) {
          if (prevRevealed.size < text.length) {
            const nextIndex =
              revealDirection === "end"
                ? text.length - 1 - prevRevealed.size
                : prevRevealed.size;
            const newRevealed = new Set(prevRevealed);
            newRevealed.add(nextIndex);
            setDisplayText(shuffleText(text, newRevealed));
            return newRevealed;
          } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsAnimating(false);
            setDisplayText(text);
            return prevRevealed;
          }
        } else {
          currentIteration++;
          setDisplayText(shuffleText(text, prevRevealed));
          if (currentIteration >= maxIterations) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsAnimating(false);
            setDisplayText(text);
          }
          return prevRevealed;
        }
      });
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    isAnimating,
    text,
    sequential,
    revealDirection,
    maxIterations,
    speed,
    shuffleText,
  ]);

  return (
    <span
      className={`inline-block whitespace-pre select-none cursor-default ${parentClassName}`}
      onMouseEnter={() => {
        if (animateOn === "hover" && !isAnimating) {
          triggerDecrypt();
        }
      }}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {displayText.split("").map((char, index) => {
          const isRevealed = revealedIndices.has(index) || !isAnimating;
          return (
            <span
              key={index}
              className={`transition-colors duration-150 ${
                isRevealed ? className : encryptedClassName
              }`}
            >
              {char}
            </span>
          );
        })}
      </span>
    </span>
  );
};

export default DecryptedText;
