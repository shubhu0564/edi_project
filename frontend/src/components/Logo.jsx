import React from 'react';

/**
 * ResolveX brand mark. Uses the approved MMCOE mark /logo.png served from the
 * frontend public assets. `size` is the rendered height/width box in px.
 * When `withWordmark` is true the "ResolveX" text is shown beside the mark.
 */
export default function Logo({ size = 32, withWordmark = false, wordmarkClassName = '', className = '' }) {
  const img = (
    <img
      src="/logo.png"
      alt="ResolveX"
      width={size}
      height={size}
      className="object-contain flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );

  if (!withWordmark) return React.cloneElement(img, { className: `${img.props.className} ${className}`.trim() });

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {img}
      <span className={`font-display font-bold tracking-tight text-brand-900 ${wordmarkClassName}`}>
        Resolve<span className="text-brand-500">X</span>
      </span>
    </span>
  );
}
