import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AsyncState } from '../../../components/common/AsyncState'
import { queryPolicies } from '../../../services/queryPolicies'
import { listLoanProducts } from '../../../services/riskService'
import { useToastStore } from '../../../store/toastStore'
import { useLoanDraftStore, type LoanDraftValues } from '../../../store/loanDraftStore'
import type { LoanProductRecord } from '../../../types/risk'
import { calculateGuidePricingPreview, parseGuidePricingConfig } from '../utils/productPricing'
import { useCreateLoan } from '../hooks/useLoans'
import { useClientOnboardingStatus } from '../../clients/hooks/useClients'
import styles from '../../shared/styles/WizardPage.module.css'

async function searchClients(query: string) {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  try {
    const res = await fetch(`/api/clients?search=${encodeURIComponent(trimmed)}&limit=8&sortBy=id&sortOrder=desc`)
    if (!res.ok) return []
    const payload = await res.json()
    return Array.isArray(payload?.data) ? payload.data.map((c: Record<string, unknown>) => ({
      id: Number(c.id),
      name: String(c.full_name || ''),
      phone: String(c.phone || ''),
    })) : []
  } catch {
    return []
  }
}

const loanWizardSchema = z.object({
  clientId: z.number().optional().refine((value) => typeof value === 'number' && value > 0, 'Client ID must be greater than zero.'),
  principal: z.number().optional().refine((value) => typeof value === 'number' && value > 0, 'Principal must be greater than zero.'),
  termWeeks: z.number().optional().refine((value) => typeof value === 'number' && value > 0, 'Term must be greater than zero.'),
  productId: z.number().int().positive().optional(),
  purpose: z.string().trim().max(180).optional(),
})

const LOAN_STEPS = [
  {
    title: 'Borrower',
    description: 'Identify the borrower record you are originating a facility for.',
    fields: ['clientId'] as const,
  },
  {
    title: 'Facility setup',
    description: 'Choose the product, principal band, and supported term before pricing the facility.',
    fields: ['productId', 'principal', 'termWeeks'] as const,
  },
  {
    title: 'Review',
    description: 'Add a purpose note, review the repayment preview, then submit the application.',
    fields: ['purpose'] as const,
  },
] as const

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getPreferredProduct(products: LoanProductRecord[]) {
  return products.find((product) => String(product.pricing_strategy || '') === 'graduated_weekly_income') || products[0] || null
}

function formatSavedAt(value: string | null) {
  if (!value) {
    return 'Draft not saved yet'
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Draft recently updated' : `Draft saved ${parsed.toLocaleString()}`
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof axios.AxiosError) {
    const payload = error.response?.data as {
      message?: unknown
      requestId?: unknown
      issues?: Array<{ path?: unknown[]; message?: unknown }>
    } | undefined
    const message = String(payload?.message || '').trim()
    const validationDetails = Array.isArray(payload?.issues)
      ? payload.issues
        .map((issue) => {
          const path = Array.isArray(issue?.path) ? issue.path.join('.') : ''
          const issueMessage = String(issue?.message || '').trim()
          return path ? `${path}: ${issueMessage}` : issueMessage
        })
        .filter(Boolean)
        .join('; ')
      : ''
    const requestId = String(payload?.requestId || '').trim()
    const parts = [message || fallback]

    if (validationDetails) {
      parts.push(validationDetails)
    }
    if (requestId) {
      parts.push(`Request ID: ${requestId}`)
    }

    const combined = parts.filter(Boolean).join(' | ').trim()
    if (combined) {
      return combined
    }
  }

  return fallback
}

function toLabel(value: unknown, fallback = '-') {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return fallback
  }

  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

