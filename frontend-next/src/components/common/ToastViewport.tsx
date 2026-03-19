import { useEffect } from 'react'
import { useToastStore } from '../../store/toastStore'
import styles from './ToastViewport.module.css'

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  useEffect(() => {
    if (toasts.length === 0) {
      return
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        removeToast(toast.id)
      }, 3500),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [toasts, removeToast])

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className={styles.viewport}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
          <span>{toast.message}</span>
          <button className={styles.close} type="button" onClick={() => removeToast(toast.id)}>
            x
          </button>
        </div>
      ))}
    </div>
  )
}
