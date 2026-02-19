'use client'

import { Suspense } from 'react'
import { SignInForm } from './SignInForm'
import styles from './auth.module.css'

function SignInFallback() {
  return (
    <>
      <h1 className={styles.title}>Sign In</h1>
      <p className={styles.subtitle}>Sign in to your account to continue</p>
      <div className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" disabled aria-hidden />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" disabled aria-hidden />
        </div>
        <button type="button" disabled className={styles.submitButton}>
          Loading...
        </button>
      </div>
    </>
  )
}

export default function SignInPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Suspense fallback={<SignInFallback />}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
