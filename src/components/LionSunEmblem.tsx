import React from 'react';
import logoImg from '../assets/images/lion_sun_logo_1791155327068.jpg';

interface LionSunEmblemProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LionSunEmblem: React.FC<LionSunEmblemProps> = ({
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-9 w-9',
    md: 'h-12 w-12',
    lg: 'h-24 w-24',
  }[size];

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full p-0.5 bg-gradient-to-tr from-amber-600 via-amber-300 to-amber-500 shadow-md shadow-amber-500/20 ${sizeClasses} ${className}`}
    >
      <img
        src={logoImg}
        alt="شیر و خورشید"
        className="h-full w-full rounded-full object-cover"
      />
    </div>
  );
};
