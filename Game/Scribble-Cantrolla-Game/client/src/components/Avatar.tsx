import React, { useState, useEffect, useId } from 'react';

export interface AvatarConfig {
  color: number;
  eyes: number;
  mouth: number;
  pose: number;
}

export const AVATAR_COLORS = [
  { name: 'Coral', base: '#FF6B5B', stripe: '#ff8a7d', outline: '#2E2A3D', bg: '#FFFBF2' },
  { name: 'Sky', base: '#3FC1C9', stripe: '#68d5dc', outline: '#2E2A3D', bg: '#FFFBF2' },
  { name: 'Sun', base: '#FFC93C', stripe: '#ffd56b', outline: '#2E2A3D', bg: '#FFFBF2' },
  { name: 'Grape', base: '#9B72E8', stripe: '#b494ee', outline: '#2E2A3D', bg: '#FFFBF2' },
  { name: 'Leaf', base: '#4CAF7D', stripe: '#70c598', outline: '#2E2A3D', bg: '#FFFBF2' },
  { name: 'Pink', base: '#F2789F', stripe: '#f59cb8', outline: '#2E2A3D', bg: '#FFFBF2' },
];

export const EYES_NAMES = [
  'Big Eyes (Classic)',
  'Cool Sunglasses',
  'Cheeky Wink',
  'Cute Sparkle',
  'Angry Brows',
  'Googly Derp',
  'Hypno Dizzy',
  'Anime Tears',
];

export const MOUTH_NAMES = [
  'Tooth Smile',
  'Curved Smile',
  'Wide Grin',
  'Tongue Out',
  'Shocked O',
  'Mustache Smile',
  'Vampire Fangs',
  'Bubblegum Pop',
];

export const POSE_NAMES = [
  'Classic Blob',
  'Party Cone Hat',
  'Superhero Cape',
  'Royal Crown',
  'Ninja Headband',
  'Disco Headphones',
];

export const EYES_COUNT = EYES_NAMES.length;
export const MOUTH_COUNT = MOUTH_NAMES.length;
export const POSE_COUNT = POSE_NAMES.length;

export function parseAvatarConfig(str: string): AvatarConfig {
  if (!str) return { color: 0, eyes: 0, mouth: 0, pose: 0 };
  if (str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str);
      return {
        color: parsed.color || 0,
        eyes: parsed.eyes || 0,
        mouth: parsed.mouth || 0,
        pose: parsed.pose || 0,
      };
    } catch (e) {
      /* ignore */
    }
  }
  if (str.includes('|')) {
    const parts = str.split('|');
    const color = parseInt(parts[0]?.split(':')[1] || '0', 10);
    const eyes = parseInt(parts[1]?.split(':')[1] || '0', 10);
    const mouth = parseInt(parts[2]?.split(':')[1] || '0', 10);
    const pose = parseInt(parts[3]?.split(':')[1] || '0', 10);
    return {
      color: isNaN(color) ? 0 : Math.abs(color) % AVATAR_COLORS.length,
      eyes: isNaN(eyes) ? 0 : Math.abs(eyes) % EYES_COUNT,
      mouth: isNaN(mouth) ? 0 : Math.abs(mouth) % MOUTH_COUNT,
      pose: isNaN(pose) ? 0 : Math.abs(pose) % POSE_COUNT,
    };
  }
  return { color: 0, eyes: 0, mouth: 0, pose: 0 };
}

export function serializeAvatarConfig(config: AvatarConfig): string {
  return `c:${config.color}|e:${config.eyes}|m:${config.mouth}|p:${config.pose || 0}`;
}

