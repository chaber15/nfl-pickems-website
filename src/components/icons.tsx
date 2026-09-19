import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  /** Accepted for Phosphor API compatibility; ignored. */
  weight?: string;
};

function Icon({ size = 24, className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      className={className}
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export function Star({ size, className, weight }: IconProps) {
  return (
    <Icon size={size} className={className}>
      {weight === "fill" ? (
        <path d="M234.29 114.85l-45.78 39.77 13.72 58.39a16 16 0 0 1-23.84 17.34L128 199.08l-50.39 31.27a16 16 0 0 1-23.84-17.34l13.72-58.39-45.78-39.77a16 16 0 0 1 9.05-28.12l59.46-5.15 23.21-55.85a16 16 0 0 1 29.14 0l23.21 55.85 59.46 5.15a16 16 0 0 1 9.05 28.12Z" />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
          d="m128 24 27.5 55.7 61.5 9-44.5 43.3 10.5 61.2L128 164.2 73 193.2l10.5-61.2L39 88.7l61.5-9Z"
        />
      )}
    </Icon>
  );
}

export function Check({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="m40 128 56 56 120-120"
      />
    </Icon>
  );
}

export function X({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="M200 56 56 200M56 56l144 144"
      />
    </Icon>
  );
}

export function Crown({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M248 80a28 28 0 0 0-28 28c0 1.1.1 2.2.2 3.3L196 88l-36.4 48.6-31.6-63.2a28 28 0 1 0-40 0L56 136.6 28 111.3c.1-1.1.2-2.2.2-3.3a28 28 0 1 0-28 28 27.6 27.6 0 0 0 5.2-.5L32 208a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16l26.6-72.5a27.6 27.6 0 0 0 5.2.5 28 28 0 0 0 0-56Z" />
    </Icon>
  );
}

export function Question({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="M128 180v-8m0-32a36 36 0 1 0-36-36"
      />
      <circle cx="128" cy="128" r="96" fill="none" stroke="currentColor" strokeWidth="24" />
    </Icon>
  );
}

export function SignOut({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="M112 40H48v176h64M112 128h104m-40-40 40 40-40 40"
      />
    </Icon>
  );
}

export function CaretLeft({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="m160 208-80-80 80-80"
      />
    </Icon>
  );
}

export function CaretRight({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="m96 48 80 80-80 80"
      />
    </Icon>
  );
}

export function Moon({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M233.54 142.23a8 8 0 0 0-8-2 88.08 88.08 0 0 1-109.8-109.8 8 8 0 0 0-10-10 104.84 104.84 0 0 0-52.53 37.06 104 104 0 0 0 132.27 132.27 104.84 104.84 0 0 0 37.06-52.53 8 8 0 0 0 11-5Z" />
    </Icon>
  );
}

export function Sun({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <circle cx="128" cy="128" r="40" fill="none" stroke="currentColor" strokeWidth="24" />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="24"
        d="M128 40v-16m0 208v-16m88-88h16M40 128H24m151.1-63.1 11.3-11.3M73.6 182.4l-11.3 11.3m0-131.4 11.3 11.3m108.5 108.5 11.3 11.3"
      />
    </Icon>
  );
}

export function Monitor({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect
        x="32"
        y="48"
        width="192"
        height="128"
        rx="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="24"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="24"
        d="M160 224H96m32-48v48"
      />
    </Icon>
  );
}

export function Football({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <ellipse
        cx="128"
        cy="128"
        rx="80"
        ry="48"
        transform="rotate(-45 128 128)"
        fill="none"
        stroke="currentColor"
        strokeWidth="24"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="16"
        d="M104 104l48 48M120 96l40 40M96 120l40 40"
      />
    </Icon>
  );
}

export function Trophy({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="M80 208h96M128 168v40M72 48h112v40a56 56 0 0 1-112 0Zm-24 8H32a40 40 0 0 0 40 40m120-40h16a40 40 0 0 1-40 40"
      />
    </Icon>
  );
}

export function ClockCounterClockwise({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="M128 80v48l32 32m48-104v48h-48"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="24"
        d="M69.5 58.5A96 96 0 1 1 48 128"
      />
    </Icon>
  );
}

export function ChartBar({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="M48 208V120m64 88V48m64 160v-72"
      />
    </Icon>
  );
}

export function ShieldCheck({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="M128 224s80-40 80-112V56L128 32 48 56v56c0 72 80 112 80 112Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="24"
        d="m96 128 24 24 40-40"
      />
    </Icon>
  );
}
