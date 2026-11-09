import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function UploadIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  );
}

export function CutoutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6.5" cy="7" r="2.5" />
      <circle cx="6.5" cy="17" r="2.5" />
      <path d="M8.7 8.4 20 17M8.7 15.6 20 7" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
      <path d="M18.5 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 9v4.5M12 16.2v.1" />
    </svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.8 2-1.8 0-.6-.3-1-.3-1.5 0-.9.7-1.7 2-1.7h1.1A4.2 4.2 0 0 0 21 12 9 9 0 0 0 12 3Z" />
      <circle cx="7.8" cy="11.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="7.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CpuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </svg>
  );
}

export function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="10" fill="#252a31" />
      <rect x="10" y="10" width="9" height="9" rx="2" fill="#f2a65a" />
      <rect x="21" y="10" width="9" height="9" rx="2" fill="#e8e2d6" />
      <rect x="10" y="21" width="9" height="9" rx="2" fill="#e8e2d6" />
      <rect x="21" y="21" width="9" height="9" rx="2" fill="#7fb3a3" />
    </svg>
  );
}