interface AvatarProps {
  avatar: string | AvatarConfig;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  animated?: boolean;
  className?: string;
  showBackground?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  avatar,
  size = 'md',
  animated = true,
  className = '',
  showBackground = true,
}) => {
  const [frame, setFrame] = useState<0 | 1>(0);
  const patternId = useId().replace(/:/g, '');

  const config: AvatarConfig =
    typeof avatar === 'string' ? parseAvatarConfig(avatar) : { pose: 0, ...avatar };

  const colorScheme = AVATAR_COLORS[config.color % AVATAR_COLORS.length] || AVATAR_COLORS[0];

  useEffect(() => {
    if (!animated) return;
    const interval = setInterval(() => {
      setFrame((prev) => (prev === 0 ? 1 : 0));
    }, 260);
    return () => clearInterval(interval);
  }, [animated]);

  let pixelSize = 64;
  if (typeof size === 'number') {
    pixelSize = size;
  } else {
    switch (size) {
      case 'xs': pixelSize = 28; break;
      case 'sm': pixelSize = 40; break;
      case 'md': pixelSize = 64; break;
      case 'lg': pixelSize = 96; break;
      case 'xl': pixelSize = 140; break;
    }
  }

  const bounceY = frame === 1 ? 1 : 0;
  const mouthShiftY = frame === 1 ? 1 : 0;

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-2xl select-none ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        backgroundColor: showBackground ? colorScheme.bg : 'transparent',
      }}
    >
      <svg
        viewBox="0 0 32 32"
        className="w-full h-full"
        style={{ shapeRendering: 'crispEdges' }}
      >
        <defs>
          <pattern
            id={`avatar-stripes-${patternId}`}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="2" height="4" fill={colorScheme.base} />
            <rect x="2" width="2" height="4" fill={colorScheme.stripe} />
          </pattern>
        </defs>

        <g transform={`translate(0, ${bounceY})`}>
          {/* POSE / BACK ACCESSORIES */}
          {renderBackPose(config.pose, frame)}

          {/* BODY OUTLINE */}
          <path
            d="
              M 11 12 H 21 V 13 H 23 V 15 H 24 V 20 H 23 V 22 H 21 V 24 H 25 V 25 H 28 V 29 H 4 V 25 H 7 V 24 H 11 V 22 H 9 V 20 H 8 V 15 H 9 V 13 H 11 Z
            "
            fill="#2E2A3D"
          />

          {/* BODY & HEAD FILL WITH DIAGONAL STRIPES */}
          <path
            d="
              M 12 13 H 20 V 14 H 22 V 16 H 23 V 19 H 22 V 21 H 20 V 23 H 12 V 21 H 10 V 19 H 9 V 16 H 10 V 14 H 12 Z
              M 8 25 H 24 V 28 H 8 Z
            "
            fill={`url(#avatar-stripes-${patternId})`}
          />

          {/* EYES LAYER */}
          {renderEyes(config.eyes, frame)}

          {/* MOUTH LAYER */}
          <g transform={`translate(0, ${mouthShiftY})`}>
            {renderMouth(config.mouth, frame)}
          </g>

          {/* FRONT POSE / HEAD ACCESSORIES */}
          {renderFrontPose(config.pose, frame)}
        </g>
      </svg>
    </div>
  );
};

// Render Back Accessories (e.g. Cape)
function renderBackPose(poseIndex: number, frame: number) {
  const idx = Math.abs(poseIndex || 0) % POSE_COUNT;
  if (idx === 2) {
    // Superhero Cape (Waving)
    return (
      <g>
        <path
          d={frame === 0 ? "M 5 20 H 9 V 29 H 3 Z M 23 20 H 27 V 29 H 29 Z" : "M 4 21 H 9 V 29 H 2 Z M 23 21 H 28 V 29 H 30 Z"}
          fill="#FF6B5B"
        />
        <path
          d={frame === 0 ? "M 4 20 H 5 V 29 H 4 Z M 27 20 H 28 V 29 H 27 Z" : "M 3 21 H 4 V 29 H 3 Z M 28 21 H 29 V 29 H 28 Z"}
          fill="#2E2A3D"
        />
      </g>
    );
  }
  return null;
}

