import React from "react";
const paths = {
  stamp: (
    <path d="M5 3c0 2-2 2-2 2v4c2 0 2 2 0 2v4c2 0 2 2 0 2v4h4c0-2 2-2 2 0h4c0-2 2-2 2 0h4v-4c-2 0-2-2 0-2v-4c-2 0-2-2 0-2V5c-2 0-2-2-2-2h-4c0 2-2 2-2 0H5Z" />
  ),
  play: <path d="m8 4 12 8-12 8Z" />,
  pause: (
    <>
      <path d="M8 4v16M16 4v16" />
    </>
  ),
  folder: <path d="M3 6h7l2 3h9v11H3ZM3 6V4h7l2 2" />,
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  export: (
    <>
      <path d="M12 16V2m-5 5 5-5 5 5M4 13v8h16v-8" />
    </>
  ),
  thumb: <path d="M8 21H3V10h5m0 11h10l3-10-1-2h-7V4l-2-2-3 8Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5h4" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
    </>
  ),
  back: <path d="m10 5-7 7 7 7m-7-7h18" />,
  full: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />,
  edit: <path d="m15 3 6 6-11 11-7 1 1-7ZM12 6l6 6" />,
  check: <path d="m4 12 5 5L20 6" />,
};
export default function Icon({ name, size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.stamp}
    </svg>
  );
}
