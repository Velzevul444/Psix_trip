import { useEffect, useRef } from 'react';

export function useLibraryDepthEffect(enabled, itemsCount) {
  const listRef = useRef(null);
  const frameRef = useRef(0);

  const updateDepthEffect = () => {
    const list = listRef.current;

    if (!list) return;

    const listRect = list.getBoundingClientRect();
    const listCenterY = listRect.top + listRect.height / 2;
    const halfHeight = Math.max(listRect.height / 2, 1);
    const items = Array.from(list.querySelectorAll('.library-item'));

    const measurements = items.map((item) => {
      const itemRect = item.getBoundingClientRect();
      const itemCenterY = itemRect.top + itemRect.height / 2;
      const normalizedDistance = (itemCenterY - listCenterY) / halfHeight;
      const clampedDistance = Math.max(-1.2, Math.min(1.2, normalizedDistance));
      const distanceAbs = Math.min(1, Math.abs(clampedDistance));

      return {
        item,
        clampedDistance,
        distanceAbs
      };
    });

    const sortedByDistance = [...measurements].sort((left, right) => left.distanceAbs - right.distanceAbs);
    const thirdClosestDistance = sortedByDistance[Math.min(2, sortedByDistance.length - 1)]?.distanceAbs ?? 0;
    const focusZone = Math.min(0.64, Math.max(0.26, thirdClosestDistance + 0.05));

    measurements.forEach(({ item, clampedDistance, distanceAbs }) => {
      const frontPresence = distanceAbs < focusZone ? 1 - distanceAbs / focusZone : 0;
      const beyondFocus = Math.max(0, distanceAbs - focusZone);
      const normalizedBeyondFocus = beyondFocus / Math.max(1 - focusZone, 0.001);
      const curvedDistance = 1 - Math.pow(1 - normalizedBeyondFocus, 1.7);
      const shiftX = 0;
      const shiftY = clampedDistance * 3 + Math.sign(clampedDistance || 1) * curvedDistance * 12;
      const depth = Math.round(frontPresence * 42) - Math.round(curvedDistance * 255);
      const scale = Math.max(0.89, 1 + frontPresence * 0.03 - curvedDistance * 0.11);
      const tilt = `${clampedDistance * -5.2 * (1 - frontPresence * 0.55)}deg`;
      const opacity = Math.max(0.66, 0.86 + frontPresence * 0.16 - curvedDistance * 0.18);
      const blur = `${curvedDistance * 0.45}px`;
      const saturate = (0.96 + frontPresence * 0.08 - curvedDistance * 0.06).toFixed(3);
      const brightness = (0.98 + frontPresence * 0.08 - curvedDistance * 0.05).toFixed(3);
      const shadowAlpha = (0.18 + frontPresence * 0.08 + (1 - curvedDistance) * 0.12).toFixed(3);

      item.style.setProperty('--wave-shift-x', `${shiftX.toFixed(2)}px`);
      item.style.setProperty('--wave-shift-y', `${shiftY.toFixed(2)}px`);
      item.style.setProperty('--wave-depth', `${depth}px`);
      item.style.setProperty('--wave-scale', scale.toFixed(3));
      item.style.setProperty('--wave-tilt', tilt);
      item.style.setProperty('--wave-opacity', opacity.toFixed(3));
      item.style.setProperty('--wave-blur', blur);
      item.style.setProperty('--wave-saturate', saturate);
      item.style.setProperty('--wave-brightness', brightness);
      item.style.setProperty('--wave-shadow-alpha', shadowAlpha);
      item.style.setProperty('--wave-z-index', String(1000 - Math.round(distanceAbs * 400)));
    });
  };

  const scheduleDepthEffect = () => {
    if (typeof window === 'undefined' || frameRef.current) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      updateDepthEffect();
    });
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    scheduleDepthEffect();
  }, [enabled, itemsCount]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      scheduleDepthEffect();
    };

    window.addEventListener('resize', handleResize);
    scheduleDepthEffect();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return {
    listRef,
    scheduleDepthEffect
  };
}
