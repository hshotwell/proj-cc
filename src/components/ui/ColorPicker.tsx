'use client';

import { useState, useRef, useCallback } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

// Convert HSL to hex
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Convert hex to HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 100, l: 50 };

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { h: initialH, s: initialS } = hexToHsl(value);
  const [hue, setHue] = useState(initialH);
  const [saturation, setSaturation] = useState(Math.max(initialS, 50)); // Minimum 50% saturation

  const hueRingRef = useRef<HTMLDivElement>(null);
  const satSliderRef = useRef<HTMLDivElement>(null);

  const updateColor = useCallback((newHue: number, newSat: number) => {
    // Keep lightness at 50% for vibrant colors, enforce minimum saturation
    const clampedSat = Math.max(50, Math.min(100, newSat));
    const hex = hslToHex(newHue, clampedSat, 50);
    onChange(hex);
  }, [onChange]);

  const handleHueChange = useCallback((clientX: number, clientY: number) => {
    if (!hueRingRef.current) return;
    const rect = hueRingRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - centerY, clientX - centerX);
    const newHue = ((angle * 180 / Math.PI) + 90 + 360) % 360;
    setHue(newHue);
    updateColor(newHue, saturation);
  }, [saturation, updateColor]);

  const handleSaturationChange = useCallback((clientX: number) => {
    if (!satSliderRef.current) return;
    const rect = satSliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    // Map to 50-100% saturation range (no grays)
    const newSat = 50 + (x / rect.width) * 50;
    setSaturation(newSat);
    updateColor(hue, newSat);
  }, [hue, updateColor]);

  const handleHueMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    handleHueChange(e.clientX, e.clientY);

    const handleMouseMove = (e: MouseEvent) => handleHueChange(e.clientX, e.clientY);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSatMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    handleSaturationChange(e.clientX);

    const handleMouseMove = (e: MouseEvent) => handleSaturationChange(e.clientX);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Calculate indicator position on hue ring
  const hueAngle = (hue - 90) * (Math.PI / 180);
  const ringRadius = 44; // Half of the ring size minus some padding
  const hueX = Math.cos(hueAngle) * ringRadius;
  const hueY = Math.sin(hueAngle) * ringRadius;

  // Saturation slider position (0-100% of width, but represents 50-100% saturation)
  const satPosition = ((saturation - 50) / 50) * 100;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-7 h-7 rounded-full border-2 border-white shadow flex items-center justify-center ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110 cursor-pointer'
        }`}
        style={{
          background: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
        title="Pick custom color"
      >
        <span className="text-white text-xs font-bold drop-shadow-md">+</span>
      </button>

      {/* Dropdown picker */}
      {isOpen && !disabled && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Picker panel */}
          <div className="absolute z-50 top-full mt-2 right-0 bg-white rounded-xl shadow-xl p-4 border border-gray-200">
            {/* Hue ring */}
            <div
              ref={hueRingRef}
              className="relative w-28 h-28 rounded-full cursor-crosshair mx-auto"
              style={{
                background: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
              }}
              onMouseDown={handleHueMouseDown}
            >
              {/* Inner circle (hole) */}
              <div
                className="absolute inset-4 rounded-full bg-white"
                style={{ pointerEvents: 'none' }}
              />
              {/* Current color preview in center */}
              <div
                className="absolute inset-6 rounded-full shadow-inner"
                style={{ backgroundColor: value, pointerEvents: 'none' }}
              />
              {/* Hue indicator */}
              <div
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md"
                style={{
                  backgroundColor: hslToHex(hue, 100, 50),
                  left: `calc(50% + ${hueX}px - 8px)`,
                  top: `calc(50% + ${hueY}px - 8px)`,
                  pointerEvents: 'none',
                }}
              />
            </div>

            {/* Saturation slider */}
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-1 text-center">Saturation</div>
              <div
                ref={satSliderRef}
                className="h-4 rounded-full cursor-pointer relative"
                style={{
                  background: `linear-gradient(to right, ${hslToHex(hue, 50, 50)}, ${hslToHex(hue, 100, 50)})`,
                }}
                onMouseDown={handleSatMouseDown}
              >
                {/* Slider thumb */}
                <div
                  className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -top-0"
                  style={{
                    backgroundColor: value,
                    left: `calc(${satPosition}% - 8px)`,
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>

            {/* Done button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="mt-3 w-full py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}