// Render Front Accessories (Hats, Headbands, Headphones)
function renderFrontPose(poseIndex: number, frame: number) {
  const idx = Math.abs(poseIndex || 0) % POSE_COUNT;
  switch (idx) {
    case 1:
      // Party Cone Hat
      return (
        <g>
          {/* Hat body */}
          <path d="M 16 3 L 20 12 H 12 Z" fill="#FF6B5B" />
          {/* Yellow stripes */}
          <path d="M 15 6 H 17 V 7 H 15 Z M 14 9 H 18 V 10 H 14 Z" fill="#FFC93C" />
          {/* Outline */}
          <path d="M 16 2 L 15 3 L 11 12 H 21 L 17 3 Z" fill="none" stroke="#2E2A3D" strokeWidth="1" />
          {/* Pompom */}
          <circle cx="16" cy="2" r="1.5" fill="#FFC93C" />
        </g>
      );
    case 3:
      // Royal Crown
      return (
        <g fill="#FFC93C">
          <path d="M 11 8 H 21 V 12 H 11 Z" />
          <path d="M 11 7 H 13 V 9 H 11 Z M 15 6 H 17 V 9 H 15 Z M 19 7 H 21 V 9 H 19 Z" />
          {/* Red Jewels */}
          <rect x="12" y="10" width="2" height="1" fill="#FF6B5B" />
          <rect x="18" y="10" width="2" height="1" fill="#FF6B5B" />
        </g>
      );
    case 4:
      // Ninja Headband
      return (
        <g>
          <rect x="10" y="13" width="12" height="2" fill="#FF6B5B" />
          <rect x="15" y="13" width="2" height="2" fill="#FFFFFF" />
          {/* Flapping Tails */}
          <path d={frame === 0 ? "M 22 13 H 26 V 15 H 22 Z M 24 15 H 27 V 17 H 24 Z" : "M 22 13 H 26 V 14 H 22 Z M 24 14 H 28 V 16 H 24 Z"} fill="#FF6B5B" />
        </g>
      );
    case 5:
      // Disco Headphones
      return (
        <g fill="#9B72E8">
          <path d="M 9 10 H 23 V 12 H 9 Z" />
          <rect x="8" y="12" width="3" height="6" fill="#3FC1C9" />
          <rect x="21" y="12" width="3" height="6" fill="#3FC1C9" />
          <rect x="9" y="13" width="1" height="4" fill="#2E2A3D" />
          <rect x="22" y="13" width="1" height="4" fill="#2E2A3D" />
        </g>
      );
    default:
      return null;
  }
}

// Render Pixel Art Eyes (8 variants)
function renderEyes(eyesIndex: number, frame: number) {
  const idx = Math.abs(eyesIndex) % EYES_COUNT;
  switch (idx) {
    case 0:
      // Big Oval Black Pixel Eyes
      return (
        <g fill="#2E2A3D">
          <path d="M 12 15 H 15 V 19 H 12 Z M 13 14 H 14 V 15 H 13 Z M 13 19 H 14 V 20 H 13 Z" />
          <path d="M 17 15 H 20 V 19 H 17 Z M 18 14 H 19 V 15 H 18 Z M 18 19 H 19 V 20 H 18 Z" />
        </g>
      );
    case 1:
      // Cool Pixel Sunglasses
      return (
        <g fill="#2E2A3D">
          <path d="M 10 15 H 22 V 18 H 10 Z" />
          <path d="M 11 18 H 15 V 19 H 11 Z" />
          <path d="M 17 18 H 21 V 19 H 17 Z" />
          <rect x="12" y="16" width="2" height="1" fill="#ffffff" />
          <rect x="18" y="16" width="2" height="1" fill="#ffffff" />
        </g>
      );
    case 2:
      // Wink Eyes
      return (
        <g fill="#2E2A3D">
          <rect x="12" y="15" width="3" height="4" />
          <rect x="13" y="16" width="1" height="1" fill="#ffffff" />
          <path d="M 17 17 H 21 V 18 H 17 Z M 18 16 H 20 V 17 H 18 Z M 18 18 H 20 V 19 H 18 Z" />
        </g>
      );
    case 3:
      // Cute Sparkle Round Eyes
      return (
        <g fill="#2E2A3D">
          <rect x="11" y="15" width="4" height="4" />
          <rect x="17" y="15" width="4" height="4" />
          <rect x="13" y="15" width="1.5" height="1.5" fill="#ffffff" />
          <rect x="19" y="15" width="1.5" height="1.5" fill="#ffffff" />
        </g>
      );
    case 4:
      // Angry Eyebrows & Eyes
      return (
        <g fill="#2E2A3D">
          <path d="M 11 14 H 15 V 15 H 11 Z M 12 15 H 15 V 18 H 12 Z" />
          <path d="M 17 14 H 21 V 15 H 17 Z M 17 15 H 20 V 18 H 17 Z" />
        </g>
      );
    case 5:
      // Googly Derp Eyes
      return (
        <g fill="#2E2A3D">
          <rect x="11" y="15" width="4" height="4" />
          <rect x="17" y="15" width="4" height="4" />
          <rect x="13" y="17" width="2" height="2" fill="#ffffff" />
          <rect x="17" y="15" width="2" height="2" fill="#ffffff" />
        </g>
      );
    case 6:
      // Hypno Dizzy Spiral Eyes
      return (
        <g fill="#9B72E8">
          <rect x="11" y="15" width="4" height="4" />
          <rect x="17" y="15" width="4" height="4" />
          <rect x="12" y="16" width="2" height="2" fill="#FFC93C" />
          <rect x="18" y="16" width="2" height="2" fill="#FFC93C" />
        </g>
      );
    case 7:
      // Anime Tears Eyes
      return (
        <g>
          <rect x="11" y="15" width="4" height="3" fill="#2E2A3D" />
          <rect x="17" y="15" width="4" height="3" fill="#2E2A3D" />
          <path d={frame === 0 ? "M 12 18 H 14 V 21 H 12 Z M 18 18 H 20 V 21 H 18 Z" : "M 12 19 H 14 V 22 H 12 Z M 18 19 H 20 V 22 H 18 Z"} fill="#3FC1C9" />
        </g>
      );
    default:
      return null;
  }
}

