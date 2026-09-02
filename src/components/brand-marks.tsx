/** @jsxRuntime automatic */
/**
 * Two logos that are not ours, rendered as their owners draw them.
 *
 * The footer has to say two separate things — who built this, and whose rails
 * it runs on — and both are claims about other people's brands. So neither mark
 * is approximated: the TUMO OLO wordmark is the outline served at tumoolo.tech,
 * and the MoMo mark is the PNG MTN serves from `momodeveloper.mtn.com`. No
 * recolouring, no redrawing, no "close enough" tracing.
 *
 * Both are decorative in the accessibility sense only in that the text beside
 * them already carries the meaning — each still gets a real accessible name,
 * because a logo with no name is a blank spot in a screen reader's reading of
 * the page and these two are the attribution.
 */

import Image from 'next/image';
import momoMark from '@/assets/images/momo-mark.webp';
import {
  TUMO_OLO_BANDS,
  TUMO_OLO_PATH,
  TUMO_OLO_VIEW_BOX,
} from '@/components/tumo-olo-wordmark.data';

/**
 * The TUMO OLO wordmark.
 *
 * Three raked bands seen through the letterforms. The bottom band is near-black
 * by design, so the mark only resolves on a dark ground — which is the only
 * ground we have (`layout.tsx` sets `.dark` on `<html>` and there is no toggle).
 * If this app ever gains a light theme, this mark needs a plinth, not a recolour.
 *
 * `id` namespaces the mask and gradients. SVG ids are document-global, so two of
 * these on one page would otherwise fight over the same `url(#…)` references.
 */
export function TumoOloMark({ id = 'tumo-olo', className }: { id?: string; className?: string }) {
  const bands = (['a', 'b', 'c'] as const).map((key) => ({
    key,
    stops: TUMO_OLO_BANDS[key],
  }));

  return (
    <svg
      viewBox={TUMO_OLO_VIEW_BOX}
      role="img"
      aria-label="Tumo Olo"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* White where the bands show through: the glyphs, minus two hairline
            gaps that split the three bands apart. */}
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="200">
          <rect x="0" y="0" width="500" height="200" fill="#000" />
          <path d={TUMO_OLO_PATH} fill="#fff" />
          <rect x="30" y="72" width="440" height="5" fill="#000" transform="rotate(-6 250 100)" />
          <rect x="30" y="103" width="440" height="5" fill="#000" transform="rotate(-6 250 100)" />
        </mask>

        {bands.map(({ key, stops }) => (
          <linearGradient key={key} id={`${id}-${key}`} x1="0" y1="0" x2="1" y2="0">
            {stops.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>

      <g mask={`url(#${id}-mask)`}>
        <rect
          x="-60"
          y="-40"
          width="620"
          height="112"
          fill={`url(#${id}-a)`}
          transform="rotate(-6 250 100)"
        />
        <rect
          x="-60"
          y="77"
          width="620"
          height="26"
          fill={`url(#${id}-b)`}
          transform="rotate(-6 250 100)"
        />
        <rect
          x="-60"
          y="108"
          width="620"
          height="132"
          fill={`url(#${id}-c)`}
          transform="rotate(-6 250 100)"
        />
      </g>
    </svg>
  );
}

/**
 * The MTN MoMo app mark, in MTN's own colours — deep blue `#003A58`, MTN yellow
 * `#FFCB05`. Served as a 174px lossless WebP so `next/image` can hand a phone a
 * 32px copy instead of the whole thing.
 *
 * The blue sits close to our pure-black background, so the caller rings it to
 * give the rounded square an edge. That is a border on the frame, not a change
 * to the logo.
 */
export function MomoMark({ size = 36 }: { size?: number }) {
  return (
    <Image
      src={momoMark}
      alt="MTN MoMo"
      width={size}
      height={size}
      sizes={`${size}px`}
      className="rounded-[22%] ring-1 ring-border"
    />
  );
}
