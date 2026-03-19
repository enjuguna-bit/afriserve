import { useState } from 'react'
import { downloadReport } from '../../../services/reportService'
import { useToastStore } from '../../../store/toastStore'
import { downloadBlob } from '../../../utils/fileDownload'
import styles from '../pages/ReportsPage.module.css'

type ExportFormat = 'csv' | 'pdf' | 'xlsx'

type ReportExportActionsProps = {
  endpoint: string
  params: Record<string, unknown>
  label: string
}

function normalizeReportPathLabel(endpoint: string): string {
  const normalized = String(endpoint || '').trim()
  if (!normalized) {
    return '/reports/portfolio'
  }
  if (normalized.startsWith('/api/')) {
    return normalized.slice(4)
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export function ReportExportActions({ endpoint, params, label }: ReportExportActionsProps) {
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)
  const pushToast = useToastStore((state) => state.pushToast)

  async function handleExport(format: ExportFormat) {
    try {
      setExportingFormat(format)
      const { blob, filename } = await downloadReport(endpoint, params, format)
      const reportPath = normalizeReportPathLabel(endpoint)
      const safeBase = String(reportPath).split('/').filter(Boolean).join('-') || 'report'
      downloadBlob(blob, filename || `${safeBase}.${format}`)
      pushToast({ type: 'success', message: `Report exported (${format.toUpperCase()}).` })
    } catch {
      pushToast({ type: 'error', message: `Unable to export ${label}.` })
    } finally {
      setExportingFormat(null)
    }
  }

  return (
    <div className={styles.exportGroup}>
      <button title="Export to CSV" type="button" disabled={exportingFormat !== null} onClick={() => void handleExport('csv')}>
        CSV
      </button>
      <button title="Export for Excel" type="button" disabled={exportingFormat !== null} onClick={() => void handleExport('xlsx')}>
        XLSX
      </button>
      <button title="Export to Document" type="button" disabled={exportingFormat !== null} onClick={() => void handleExport('pdf')}>
        PDF
      </button>
    </div>
  )
}
