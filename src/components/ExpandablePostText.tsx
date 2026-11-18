import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RichText } from './RichText';

interface ExpandablePostTextProps {
  text: string;
  className?: string;
  onHashtagClick?: (tag: string) => void;
  onMentionClick?: (handle: string) => void;
}

export function ExpandablePostText({
  text,
  className = '',
  onHashtagClick,
  onMentionClick,
}: ExpandablePostTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const textContainerRef = useRef<HTMLDivElement | null>(null);
  const lastMeasuredWidthRef = useRef<number>(-1);
  const lastMeasuredTextRef = useRef<string>('');

  const measureOverflow = (force = false) => {
    const el = textContainerRef.current;
    if (!el) return;
    const width = wrapperRef.current?.clientWidth || el.clientWidth;
    if (
      !force &&
      width === lastMeasuredWidthRef.current &&
      text === lastMeasuredTextRef.current
    ) {
      return;
    }
    lastMeasuredWidthRef.current = width;
    lastMeasuredTextRef.current = text;

    const prevClamp = el.style.webkitLineClamp;
    el.style.webkitLineClamp = 'unset';
    const fullHeight = el.scrollHeight;
    el.style.webkitLineClamp = '4';
    const clampedHeight = el.clientHeight;
    el.style.webkitLineClamp = prevClamp;

    setIsOverflowing(fullHeight > clampedHeight + 3);
  };

  useLayoutEffect(() => {
    measureOverflow(true);
  }, [text]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let rafId = 0;
    const scheduleMeasure = (force = false) => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => measureOverflow(force));
    };

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            scheduleMeasure(false);
          })
        : null;
    observer?.observe(wrapper);

    const onResize = () => scheduleMeasure(true);
    window.addEventListener('resize', onResize);

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => scheduleMeasure(true)).catch(() => {});
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [text]);

  if (!text) return null;

  return (
    <div ref={wrapperRef} className={`space-y-1.5 ${className}`}>
      <div
        ref={textContainerRef}
        data-testid="expandable-post-text-body"
        style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: isExpanded ? 'unset' : '4',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed"
      >
        <RichText
          text={text}
          onHashtagClick={onHashtagClick}
          onMentionClick={onMentionClick}
        />
      </div>

      {isOverflowing && (
        <button
          type="button"
          data-testid="expandable-post-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'See Less' : 'See More'}
        </button>
      )}
    </div>
  );
}
