'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import styles from './UserMenu.module.css'

interface UserMenuProps {
  className?: string
}

export default function UserMenu({ className }: UserMenuProps = {}) {
  const { data: session, status } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // If className is provided (from mobile menu), add mobileMenuUserMenu class
  const containerClassName = className
    ? `${styles.container} ${styles.mobileMenuUserMenu}`
    : styles.container

  if (status === 'loading') {
    return (
      <div className={containerClassName}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className={containerClassName}>
        <Link href="/auth/signin" className={styles.signInButton}>
          Sign In
        </Link>
        <Link href="/auth/signup" className={styles.signUpButton}>
          Sign Up
        </Link>
      </div>
    )
  }

  return (
    <div className={containerClassName} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={styles.userButton}
        aria-label="User menu"
      >
        {session.user?.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || 'User'}
            className={styles.avatar}
          />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {session.user?.name?.[0]?.toUpperCase() || session.user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
        )}
        <span className={styles.userName}>
          {session.user?.name || session.user?.email || 'User'}
        </span>
        <svg
          className={styles.chevron}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.menu}>
          <div className={styles.menuHeader}>
            <div className={styles.menuUserInfo}>
              {session.user?.name && (
                <div className={styles.menuUserName}>{session.user.name}</div>
              )}
              <div className={styles.menuUserEmail}>{session.user?.email}</div>
            </div>
          </div>
          <div className={styles.menuDivider} />
          <button
            onClick={() => {
              signOut({ callbackUrl: '/' })
              setIsOpen(false)
            }}
            className={styles.menuItem}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

