'use client';

import React, { useState } from 'react';
import { Bell, X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { InAppNotification } from '@/types/database';

interface NotificationCenterProps {
  notifications: InAppNotification[];
  onDismiss?: (id: string) => void;
}

export function NotificationCenter({ notifications, onDismiss }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
        aria-label="View notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-zinc-950">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              In-App Alerts Center
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-zinc-400 hover:text-zinc-200 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                All caught up! No active budget alerts.
              </p>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 rounded-xl border text-xs flex gap-3 items-start relative transition ${
                    notif.type === 'danger'
                      ? 'bg-red-950/30 border-red-800/40 text-red-200'
                      : notif.type === 'warning'
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-200'
                      : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-200'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {notif.type === 'danger' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                    {notif.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    {notif.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
                  </div>
                  <div className="flex-1 pr-4">
                    <p className="font-semibold text-zinc-100">{notif.title}</p>
                    <p className="mt-0.5 text-zinc-300 leading-relaxed">{notif.message}</p>
                    <span className="text-[10px] text-zinc-500 mt-1 block">{notif.date}</span>
                  </div>
                  {onDismiss && (
                    <button
                      onClick={() => onDismiss(notif.id)}
                      className="text-zinc-500 hover:text-zinc-300 absolute top-2 right-2"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
