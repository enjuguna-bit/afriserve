import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'
import { useCreateRepayment, useLoanStatement } from '../hooks/useLoans'
import styles from './RepaymentPage.module.css'

export function RepaymentPage() {
  const { id } = useParams()
  const loanId = Number(id)
  const navigate = useNavigate()
  const pushToast = useToastStore((state) => state.pushToast)
  const statementQuery = useLoanStatement(loanId)
  const repaymentMutation = useCreateRepayment(loanId)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [paymentChannel, setPaymentChannel] = useState('manual')
  const [paymentProvider, setPaymentProvider] = useState('')
  const [externalReceipt, setExternalReceipt] = useState('')
  const [externalReference, setExternalReference] = useState('')
  const [payerPhone, setPayerPhone] = useState('')

  const [hasSetDefault, setHasSetDefault] = useState(false)

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return <p>Invalid loan ID.</p>
  }

  const statement = statementQuery.data

  if (statement && !hasSetDefault) {
    setAmount(String(Number(statement.loan.balance || 0).toFixed(2)))
    setHasSetDefault(true)
  }

  return (
    <div>
      <h1>Record Repayment</h1>
      <p>
        <Link to={`/loans/${loanId}`}>Back to loan detail</Link>
      </p>

      <AsyncState
        loading={statementQuery.isLoading}
        error={statementQuery.isError}
        loadingText="Loading loan balance..."
        errorText="Unable to load loan details."
        onRetry={() => {
          void statementQuery.refetch()
        }}
      />

      {statement ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            const parsedAmount = Number(amount)
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
              pushToast({ type: 'error', message: 'Repayment amount must be greater than 0.' })
              return
            }

            repaymentMutation.mutate(
              {
                amount: parsedAmount,
                note: note.trim() || undefined,
                paymentChannel,
                paymentProvider: paymentProvider.trim() || undefined,
                externalReceipt: externalReceipt.trim() || undefined,
                externalReference: externalReference.trim() || undefined,
                payerPhone: payerPhone.trim() || undefined,
              },
              {
                onSuccess: () => {
                  pushToast({ type: 'success', message: 'Repayment posted successfully.' })
                  void navigate(`/loans/${loanId}`)
                },
                onError: (error: any) => {
                  console.error('BACKEND REPAYMENT ERROR:', error?.response?.data || error.message)
                  pushToast({ type: 'error', message: 'Failed to post repayment.' })
                },
              },
            )
          }}
        >
          <p className={styles.subtle}>
            Current balance: <strong>{Number(statement.loan.balance || 0).toFixed(2)}</strong>
          </p>
          <label className={styles.field}>
            <span>Repayment amount</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Note (optional)</span>
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Any repayment note"
            />
          </label>
          <label className={styles.field}>
            <span>Payment channel</span>
            <select value={paymentChannel} onChange={(event) => setPaymentChannel(event.target.value)}>
              <option value="manual">Manual</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="mobile_money">Mobile money</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Payment provider (optional)</span>
            <input
              type="text"
              value={paymentProvider}
              onChange={(event) => setPaymentProvider(event.target.value)}
              placeholder="M-Pesa, Equity, Visa"
            />
          </label>
          <label className={styles.field}>
            <span>External receipt (optional)</span>
            <input
              type="text"
              value={externalReceipt}
              onChange={(event) => setExternalReceipt(event.target.value)}
              placeholder="Provider receipt or teller number"
            />
          </label>
          <label className={styles.field}>
            <span>External reference (optional)</span>
            <input
              type="text"
              value={externalReference}
              onChange={(event) => setExternalReference(event.target.value)}
              placeholder="Bank reference, statement ref, or account ref"
            />
          </label>
          <label className={styles.field}>
            <span>Payer phone (optional)</span>
            <input
              type="text"
              value={payerPhone}
              onChange={(event) => setPayerPhone(event.target.value)}
              placeholder="+2547..."
            />
          </label>
          <button type="submit" disabled={repaymentMutation.isPending}>
            {repaymentMutation.isPending ? 'Submitting...' : 'Submit repayment'}
          </button>
        </form>
      ) : null}
    </div>
  )
}
