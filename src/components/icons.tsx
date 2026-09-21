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
      <path d="M144,180a16,16,0,1,1-16-16A16,16,0,0,1,144,180Zm92-52A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84.09,0,0,0,212,128ZM128,64c-24.26,0-44,17.94-44,40v4a12,12,0,0,0,24,0v-4c0-8.82,9-16,20-16s20,7.18,20,16-9,16-20,16a12,12,0,0,0-12,12v8a12,12,0,0,0,23.73,2.56C158.31,137.88,172,122.37,172,104,172,81.94,152.26,64,128,64Z" />
    </Icon>
  );
}

export function SignOut({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M124,216a12,12,0,0,1-12,12H48a12,12,0,0,1-12-12V40A12,12,0,0,1,48,28h64a12,12,0,0,1,0,24H60V204h52A12,12,0,0,1,124,216Zm108.49-96.49-40-40a12,12,0,0,0-17,17L195,116H112a12,12,0,0,0,0,24h83l-19.52,19.51a12,12,0,0,0,17,17l40-40A12,12,0,0,0,232.49,119.51Z" />
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
      <path d="M233.06,53.18a37,37,0,0,0-30.24-30.24c-15.24-2.58-38.75-4.78-64.26-.61C107.66,27.39,81.56,40.39,61,61s-33.59,46.68-38.65,77.58c-4.17,25.51-2,49,.61,64.26a37,37,0,0,0,30.24,30.24A209.43,209.43,0,0,0,87.9,236a184.13,184.13,0,0,0,29.54-2.33c30.9-5.06,57-18.06,77.58-38.65s33.59-46.68,38.65-77.58C237.84,91.93,235.64,68.42,233.06,53.18Zm-23.66,4A192,192,0,0,1,212,83.06L172.93,44a190.57,190.57,0,0,1,25.88,2.64A13,13,0,0,1,209.4,57.19ZM46.6,198.81A191.79,191.79,0,0,1,44,172.94L83.06,212a191.79,191.79,0,0,1-25.87-2.63A13,13,0,0,1,46.6,198.81Zm131.45-20.76c-11,11-31.31,26.16-63.2,31.83L46.12,141.15C51.79,109.26,67,88.93,78,78s31.3-26.16,63.2-31.83l68.73,68.73C204.21,146.74,189,167.07,178.05,178.05Zm-13.56-69.57L159,114l5.52,5.51a12,12,0,0,1-17,17L142,131l-11,11,5.52,5.52a12,12,0,0,1-17,17L114,159l-5.52,5.52a12,12,0,0,1-17-17L97,142l-5.52-5.51a12,12,0,1,1,17-17L114,125l11-11-5.52-5.52a12,12,0,1,1,17-17L142,97l5.52-5.52a12,12,0,0,1,17,17Z" />
    </Icon>
  );
}

export function Trophy({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M232,60H212V48a12,12,0,0,0-12-12H56A12,12,0,0,0,44,48V60H24A20,20,0,0,0,4,80V96a44.05,44.05,0,0,0,44,44h.77A84.18,84.18,0,0,0,116,195.15V212H96a12,12,0,0,0,0,24h64a12,12,0,0,0,0-24H140V195.11c30.94-4.51,56.53-26.2,67-55.11h1a44.05,44.05,0,0,0,44-44V80A20,20,0,0,0,232,60ZM28,96V84H44v28c0,1.21,0,2.41.09,3.61A20,20,0,0,1,28,96Zm160,15.1c0,33.33-26.71,60.65-59.54,60.9A60,60,0,0,1,68,112V60H188ZM228,96a20,20,0,0,1-16.12,19.62c.08-1.5.12-3,.12-4.52V84h16Z" />
    </Icon>
  );
}

export function ClockCounterClockwise({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M140,80v41.21l34.17,20.5a12,12,0,1,1-12.34,20.58l-40-24A12,12,0,0,1,116,128V80a12,12,0,0,1,24,0ZM128,28A99.38,99.38,0,0,0,57.24,57.34c-4.69,4.74-9,9.37-13.24,14V64a12,12,0,0,0-24,0v40a12,12,0,0,0,12,12H72a12,12,0,0,0,0-24H57.77C63,86,68.37,80.22,74.26,74.26a76,76,0,1,1,1.58,109,12,12,0,0,0-16.48,17.46A100,100,0,1,0,128,28Z" />
    </Icon>
  );
}

export function ChartBar({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M224,196h-4V40a12,12,0,0,0-12-12H152a12,12,0,0,0-12,12V76H96A12,12,0,0,0,84,88v36H48a12,12,0,0,0-12,12v60H32a12,12,0,0,0,0,24H224a12,12,0,0,0,0-24ZM164,52h32V196H164Zm-56,48h32v96H108ZM60,148H84v48H60Z" />
    </Icon>
  );
}

export function ShieldCheck({ size, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M208,36H48A20,20,0,0,0,28,56v56c0,54.29,26.32,87.22,48.4,105.29,23.71,19.39,47.44,26,48.44,26.29a12.1,12.1,0,0,0,6.32,0c1-.28,24.73-6.9,48.44-26.29,22.08-18.07,48.4-51,48.4-105.29V56A20,20,0,0,0,208,36Zm-4,76c0,35.71-13.09,64.69-38.91,86.15A126.28,126.28,0,0,1,128,219.38a126.14,126.14,0,0,1-37.09-21.23C65.09,176.69,52,147.71,52,112V60H204ZM79.51,144.49a12,12,0,1,1,17-17L112,143l47.51-47.52a12,12,0,0,1,17,17l-56,56a12,12,0,0,1-17,0Z" />
    </Icon>
  );
}
