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
  const navigate    = useNavigate()
  const location    = useLocation()
  const setSession  = useAuthStore((state) => state.setSession)
  const pushToast   = useToastStore((state) => state.pushToast)
  const fromPath    = (location.state as { from?: { pathname?: string } } | null)
    ?.from?.pathname || '/dashboard'

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (response) => {
      setSession(response.token, response.user, response.refreshToken)
      pushToast({ type: 'success', message: 'Signed in successfully.' })
      navigate(fromPath, { replace: true })
    },
    onError: () => {
      pushToast({ type: 'error', message: 'Invalid credentials. Try again.' })
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

  const onSubmit = (data: LoginInput) => loginMutation.mutate(data)

  const apiErrorMessage =
    loginMutation.error instanceof axios.AxiosError
      ? (loginMutation.error.response?.data as { message?: string } | undefined)
          ?.message || 'Login failed. Please try again.'
      : loginMutation.error
        ? 'Login failed. Please try again.'
        : null

  return (
    <div className={styles.wrap}>

      {/* ── Left: Brand hero ───────────────────────────────────────────── */}
      <section className={styles.hero} aria-hidden="true">
        <div className={styles.logoPanel}>
          <AfriserveLogo className={styles.heroLogo} />
        </div>

        <div className={styles.heroBody}>
          <p className={styles.heroTagline}>Afriserve Platform</p>
          <h1>
            Manage your<br />
            <span>loan portfolio</span><br />
            with clarity.
          </h1>
          <p className={styles.heroSub}>
            Real-time dashboards, collections tracking, and loan approvals — all in one place.
          </p>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.statChip}>
            <span className={styles.statIcon}>📊</span>
            <span className={styles.statText}>Live portfolio reporting</span>
          </div>
          <div className={styles.statChip}>
            <span className={styles.statIcon}>✅</span>
            <span className={styles.statText}>Loan approvals & disbursements</span>
          </div>
          <div className={styles.statChip}>
            <span className={styles.statIcon}>🔔</span>
            <span className={styles.statText}>Overdue alerts & collections</span>
          </div>
        </div>
      </section>

      {/* ── Right: Sign-in form ─────────────────────────────────────────── */}
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} aria-label="Sign in">
        <p className={styles.formEyebrow}>Staff Portal</p>
        <h2>Sign in</h2>
        <p className={styles.formSub}>Enter your credentials to continue.</p>

        <label>
          Email
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            placeholder="you@afriserve.com"
            {...register('email')}
          />
        </label>
        {errors.email && <span className={styles.error}>{errors.email.message}</span>}

        <label>
          Password
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
          />
        </label>
        {errors.password && <span className={styles.error}>{errors.password.message}</span>}
        {apiErrorMessage && <span className={styles.error}>{apiErrorMessage}</span>}

        <button type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Signing in…' : 'Continue →'}
        </button>
      </form>

    </div>
  )
}
