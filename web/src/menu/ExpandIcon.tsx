/**
 * ExpandIcon component for collapsible menus.
 * Shows two small chevrons stacked vertically.
 * When closed: chevrons face away (up/down)
 * When opened: chevrons rotate inward to face each other (both point to center)
 */

import { CaretUp, CaretDown } from '@phosphor-icons/react';
import './ExpandIcon.css';

interface ExpandIconProps {
  isExpanded: boolean;
  size?: number;
}

export function ExpandIcon({ isExpanded, size = 10 }: ExpandIconProps) {
  return (
    <div className="expand-icon">
      <CaretUp
        size={size}
        weight="bold"
        className={`expand-icon-top ${isExpanded ? 'rotated' : ''}`}
      />
      <CaretDown
        size={size}
        weight="bold"
        className={`expand-icon-bottom ${isExpanded ? 'rotated' : ''}`}
      />
    </div>
  );
}
