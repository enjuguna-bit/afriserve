import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useLocation, useNavigate } from 'react-router-dom'
import { AfriserveLogo } from '../../../components/common/AfriserveLogo'
import { useAuthStore } from '../../../store/authStore'
import { login } from '../../../services/authService'
import { useToastStore } from '../../../store/toastStore'
import styles from './LoginPage.module.css'

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type LoginInput = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useAuthStore((state) => state.setSession)
  const pushToast = useToastStore((state) => state.pushToast)
  const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard'

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (response) => {
      setSession(response.token, response.user, response.refreshToken)
      pushToast({ type: 'success', message: 'Signed in successfully.' })
      navigate(fromPath, { replace: true })
    },
    onError: () => {
      pushToast({ type: 'error', message: 'Sign in failed.' })
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = (data: LoginInput) => {
    loginMutation.mutate(data)
  }

  const apiErrorMessage =
    loginMutation.error instanceof axios.AxiosError
      ? (loginMutation.error.response?.data as { message?: string } | undefined)?.message || 'Login failed'
      : loginMutation.error
        ? 'Login failed'
        : null

  return (
    <div className={styles.wrap}>
      <section className={styles.hero} aria-label="Afriserve platform overview">
        <div className={styles.logoPanel}>
          <AfriserveLogo className={styles.heroLogo} />
        </div>
        <p className={styles.eyebrow}>Microfinance operations platform</p>
        <h1>Portfolio control without spreadsheet drift.</h1>
        <p className={styles.lead}>
          Centralized tools for client onboarding, loan servicing, repayment tracking, collections follow-up, and
          reporting.
        </p>
        <ul className={styles.featureList}>
          <li>Monitor dues, arrears, and disbursements from the same workspace.</li>
          <li>Keep branch teams aligned with role-based access and live operational views.</li>
          <li>Export regulator and finance reports without manual spreadsheet cleanup.</li>
        </ul>
      </section>
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
        <p className={styles.formEyebrow}>Secure access</p>
        <h2>Sign in</h2>
        <p className={styles.formLead}>Use your organization account to continue.</p>
        <label>
          Email
          <input className={styles.input} type="email" {...register('email')} />
        </label>
        {errors.email ? <span className={styles.error}>{errors.email.message}</span> : null}
        <label>
          Password
          <input className={styles.input} type="password" {...register('password')} />
        </label>
        {errors.password ? <span className={styles.error}>{errors.password.message}</span> : null}
        {apiErrorMessage ? <span className={styles.error}>{apiErrorMessage}</span> : null}
        <button type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Signing in...' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
