import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { CreateClientPayload } from '../../../types/client'
import { useToastStore } from '../../../store/toastStore'
import { defaultClientDraftValues, useClientDraftStore } from '../../../store/clientDraftStore'
import { useCreateClient } from '../hooks/useClients'
import { clientFormSchema, type ClientFormValues } from './shared/clientFormSchema'
import styles from '../../shared/styles/WizardPage.module.css'

function normalize(value?: string) {
  const trimmed = (value || '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function formatSavedAt(value: string | null) {
  if (!value) {
    return 'Draft not saved yet'
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Draft recently updated' : `Draft saved ${parsed.toLocaleString()}`
}

async function checkDuplicateClient(field: 'phone' | 'nationalId', value: string): Promise<{ exists: boolean; name?: string }> {
  const trimmed = value.trim()
  if (trimmed.length < 4) {
    return { exists: false }
  }

  try {
    const queryParam = field === 'phone' ? `phone=${encodeURIComponent(trimmed)}` : `nationalId=${encodeURIComponent(trimmed)}`
    const response = await fetch(`/api/clients?${queryParam}&limit=1`)
    if (!response.ok) {
      return { exists: false }
    }

    const payload = await response.json()
    const data = Array.isArray(payload?.data) ? payload.data : []
    if (data.length > 0) {
      return { exists: true, name: data[0].full_name || `Client #${data[0].id}` }
    }
  } catch {
    // Silently fail — duplicate check is advisory, not blocking
  }

  return { exists: false }
}

export function CreateClientPage() {
  const navigate = useNavigate()
  const createMutation = useCreateClient()
  const pushToast = useToastStore((state) => state.pushToast)
  const draftValues = useClientDraftStore((state) => state.values)
  const draftUpdatedAt = useClientDraftStore((state) => state.updatedAt)
  const patchDraftValues = useClientDraftStore((state) => state.patchValues)
  const resetDraft = useClientDraftStore((state) => state.reset)
  const [phoneDuplicate, setPhoneDuplicate] = useState<string | null>(null)
  const [idDuplicate, setIdDuplicate] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: draftValues,
    mode: 'onBlur',
  })
  const watchedValues = useWatch({ control })

  useEffect(() => {
    patchDraftValues((watchedValues || {}) as Partial<ClientFormValues>)
  }, [patchDraftValues, watchedValues])

  // Duplicate check on phone blur
  const phoneValue = watchedValues.phone || ''
  const nationalIdValue = watchedValues.nationalId || ''

  const phoneDuplicateQuery = useQuery({
    queryKey: ['duplicate-check', 'phone', phoneValue],
    queryFn: () => checkDuplicateClient('phone', phoneValue),
    enabled: phoneValue.trim().length >= 6,
    staleTime: 30_000,
  })

  const idDuplicateQuery = useQuery({
    queryKey: ['duplicate-check', 'nationalId', nationalIdValue],
    queryFn: () => checkDuplicateClient('nationalId', nationalIdValue),
    enabled: nationalIdValue.trim().length >= 4,
    staleTime: 30_000,
  })

  useEffect(() => {
    setPhoneDuplicate(phoneDuplicateQuery.data?.exists ? phoneDuplicateQuery.data.name || 'Existing client' : null)
  }, [phoneDuplicateQuery.data])

  useEffect(() => {
    setIdDuplicate(idDuplicateQuery.data?.exists ? idDuplicateQuery.data.name || 'Existing client' : null)
  }, [idDuplicateQuery.data])

  const summaryItems = useMemo(() => {
    const values = {
      ...defaultClientDraftValues,
      ...watchedValues,
    }

    return [
      { label: 'Borrower', value: values.fullName || 'Not captured yet' },
      { label: 'Phone', value: values.phone || 'No phone added' },
      { label: 'National ID', value: values.nationalId || 'No ID added' },
      { label: 'Next of kin', value: values.nextOfKinName || 'No next-of-kin added' },
      { label: 'Business type', value: values.businessType || 'Not captured yet' },
    ]
  }, [watchedValues])

  const submitClient = (payload: ClientFormValues) => {
    const createPayload: CreateClientPayload = {
      fullName: payload.fullName.trim(),
      phone: normalize(payload.phone),
      nationalId: normalize(payload.nationalId),
      kraPin: normalize(payload.kraPin),
      nextOfKinName: normalize(payload.nextOfKinName),
      nextOfKinPhone: normalize(payload.nextOfKinPhone),
      nextOfKinRelation: normalize(payload.nextOfKinRelation),
      businessType: normalize(payload.businessType),
      businessYears: payload.businessYears,
      businessLocation: normalize(payload.businessLocation),
      residentialAddress: normalize(payload.residentialAddress),
    }

    createMutation.mutate(createPayload, {
      onSuccess: (createdClient) => {
        resetDraft()
        pushToast({ type: 'success', message: 'Client created successfully.' })
        navigate(`/clients/${createdClient.id}`, { state: { justCreated: true } })
      },
      onError: () => {
        pushToast({ type: 'error', message: 'Failed to create client.' })
      },
    })
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.eyebrow}>Borrower origination</p>
            <h1>Create Client</h1>
            <p className={styles.subtitle}>
              Fill in the borrower details below. The draft is saved locally so a refresh or route change does not wipe progress.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.ghostLink} to="/clients">Back to clients</Link>
            <button type="button" className={styles.secondaryButton} onClick={resetDraft}>
              Clear draft
            </button>
          </div>
        </div>

        <div className={styles.progressRail}>
          <div className={styles.progressMeta}>
            <span>{formatSavedAt(draftUpdatedAt)}</span>
          </div>
        </div>
      </section>

      <div className={styles.workspace}>
        <form className={styles.panel} onSubmit={handleSubmit(submitClient)}>
          {/* Section 1: Identity */}
          <div className={styles.panelHeader}>
            <h2>Identity</h2>
            <p>Create the borrower profile with contact and ID details.</p>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Full name *</span>
              <input {...register('fullName')} placeholder="Borrower full name" />
              {errors.fullName ? <span className={styles.error}>{errors.fullName.message}</span> : null}
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <input {...register('phone')} placeholder="+254 7XX XXX XXX" />
              {phoneDuplicate ? (
                <span className={styles.fieldHint} style={{ color: 'var(--color-amber, #b8860b)' }}>
                  ⚠ A client with this phone already exists: {phoneDuplicate}
                </span>
              ) : null}
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>National ID</span>
              <input {...register('nationalId')} placeholder="National ID number" />
              {idDuplicate ? (
                <span className={styles.fieldHint} style={{ color: 'var(--color-amber, #b8860b)' }}>
                  ⚠ A client with this ID already exists: {idDuplicate}
                </span>
              ) : null}
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>KRA PIN</span>
              <input {...register('kraPin')} placeholder="Optional KRA PIN" />
            </label>
          </div>

          {/* Section 2: Recovery Contact */}
          <div className={styles.panelHeader} style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
            <h2>Recovery Contact</h2>
            <p>Next-of-kin and residential details used for servicing and recovery.</p>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Next of kin name</span>
              <input {...register('nextOfKinName')} placeholder="Emergency contact name" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Next of kin phone</span>
              <input {...register('nextOfKinPhone')} placeholder="Emergency contact phone" />
            </label>
            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Relationship</span>
              <input {...register('nextOfKinRelation')} placeholder="Sibling, spouse, parent..." />
            </label>
            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Residential address</span>
              <input {...register('residentialAddress')} placeholder="Residence or nearest landmark" />
            </label>
          </div>

          {/* Section 3: Business Snapshot */}
          <div className={styles.panelHeader} style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
            <h2>Business Snapshot</h2>
            <p>Finish the business profile, review the summary, and submit.</p>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Business type</span>
              <input {...register('businessType')} placeholder="Retail, transport, wholesale..." />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Business years</span>
              <input
                type="number"
                min={0}
                {...register('businessYears', {
                  setValueAs: (value) => {
                    if (value === '' || value == null) {
                      return undefined
                    }

                    const parsed = Number(value)
                    return Number.isFinite(parsed) ? parsed : undefined
                  },
                })}
              />
            </label>
            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Business location</span>
              <input {...register('businessLocation')} placeholder="Market, street, estate, or trading center" />
            </label>
          </div>

          {createMutation.isError ? <div className={styles.error}>Unable to create client right now.</div> : null}

          <div className={styles.wizardActions}>
            <div className={styles.actionGroup} />
            <div className={styles.actionGroup}>
              <button type="submit" className={styles.primaryButton} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating client...' : 'Create client'}
              </button>
            </div>
          </div>
        </form>

        <aside className={styles.summaryPanel}>
          <div>
            <h2>Draft snapshot</h2>
            <p>Use this summary to spot missing items before you submit the borrower record.</p>
          </div>

          <div className={styles.summaryList}>
            {summaryItems.map((item) => (
              <article key={item.label} className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{item.label}</span>
                <span className={styles.summaryValue}>{item.value}</span>
              </article>
            ))}
          </div>

          <div className={styles.metaCard}>
            <strong>Single-page form</strong>
            All fields are visible at once for faster data entry. The draft is stored in the browser until you clear it or create the client.
          </div>
          <div className={styles.summaryPill}>Draft persistence is enabled on this device.</div>
        </aside>
      </div>
    </div>
  )
}
