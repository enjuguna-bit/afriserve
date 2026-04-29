import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { clientFormSchema, type ClientFormValues } from './clientFormSchema'
import styles from '../ClientFormPage.module.css'

type ClientFormProps = {
  mode: 'create' | 'edit'
  initialValues?: Partial<ClientFormValues>
  isSubmitting: boolean
  apiError: string | null
  onSubmit: (values: ClientFormValues) => void
}

export function ClientForm({ mode, initialValues, isSubmitting, apiError, onSubmit }: ClientFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      fullName: initialValues?.fullName ?? '',
      phone: initialValues?.phone ?? '',
      nationalId: initialValues?.nationalId ?? '',
      kraPin: initialValues?.kraPin ?? '',
      nextOfKinName: initialValues?.nextOfKinName ?? '',
      nextOfKinPhone: initialValues?.nextOfKinPhone ?? '',
      nextOfKinRelation: initialValues?.nextOfKinRelation ?? '',
      businessType: initialValues?.businessType ?? '',
      businessYears: initialValues?.businessYears,
      businessLocation: initialValues?.businessLocation ?? '',
      residentialAddress: initialValues?.residentialAddress ?? '',
      isActive: initialValues?.isActive ?? true,
      piiOverrideReason: initialValues?.piiOverrideReason ?? '',
    },
  })

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <div className={styles.row}>
        <label className={styles.field}>
          Full name
          <input className={styles.input} {...register('fullName')} />
          {errors.fullName ? <span className={styles.error}>{errors.fullName.message}</span> : null}
        </label>
        <label className={styles.field}>
          Phone
          <input className={styles.input} {...register('phone')} />
        </label>
        <label className={styles.field}>
          National ID
          <input className={styles.input} {...register('nationalId')} />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          KRA PIN
          <input className={styles.input} {...register('kraPin')} />
        </label>
        <label className={styles.field}>
          Next of kin name
          <input className={styles.input} {...register('nextOfKinName')} />
        </label>
        <label className={styles.field}>
          Next of kin phone
          <input className={styles.input} {...register('nextOfKinPhone')} />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          Next of kin relation
          <input className={styles.input} {...register('nextOfKinRelation')} />
        </label>
        <label className={styles.field}>
          Business type
          <input className={styles.input} {...register('businessType')} />
        </label>
        <label className={styles.field}>
          Business years
          <input
            className={styles.input}
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
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          Business location
          <input className={styles.input} {...register('businessLocation')} />
        </label>
        <label className={styles.field}>
          Residential address
          <input className={styles.input} {...register('residentialAddress')} />
        </label>
        {mode === 'edit' ? (
          <label className={styles.field}>
            Active
            <input type="checkbox" {...register('isActive')} />
          </label>
        ) : (
          <div className={styles.field}>
            <span className={styles.meta}>Client is active by default when created.</span>
          </div>
        )}
      </div>

      {mode === 'edit' ? (
        <div className={styles.row}>
          <label className={styles.field}>
            Admin correction reason
            <textarea
              className={styles.input}
              rows={3}
              {...register('piiOverrideReason')}
            />
            {errors.piiOverrideReason ? <span className={styles.error}>{errors.piiOverrideReason.message}</span> : null}
            <span className={styles.meta}>Required when changing phone or National ID.</span>
          </label>
        </div>
      ) : null}

      {apiError ? <p className={styles.error}>{apiError}</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create client' : 'Update client'}
      </button>
    </form>
  )
}
