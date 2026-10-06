import React from 'react';
import {
  Utensils,
  ShoppingBag,
  Fuel,
  Car,
  Package,
  HeartPulse,
  Receipt,
  Film,
  MoreHorizontal,
  CreditCard,
  Smartphone,
  AlertCircle,
  HelpCircle,
  LucideIcon
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Utensils,
  ShoppingBag,
  Fuel,
  Car,
  Package,
  HeartPulse,
  Receipt,
  Film,
  MoreHorizontal,
  CreditCard,
  Smartphone,
  AlertCircle,
};

export function CategoryIcon({ name, className = 'w-5 h-5' }: { name?: string; className?: string }) {
  if (!name) return <HelpCircle className={className} />;
  const IconComponent = iconMap[name] || MoreHorizontal;
  return <IconComponent className={className} />;
}
