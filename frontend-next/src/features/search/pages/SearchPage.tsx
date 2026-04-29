import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AsyncState } from '../../../components/common/AsyncState'
import { listClients } from '../../../services/clientService'
import { listLoans } from '../../../services/loanService'
import { prefetchClientWorkspace, prefetchLoanWorkspace } from '../../../services/prefetch'
import { queryPolicies } from '../../../services/queryPolicies'
import { listTransactions } from '../../../services/systemService'
import { useCommandMenuStore } from '../../../store/commandMenuStore'
import { formatDisplayDateTime } from '../../../utils/dateFormatting'
import { formatDisplayText, resolveDisplayText } from '../../../utils/displayFormatting'
import styles from '../../shared/styles/EntityPage.module.css'

export function SearchPage() {
  const queryClient = useQueryClient()
  const openCommandMenu = useCommandMenuStore((state) => state.open)
  const [input, setInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const trimmedTerm = useMemo(() => searchTerm.trim(), [searchTerm])
  const numericTerm = Number(trimmedTerm)
  const numericSearch = Number.isInteger(numericTerm) && numericTerm > 0 ? numericTerm : null

  const clientsQuery = useQuery({
    queryKey: ['search', 'clients', trimmedTerm],
    queryFn: () => listClients({
      search: trimmedTerm || undefined,
      limit: 20,
      offset: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    enabled: trimmedTerm.length >= 2,
    ...queryPolicies.list,
  })

  const loansQuery = useQuery({
    queryKey: ['search', 'loans', numericSearch],
    queryFn: () => listLoans({
      loanId: numericSearch || undefined,
      id: numericSearch || undefined,
      limit: 20,
      offset: 0,
      sortBy: 'id',
      sortOrder: 'desc',
    }),
    enabled: Boolean(numericSearch),
    ...queryPolicies.list,
  })

  const transactionsQuery = useQuery({
    queryKey: ['search', 'transactions', numericSearch],
    queryFn: () => listTransactions({
      loanId: numericSearch || undefined,
      clientId: numericSearch || undefined,
      limit: 20,
      offset: 0,
      sortBy: 'id',
      sortOrder: 'desc',
    }),
    enabled: Boolean(numericSearch),
    ...queryPolicies.list,
    retry: false,
  })

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchTerm(input)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Global Search</h1>
          <p className={styles.muted}>Search clients by text, loans by text or ID, and transactions by numeric IDs. For instant jump navigation, use the global command menu.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={openCommandMenu}>Open quick search</button>
        </div>
      </div>

      <section className={styles.panel}>
        <form className={styles.toolbar} onSubmit={submitSearch}>
          <label className={styles.inputGroupWide}>
            <span>Search value</span>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Client name / phone / national ID, or numeric ID for loan/transaction lookup"
            />
          </label>
          <div className={styles.actions}>
            <button type="submit">Search</button>
          </div>
        </form>
      </section>

      {trimmedTerm ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Client results</h2>
          <AsyncState
            loading={clientsQuery.isLoading}
            error={clientsQuery.isError}
            empty={Boolean(clientsQuery.data && clientsQuery.data.data.length === 0)}
            loadingText="Searching clients..."
            errorText="Unable to search clients."
            emptyText="No client matches."
            onRetry={() => {
              void clientsQuery.refetch()
            }}
          />
          {clientsQuery.data && clientsQuery.data.data.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>National ID</th>
                    <th>KYC</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(clientsQuery.data?.data ?? []).map((client) => (
                    <tr key={client.id}>
                      <td>{client.id}</td>
                      <td>{formatDisplayText(client.full_name, `Client #${client.id}`)}</td>
                      <td>{formatDisplayText(client.phone)}</td>
                      <td>{formatDisplayText(client.national_id)}</td>
                      <td>{formatDisplayText(client.kyc_status)}</td>
                      <td>
                        <Link
                          to={`/clients/${client.id}`}
                          onMouseEnter={() => {
                            void prefetchClientWorkspace(queryClient, client.id)
                          }}
                          onFocus={() => {
                            void prefetchClientWorkspace(queryClient, client.id)
                          }}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {numericSearch ? (
        <>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Loan results</h2>
            <AsyncState
              loading={loansQuery.isLoading}
              error={loansQuery.isError}
              empty={Boolean(loansQuery.data && loansQuery.data.data.length === 0)}
              loadingText="Searching loans..."
              errorText="Unable to search loans."
              emptyText="No loans found for this ID."
              onRetry={() => {
                void loansQuery.refetch()
              }}
            />
            {loansQuery.data && loansQuery.data.data.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Loan ID</th>
                      <th>Client</th>
                      <th>Status</th>
                      <th>Principal</th>
                      <th>Balance</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                  {(loansQuery.data?.data ?? []).map((loan) => (
                    <tr key={loan.id}>
                      <td>{loan.id}</td>
                      <td>{resolveDisplayText([loan.client_name, loan.client_id ? `Client #${loan.client_id}` : null], 'Unknown client')}</td>
                      <td>{formatDisplayText(loan.status)}</td>
                      <td>{loan.principal}</td>
                      <td>{loan.balance}</td>
                      <td>
                        <Link
                          to={`/loans/${loan.id}`}
                          onMouseEnter={() => {
                            void prefetchLoanWorkspace(queryClient, loan.id)
                          }}
                          onFocus={() => {
                            void prefetchLoanWorkspace(queryClient, loan.id)
                          }}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Transaction results</h2>
            <AsyncState
              loading={transactionsQuery.isLoading}
              error={transactionsQuery.isError}
              empty={Boolean(transactionsQuery.data && transactionsQuery.data.data.length === 0)}
              loadingText="Searching transactions..."
              errorText="Unable to search transactions."
              emptyText="No transactions found for this ID."
              onRetry={() => {
                void transactionsQuery.refetch()
              }}
            />
            {transactionsQuery.data && transactionsQuery.data.data.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Occurred at</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Client</th>
                      <th>Loan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(transactionsQuery.data?.data ?? []).map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.id}</td>
                        <td>{formatDisplayDateTime(tx.occurred_at)}</td>
                        <td>{formatDisplayText(tx.tx_type)}</td>
                        <td>{tx.amount}</td>
                        <td>{formatDisplayText(tx.client_name)}</td>
                        <td>{formatDisplayText(tx.loan_id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        trimmedTerm ? <p className={styles.muted}>Enter a numeric value to also search loans and transactions by ID.</p> : null
      )}
    </div>
  )
}
