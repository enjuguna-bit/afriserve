import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export type ToastItem = {
  id: number
  type: ToastType
  message: string
}

export type NotificationItem = ToastItem & {
  createdAt: string
  read: boolean
}

type ToastState = {
  toasts: ToastItem[]
  notifications: NotificationItem[]
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
  removeToast: (id: number) => void
  markAllNotificationsRead: () => void
  clearNotifications: () => void
}

let toastId = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  notifications: [],
  pushToast: (toast) =>
    set((state) => {
      const nextToast = { ...toast, id: ++toastId }
      const nextNotification: NotificationItem = {
        ...nextToast,
        createdAt: new Date().toISOString(),
        read: false,
      }

      const recentNotifications = [nextNotification, ...state.notifications].slice(0, 100)

      return {
        toasts: [...state.toasts, nextToast],
        notifications: recentNotifications,
      }
    }),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
    })),
  clearNotifications: () =>
    set(() => ({
      notifications: [],
    })),
}))
