export function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === 'undefined') {
    return
  }

  const objectUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()

  // Delay revocation so the browser can finish resolving the download.
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl)
  }, 30_000)
}