// Render Pixel Art Mouth (8 variants)
function renderMouth(mouthIndex: number, frame: number) {
  const idx = Math.abs(mouthIndex) % MOUTH_COUNT;
  switch (idx) {
    case 0:
      // Big Open Smile with Single Pixel Tooth
      return (
        <g>
          <path d="M 12 21 H 20 V 24 H 12 Z" fill="#2E2A3D" />
          <rect x="15" y="21" width="2" height="1.5" fill="#ffffff" />
          {frame === 1 && <rect x="13" y="23" width="6" height="1" fill="#FF6B5B" />}
        </g>
      );
    case 1:
      // Curved Pixel Smile
      return (
        <g fill="#2E2A3D">
          <path d="M 12 21 H 20 V 22 H 12 Z M 13 22 H 19 V 23 H 13 Z M 14 23 H 18 V 24 H 14 Z" />
        </g>
      );
    case 2:
      // Wide Grin with Teeth
      return (
        <g fill="#2E2A3D">
          <rect x="12" y="21" width="8" height="3" />
          <rect x="13" y="22" width="6" height="1" fill="#ffffff" />
        </g>
      );
    case 3:
      // Tongue Out Mouth
      return (
        <g>
          <path d="M 13 21 H 19 V 23 H 13 Z" fill="#2E2A3D" />
          <path d="M 15 22 H 18 V 25 H 15 Z" fill="#FF6B5B" />
        </g>
      );
    case 4:
      // Small 'O' Shocked Mouth
      return (
        <g fill="#2E2A3D">
          <rect x="14" y="21" width="4" height="3" />
          <rect x="15" y="22" width="2" height="1" fill="#ffffff" />
        </g>
      );
    case 5:
      // Mustache & Smile
      return (
        <g fill="#2E2A3D">
          <path d="M 11 20 H 21 V 21 H 11 Z M 13 21 H 19 V 22 H 13 Z" />
          <path d="M 14 22 H 18 V 24 H 14 Z" />
        </g>
      );
    case 6:
      // Vampire Fangs
      return (
        <g fill="#2E2A3D">
          <rect x="12" y="21" width="8" height="3" />
          <polygon points="13,22 14,24 15,22" fill="#ffffff" />
          <polygon points="17,22 18,24 19,22" fill="#ffffff" />
        </g>
      );
    case 7:
      // Bubblegum Pop
      return (
        <g>
          <path d="M 13 21 H 19 V 22 H 13 Z" fill="#2E2A3D" />
          <circle cx="16" cy="23" r={frame === 0 ? 3 : 3.8} fill="#F2789F" stroke="#2E2A3D" strokeWidth="0.8" />
        </g>
      );
    default:
      return null;
  }
}