export function CreateLoanPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const createMutation = useCreateLoan()
  const pushToast = useToastStore((state) => state.pushToast)
  const draftStep = useLoanDraftStore((state) => state.step)
  const draftValues = useLoanDraftStore((state) => state.values)
  const draftUpdatedAt = useLoanDraftStore((state) => state.updatedAt)
  const setDraftStep = useLoanDraftStore((state) => state.setStep)
  const patchDraftValues = useLoanDraftStore((state) => state.patchValues)
  const resetDraft = useLoanDraftStore((state) => state.reset)
  const prefilledClientId = Number(searchParams.get('clientId'))
  const hasPrefilledClient = Number.isInteger(prefilledClientId) && prefilledClientId > 0
  const currentStep = Math.min(Math.max(draftStep, 0), LOAN_STEPS.length - 1)
  const activeStep = LOAN_STEPS[currentStep]
  const progress = ((currentStep + 1) / LOAN_STEPS.length) * 100
  const { control, register, handleSubmit, setValue, trigger, formState: { errors } } = useForm<LoanDraftValues>({
    resolver: zodResolver(loanWizardSchema),
    defaultValues: draftValues,
    mode: 'onBlur',
  })
  const watchedValues = useWatch({ control })
  const resolvedClientId = Number(watchedValues?.clientId || prefilledClientId || 0)
  const selectedClientId = Number.isInteger(resolvedClientId) && resolvedClientId > 0 ? resolvedClientId : 0
  const watchedProductId = Number(watchedValues.productId || 0)
  const watchedPrincipal = Number(watchedValues.principal || 0)
  const watchedTermWeeks = Number(watchedValues.termWeeks || 0)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [showClientResults, setShowClientResults] = useState(false)
  const [selectedClientName, setSelectedClientName] = useState('')
  const clientSearchResults = useQuery({
    queryKey: ['loan-client-search', clientSearchQuery],
    queryFn: () => searchClients(clientSearchQuery),
    enabled: clientSearchQuery.trim().length >= 2,
    staleTime: 15_000,
  })
  const clientOnboardingQuery = useClientOnboardingStatus(selectedClientId)
  const clientOnboarding = clientOnboardingQuery.data
  const clientReadyForLoanApplication = Boolean(clientOnboarding?.readyForLoanApplication)
  const clientOnboardingBlocked = selectedClientId > 0 && clientOnboardingQuery.isSuccess && !clientReadyForLoanApplication
  const loanProductsQuery = useQuery({
    queryKey: ['loan-origination', 'loan-products'],
    queryFn: () => listLoanProducts(),
    ...queryPolicies.list,
  })
  const hasLoanProducts = Boolean(loanProductsQuery.data && loanProductsQuery.data.length > 0)
  const supportsFallbackOrigination = loanProductsQuery.isError
  const selectedProduct = useMemo(
    () => (hasLoanProducts
      ? loanProductsQuery.data?.find((product) => Number(product.id) === watchedProductId) || null
      : null),
    [hasLoanProducts, loanProductsQuery.data, watchedProductId],
  )
  const guideConfig = useMemo(() => parseGuidePricingConfig(selectedProduct), [selectedProduct])
  const guidePreview = useMemo(
    () => (guideConfig ? calculateGuidePricingPreview(guideConfig, watchedPrincipal, watchedTermWeeks) : null),
    [guideConfig, watchedPrincipal, watchedTermWeeks],
  )

  useEffect(() => {
    patchDraftValues((watchedValues || {}) as Partial<LoanDraftValues>)
  }, [patchDraftValues, watchedValues])

  useEffect(() => {
    if (Number.isInteger(prefilledClientId) && prefilledClientId > 0 && !watchedValues.clientId) {
      setValue('clientId', prefilledClientId, { shouldDirty: false })
    }
  }, [prefilledClientId, setValue, watchedValues.clientId])

  // Auto-skip to Step 2 when we arrive with a valid prefilled client
  useEffect(() => {
    if (hasPrefilledClient && currentStep === 0 && clientReadyForLoanApplication) {
      setDraftStep(1)
    }
  }, [hasPrefilledClient, currentStep, clientReadyForLoanApplication, setDraftStep])

  useEffect(() => {
    if (!loanProductsQuery.data || loanProductsQuery.data.length === 0) {
      return
    }

    if (!watchedProductId) {
      const preferredProduct = getPreferredProduct(loanProductsQuery.data)
      if (preferredProduct) {
        setValue('productId', preferredProduct.id, { shouldDirty: false })
        if (!watchedValues.termWeeks) {
          setValue('termWeeks', preferredProduct.min_term_weeks, { shouldDirty: false })
        }
      }
    }
  }, [loanProductsQuery.data, setValue, watchedProductId, watchedValues.termWeeks])

  useEffect(() => {
    if (!guideConfig) {
      return
    }

    if (!guideConfig.supportedTerms.includes(watchedTermWeeks)) {
      setValue('termWeeks', guideConfig.supportedTerms[0], { shouldDirty: false })
    }
  }, [guideConfig, setValue, watchedTermWeeks])

  const summaryItems = useMemo(() => ([
    {
      label: 'Client ID',
      value: watchedValues.clientId ? `#${watchedValues.clientId}` : 'Not selected yet',
    },
    {
      label: 'Borrower readiness',
      value: selectedClientId <= 0
        ? 'Enter a borrower ID'
        : clientOnboardingQuery.isLoading
          ? 'Checking onboarding status'
          : clientReadyForLoanApplication
            ? 'Ready for loan origination'
            : `Blocked: ${toLabel(clientOnboarding?.nextStep, 'Continue onboarding')}`,
    },
    {
      label: 'Product',
      value: selectedProduct?.name || (supportsFallbackOrigination ? 'Default active product' : 'Choose a product'),
    },
    {
      label: 'Principal',
      value: watchedValues.principal ? `KES ${formatMoney(watchedValues.principal)}` : 'Not entered yet',
    },
    {
      label: 'Term',
      value: watchedValues.termWeeks ? `${watchedValues.termWeeks} weeks` : 'Not selected yet',
    },
    {
      label: 'Purpose',
      value: watchedValues.purpose?.trim() || 'Optional note not added',
    },
  ]), [
    clientOnboarding?.nextStep,
    clientOnboardingQuery.isLoading,
    clientReadyForLoanApplication,
    selectedClientId,
    selectedProduct?.name,
    supportsFallbackOrigination,
    watchedValues.clientId,
    watchedValues.principal,
    watchedValues.purpose,
    watchedValues.termWeeks,
  ])

  async function goToNextStep() {
    const fields = currentStep === 1 && !hasLoanProducts
      ? (['principal', 'termWeeks'] as const)
      : activeStep.fields
    const isValid = await trigger(fields, { shouldFocus: true })
    if (!isValid) {
      return
    }

    if (currentStep === 0 && selectedClientId > 0) {
      if (clientOnboardingQuery.isLoading) {
        pushToast({ type: 'error', message: 'Checking borrower onboarding status. Please wait a moment.' })
        return
      }

      if (clientOnboardingBlocked) {
        pushToast({
          type: 'error',
          message: `Borrower onboarding is incomplete. Next step: ${toLabel(clientOnboarding?.nextStep, 'Continue onboarding')}.`,
        })
        return
      }
    }

    setDraftStep(Math.min(currentStep + 1, LOAN_STEPS.length - 1))
  }

  function goToPreviousStep() {
    setDraftStep(Math.max(currentStep - 1, 0))
  }

  const submitLoan = (values: LoanDraftValues) => {
    if (selectedClientId > 0 && clientOnboardingQuery.isLoading) {
      pushToast({ type: 'error', message: 'Checking borrower onboarding status. Please wait a moment.' })
      return
    }

    if (clientOnboardingBlocked) {
      pushToast({
        type: 'error',
        message: `Borrower onboarding is incomplete. Next step: ${toLabel(clientOnboarding?.nextStep, 'Continue onboarding')}.`,
      })
      return
    }

    createMutation.mutate(
      {
        clientId: Number(values.clientId),
        productId: hasLoanProducts ? Number(values.productId) || undefined : undefined,
        principal: Number(values.principal),
        termWeeks: Number(values.termWeeks),
        purpose: values.purpose?.trim() || undefined,
      },
      {
        onSuccess: (result: { id?: number }) => {
          resetDraft()
          pushToast({ type: 'success', message: 'Loan created successfully.' })
          if (result?.id) {
            navigate(`/loans/${result.id}`)
            return
          }
          navigate('/loans')
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to create loan.') })
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.eyebrow}>Facility origination</p>
            <h1>Create Loan</h1>
            <p className={styles.subtitle}>
              Guide the user through borrower selection, product setup, and repayment review while preserving the draft locally.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.ghostLink} to="/loans">Back to loans</Link>
            {Number.isInteger(prefilledClientId) && prefilledClientId > 0 ? (
              <Link className={styles.ghostLink} to={`/clients/${prefilledClientId}`}>Back to client</Link>
            ) : null}
            <button type="button" className={styles.secondaryButton} onClick={resetDraft}>
              Clear draft
            </button>
          </div>
        </div>

        <div className={styles.progressRail}>
          <div className={styles.progressMeta}>
            <span>Step {currentStep + 1} of {LOAN_STEPS.length}</span>
            <span>{formatSavedAt(draftUpdatedAt)}</span>
          </div>
          <div className={styles.progressBar} aria-hidden="true">
            <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.stepList}>
            {LOAN_STEPS.map((step, index) => {
              const isActive = index === currentStep
              const isComplete = index < currentStep

              return (
                <article
                  key={step.title}
                  className={`${styles.stepCard} ${isActive ? styles.stepActive : ''} ${isComplete ? styles.stepComplete : ''}`.trim()}
                >
                  <div className={styles.stepBadge}>{isComplete ? 'OK' : index + 1}</div>
                  <div className={styles.stepTitle}>{step.title}</div>
                  <div className={styles.stepDescription}>{step.description}</div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <div className={styles.workspace}>
        <form className={styles.panel} onSubmit={handleSubmit(submitLoan)}>
          <div className={styles.panelHeader}>
            <h2>{activeStep.title}</h2>
            <p>{activeStep.description}</p>
          </div>

          {selectedClientId > 0 ? (
            <div className={styles.metaCard}>
              <strong>
                {clientOnboardingQuery.isLoading
                  ? 'Checking borrower readiness'
                  : clientReadyForLoanApplication
                    ? 'Borrower ready for origination'
                    : 'Borrower onboarding required'}
              </strong>
              <div>
                {clientOnboardingQuery.isLoading
                  ? 'Loading onboarding status before origination can continue.'
                  : clientReadyForLoanApplication
                    ? 'The borrower has completed onboarding and can proceed to loan origination.'
                    : `Loan creation is blocked until onboarding is complete. Next step: ${toLabel(clientOnboarding?.nextStep, 'Continue onboarding')}.`}
              </div>
              {clientOnboarding ? (
                <div className={styles.fieldHint}>
                  KYC {toLabel(clientOnboarding.kycStatus)} | Guarantors {clientOnboarding.counts.guarantors} | Collaterals {clientOnboarding.counts.collaterals} | Fee {toLabel(clientOnboarding.feePaymentStatus)}
                </div>
              ) : null}
              <div className={styles.actionGroup}>
                <Link className={styles.ghostLink} to={`/clients/${selectedClientId}`}>Open borrower profile</Link>
              </div>
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className={styles.fieldGrid}>
                {currentStep === 0 ? (
                  <>
                    <label className={styles.fieldWide}>
                      <span className={styles.fieldLabel}>Search borrower</span>
                      <input
                        type="text"
                        placeholder="Search by name or phone..."
                        value={clientSearchQuery}
                        onChange={(e) => {
                          setClientSearchQuery(e.target.value)
                          setShowClientResults(true)
                        }}
                        onFocus={() => setShowClientResults(true)}
                      />
                      {showClientResults && clientSearchResults.data && clientSearchResults.data.length > 0 ? (
                        <div style={{
                          border: '1px solid var(--color-border, #e2e8f0)',
                          borderRadius: 8,
                          marginTop: 4,
                          maxHeight: 200,
                          overflowY: 'auto',
                          background: 'var(--color-surface, #fff)',
                        }}>
                          {clientSearchResults.data.map((client: { id: number; name: string; phone: string }) => (
                            <button
                              key={client.id}
                              type="button"
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '0.5rem 0.75rem', border: 'none', background: 'transparent',
                                cursor: 'pointer', fontSize: 14,
                                borderBottom: '1px solid var(--color-border, #f1f5f9)',
                              }}
                              onClick={() => {
                                setValue('clientId', client.id, { shouldDirty: true })
                                setSelectedClientName(client.name)
                                setClientSearchQuery(client.name)
                                setShowClientResults(false)
                              }}
                            >
                              <strong>#{client.id}</strong> {client.name} {client.phone ? `(${client.phone})` : ''}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {selectedClientId > 0 ? (
                        <p className={styles.fieldHint} style={{ color: 'var(--color-success, #16a34a)' }}>
                          ✓ Selected: {selectedClientName || `Client #${selectedClientId}`}
                        </p>
                      ) : null}
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Or enter Client ID directly</span>
                      <input
                        type="number"
                        min={1}
                        {...register('clientId', {
                          setValueAs: (value) => {
                            if (value === '' || value == null) {
                              return undefined
                            }
                            const parsed = Number(value)
                            return Number.isFinite(parsed) ? parsed : undefined
                          },
                        })}
                        placeholder="Borrower ID"
                      />
                      {errors.clientId ? <span className={styles.error}>{errors.clientId.message}</span> : null}
                    </label>
                  </>
                ) : null}

                {currentStep === 1 ? (
                  <>
                    <AsyncState
                      loading={loanProductsQuery.isLoading}
                      error={loanProductsQuery.isError && !supportsFallbackOrigination}
                      loadingText="Loading loan products..."
                      errorText="Unable to load loan products."
                    />
                    {supportsFallbackOrigination ? (
                      <div className={styles.metaCard}>
                        <strong>Catalog unavailable</strong>
                        Origination can continue. The backend will attach the default active product when the loan is submitted.
                      </div>
                    ) : null}
                    {hasLoanProducts ? (
                      <label className={styles.fieldWide}>
                        <span className={styles.fieldLabel}>Loan product</span>
                        <select
                          {...register('productId', {
                            setValueAs: (value) => {
                              if (value === '' || value == null) {
                                return undefined
                              }
                              const parsed = Number(value)
                              return Number.isFinite(parsed) ? parsed : undefined
                            },
                          })}
                        >
                          <option value="">Select product</option>
                          {loanProductsQuery.data?.map((product) => (
                            <option key={product.id} value={product.id}>{product.name}</option>
                          ))}
                        </select>
                        {errors.productId ? <span className={styles.error}>{errors.productId.message}</span> : null}
                      </label>
                    ) : (
                      <label className={styles.fieldWide}>
                        <span className={styles.fieldLabel}>Loan product</span>
                        <input value="Default active product (automatic)" readOnly aria-readonly="true" />
                      </label>
                    )}

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Principal</span>
                      <input
                        type="number"
                        min={guideConfig?.principalMin || 1}
                        max={guideConfig?.principalMax}
                        step={guideConfig?.principalStep || 0.01}
                        {...register('principal', {
                          setValueAs: (value) => {
                            if (value === '' || value == null) {
                              return undefined
                            }
                            const parsed = Number(value)
                            return Number.isFinite(parsed) ? parsed : undefined
                          },
                        })}
                      />
                      {errors.principal ? <span className={styles.error}>{errors.principal.message}</span> : null}
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Term weeks</span>
                      {guideConfig ? (
                        <select
                          {...register('termWeeks', {
                            setValueAs: (value) => {
                              if (value === '' || value == null) {
                                return undefined
                              }
                              const parsed = Number(value)
                              return Number.isFinite(parsed) ? parsed : undefined
                            },
                          })}
                        >
                          {guideConfig.supportedTerms.map((term) => (
                            <option key={term} value={term}>{term} weeks</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          {...register('termWeeks', {
                            setValueAs: (value) => {
                              if (value === '' || value == null) {
                                return undefined
                              }
                              const parsed = Number(value)
                              return Number.isFinite(parsed) ? parsed : undefined
                            },
                          })}
                        />
                      )}
                      {errors.termWeeks ? <span className={styles.error}>{errors.termWeeks.message}</span> : null}
                    </label>

                    {/* Live pricing preview on Step 2 */}
                    {guidePreview ? (
                      <div className={styles.fieldWide} style={{
                        background: 'var(--color-surface-alt, #f8fafc)',
                        border: '1px solid var(--color-border, #e2e8f0)',
                        borderRadius: 8,
                        padding: '0.75rem 1rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.5rem',
                      }}>
                        <div><span style={{ fontSize: 12, color: 'var(--color-muted, #64748b)' }}>Weekly installment</span><br /><strong>KES {formatMoney(guidePreview.installmentAmount)}</strong></div>
                        <div><span style={{ fontSize: 12, color: 'var(--color-muted, #64748b)' }}>Total repayment</span><br /><strong>KES {formatMoney(guidePreview.scheduledRepaymentTotal)}</strong></div>
                        <div><span style={{ fontSize: 12, color: 'var(--color-muted, #64748b)' }}>Total interest</span><br /><strong>KES {formatMoney(guidePreview.weeklyInterestAmount * watchedTermWeeks)}</strong></div>
                        <div><span style={{ fontSize: 12, color: 'var(--color-muted, #64748b)' }}>Processing fee</span><br /><strong>KES {formatMoney(guidePreview.processingFee)}</strong></div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {currentStep === 2 ? (
                  <>
                    <label className={styles.fieldWide}>
                      <span className={styles.fieldLabel}>Purpose</span>
                      <input {...register('purpose')} placeholder="Working capital, restock, equipment repair..." />
                      <p className={styles.fieldHint}>Optional note. The repayment preview updates from the selected product guide.</p>
                    </label>
                    {guideConfig ? (
                      <>
                        <article className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Weekly interest</span>
                          <span className={styles.summaryValue}>
                            {guidePreview ? `KES ${formatMoney(guidePreview.weeklyInterestAmount)}` : 'Add principal and term to preview'}
                          </span>
                        </article>
                        <article className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Scheduled repayment</span>
                          <span className={styles.summaryValue}>
                            {guidePreview ? `KES ${formatMoney(guidePreview.scheduledRepaymentTotal)}` : 'Add principal and term to preview'}
                          </span>
                        </article>
                        <article className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Weekly installment</span>
                          <span className={styles.summaryValue}>
                            {guidePreview ? `KES ${formatMoney(guidePreview.installmentAmount)}` : 'Add principal and term to preview'}
                          </span>
                        </article>
                        <article className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Fees collected</span>
                          <span className={styles.summaryValue}>
                            {guidePreview ? `KES ${formatMoney(guidePreview.processingFee)}` : `KES ${formatMoney(guideConfig.processingFee)}`}
                          </span>
                        </article>
                      </>
                    ) : selectedProduct ? (
                      <>
                        <article className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Interest rate</span>
                          <span className={styles.summaryValue}>{selectedProduct.interest_rate}%</span>
                        </article>
                        <article className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Registration fee</span>
                          <span className={styles.summaryValue}>KES {formatMoney(selectedProduct.registration_fee)}</span>
                        </article>
                        <article className={styles.summaryItem}>
                          <span className={styles.summaryLabel}>Processing fee</span>
                          <span className={styles.summaryValue}>KES {formatMoney(selectedProduct.processing_fee)}</span>
                        </article>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>

          {createMutation.isError ? (
            <div className={styles.error}>{getApiErrorMessage(createMutation.error, 'Unable to create loan right now.')}</div>
          ) : null}

          <div className={styles.wizardActions}>
            <div className={styles.actionGroup}>
              <button type="button" className={styles.secondaryButton} onClick={goToPreviousStep} disabled={currentStep === 0}>
                Back
              </button>
            </div>
            <div className={styles.actionGroup}>
              {currentStep < LOAN_STEPS.length - 1 ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void goToNextStep()}
                  disabled={currentStep === 0 && selectedClientId > 0 && clientOnboardingQuery.isLoading}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={createMutation.isPending || (selectedClientId > 0 && (clientOnboardingQuery.isLoading || clientOnboardingBlocked))}
                >
                  {createMutation.isPending
                    ? 'Creating loan...'
                    : clientOnboardingBlocked
                      ? 'Complete onboarding first'
                      : 'Create loan'}
                </button>
              )}
            </div>
          </div>
        </form>

        <aside className={styles.summaryPanel}>
          <div>
            <h2>Origination summary</h2>
            <p>Each field here updates live from the draft and stays available after a refresh.</p>
          </div>

          <div className={styles.summaryList}>
            {summaryItems.map((item) => (
              <article key={item.label} className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{item.label}</span>
                <span className={styles.summaryValue}>{item.value}</span>
              </article>
            ))}
          </div>

          {guideConfig ? (
            <div className={styles.metaCard}>
              <strong>Guide pricing</strong>
              Supported principals run from KES {formatMoney(guideConfig.principalMin)} to KES {formatMoney(guideConfig.principalMax)} in KES {formatMoney(guideConfig.principalStep)} increments.
            </div>
          ) : null}

          <div className={styles.summaryPill}>Local draft persistence is enabled for loan origination.</div>
        </aside>
      </div>
    </div>
  )
}
