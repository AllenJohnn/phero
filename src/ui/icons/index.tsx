import React from 'react';

/**
 * PHERO Brand Logo — Concept 1: The Geometric Phi Axis (Φ / φέρω)
 * Represents continuous transit, carriage, and movement forward.
 */
export const PheroLogo: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Central Transit Conduit (The Meridian) */}
    <line
      x1="12"
      y1="2.5"
      x2="12"
      y2="21.5"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    {/* Geometric Carriage Ring */}
    <circle
      cx="12"
      cy="12"
      r="6.8"
      stroke="currentColor"
      strokeWidth="2.2"
    />
  </svg>
);

/**
 * Authentic Claude Brand Glyph
 */
export const ClaudeLogo: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M13.8 3.5L12 9.2L10.2 3.5C10.1 3.2 9.7 3 9.4 3.1C9.1 3.2 8.9 3.5 9 3.8L10.6 9.8L4.8 7.6C4.5 7.5 4.1 7.7 4 8C3.9 8.3 4.1 8.7 4.4 8.8L10.2 11.2L4.6 13.9C4.3 14 4.1 14.4 4.3 14.7C4.4 15 4.8 15.2 5.1 15L10.7 12.6L8.8 18.4C8.7 18.7 8.9 19.1 9.2 19.2C9.5 19.3 9.9 19.1 10 18.8L12 13L13.8 18.8C13.9 19.1 14.3 19.3 14.6 19.2C14.9 19.1 15.1 18.7 15 18.4L13.1 12.6L18.7 15C19 15.2 19.4 15 19.5 14.7C19.6 14.4 19.4 14 19.1 13.9L13.5 11.2L19.3 8.8C19.6 8.7 19.8 8.3 19.7 8C19.6 7.7 19.2 7.5 18.9 7.6L13.1 9.8L14.7 3.8C14.8 3.5 14.6 3.2 14.3 3.1C14.1 3 13.9 3.2 13.8 3.5Z"
      fill="#D97706"
    />
  </svg>
);

/**
 * Authentic ChatGPT Brand Glyph
 */
export const ChatGPTLogo: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M20.5 10.2C20.2 8.3 18.8 6.8 17 6.3V5.5C17 3.6 15.4 2 13.5 2C12.3 2 11.2 2.6 10.5 3.6C9.9 3.2 9.1 3 8.3 3C6.4 3 4.8 4.6 4.8 6.5V7C3.1 7.7 2 9.3 2 11.2C2 12.7 2.8 14 4.1 14.7V15.5C4.1 17.4 5.7 19 7.6 19C8.8 19 9.9 18.4 10.6 17.4C11.2 17.8 12 18 12.8 18C14.7 18 16.3 16.4 16.3 14.5V14C18 13.3 19.1 11.7 19.1 9.8L20.5 10.2Z"
      stroke="#10A37F"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="11.5" cy="10.5" r="2.5" fill="#10A37F" />
  </svg>
);

/**
 * Authentic Gemini Brand Glyph
 */
export const GeminiLogo: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z"
      fill="#1A73E8"
    />
  </svg>
);

/**
 * Precision Directional Transit Arrow
 */
export const TransitArrow: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const SpinnerIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`animate-spin ${className}`}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const CheckIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const AlertIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export const CopyIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
