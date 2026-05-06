import { useState, useRef, MouseEvent } from 'react';

export function useTilt(maxRotate = 10) {
  const ref = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const rotateX = ((y - centerY) / centerY) * -maxRotate;
    const rotateY = ((x - centerX) / centerX) * maxRotate;
    
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setRotate({ x: 0, y: 0 });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const style = {
    transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
    transition: isHovering ? "none" : "transform 0.5s ease",
    transformStyle: "preserve-3d" as const
  };

  const wrapperStyle = {
    perspective: "1000px"
  };

  return { ref, handleMouseMove, handleMouseEnter, handleMouseLeave, style, wrapperStyle, isHovering };
}
