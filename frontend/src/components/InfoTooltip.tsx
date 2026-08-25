import React from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export default function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
  return (
    <div className={className}>
      <div className="group relative inline-flex">
        <Info className="w-3.5 h-3.5 text-sfTextMuted hover:text-sfBlue cursor-help transition-colors" />
        <div className="pointer-events-none absolute right-0 top-full mt-1.5 w-56 rounded-md bg-sfTextPrimary text-white text-[11px] leading-snug px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
          {text}
        </div>
      </div>
    </div>
  );
}
