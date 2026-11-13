import { useMemo } from 'react';
import { parseTextWithTagsAndMentions } from '../utils/socialLogic';

interface RichTextProps {
  text: string;
  className?: string;
  onHashtagClick?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
}

export function RichText({
  text,
  className = '',
  onHashtagClick,
  onMentionClick,
}: RichTextProps) {
  const tokens = useMemo(() => parseTextWithTagsAndMentions(text), [text]);

  if (!text) return null;

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        if (token.type === 'hashtag') {
          return (
            <button
              key={`${idx}-${token.raw}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHashtagClick?.(token.value);
              }}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer inline p-0 m-0 border-0 bg-transparent text-inherit leading-inherit align-baseline"
              aria-label={`Filter posts with hashtag ${token.value}`}
            >
              #{token.value}
            </button>
          );
        }

        if (token.type === 'mention') {
          return (
            <button
              key={`${idx}-${token.raw}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMentionClick?.(token.value);
              }}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer inline p-0 m-0 border-0 bg-transparent text-inherit leading-inherit align-baseline"
              aria-label={`View profile for @${token.value}`}
            >
              @{token.value}
            </button>
          );
        }

        return <span key={idx}>{token.value}</span>;
      })}
    </span>
  );
}
