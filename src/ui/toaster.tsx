import { Toast, ToastDescription, ToastRegion, ToastTitle, createToaster } from '@ui-sdk/react/toast'

/** Ein Toaster für die ganze App */
export const toast = createToaster({ duration: 4000 })

export function Toasts() {
  return (
    <ToastRegion toaster={toast} className="toasts">
      {() => (
        <Toast className="toast">
          <ToastTitle className="toast-title" />
          <ToastDescription className="toast-desc" />
        </Toast>
      )}
    </ToastRegion>
  )
}
