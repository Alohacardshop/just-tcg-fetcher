import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createPortal } from 'react-dom';

interface SelectWithPortalProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function SelectWithPortal({ 
  value, 
  onValueChange, 
  placeholder, 
  children, 
  disabled,
  className 
}: SelectWithPortalProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      {createPortal(
        <SelectContent 
          position="popper" 
          className="z-[70] bg-background border border-border shadow-lg"
        >
          {children}
        </SelectContent>,
        document.body
      )}
    </Select>
  );
}

export { SelectItem };