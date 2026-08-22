import { SessionRestorationResult } from '../types/session'
import { usePersistentStore } from '../store/persistentStore'
import { useRuntimeStore } from '../store/runtimeStore'
import { gisAuthService } from '../services/gisAuthService'
import { ObservabilityService } from '../services/observability'

/**
 * Engine 8: Session Lifecycle & Silent Restoration Engine (MOD-10)
 *
 * Coordinates boot-time session continuity, silent token re-acquisition via GIS,
 * onboarding bypass evaluation, and zero-token persistent session hints.
 */
export class SessionLifecycleEngine {
  /**
   * Evaluates whether the client possesses valid onboarding completion state
   * and configuration to bypass the 4-step wizard directly into the active workspace.
   */
  public static shouldBypassOnboarding(
    hasCompletedOnboarding: boolean,
    savedProjectId: string,
    savedBucketName: string,
  ): boolean {
    const cleanProject = (savedProjectId || '').trim()
    const cleanBucket = (savedBucketName || '').replace(/^gs:\/\//i, '').trim()

    const hasValidProject = cleanProject.length >= 6
    const hasValidBucket = cleanBucket.length >= 3

    return Boolean(hasCompletedOnboarding && hasValidProject && hasValidBucket)
  }

  /**
   * Executes silent boot-time session restoration when returning users load the app.
   */
  public static async restoreSessionOnBoot(): Promise<SessionRestorationResult> {
    const {
      hasCompletedOnboarding,
      savedProjectId,
      savedBucketName,
      lastAuthUserEmail,
    } = usePersistentStore.getState()

    const isEligible = this.shouldBypassOnboarding(
      hasCompletedOnboarding,
      savedProjectId,
      savedBucketName,
    )

    if (!isEligible) {
      useRuntimeStore.getState().setIsRestoringSession(false)
      return { restored: false, requiresInteraction: false }
    }

    useRuntimeStore.getState().setIsRestoringSession(true)
    ObservabilityService.info(
      'AUTH',
      'Attempting boot-time silent GIS session restoration...',
      { lastAuthUserEmail, savedProjectId, savedBucketName },
    )

    try {
      const session = await gisAuthService.refreshTokenSilent()
      if (session && session.accessToken) {
        useRuntimeStore.getState().setIsRestoringSession(false)
        useRuntimeStore
          .getState()
          .setAuth(
            session.accessToken,
            session.userEmail,
            session.userName,
            session.userAvatar,
            session.expiresIn,
          )
        ObservabilityService.info(
          'AUTH',
          'Boot-time silent session restoration succeeded',
          { userEmail: session.userEmail },
        )
        return {
          restored: true,
          requiresInteraction: false,
          userEmail: session.userEmail,
          userName: session.userName,
        }
      }
      throw new Error('Silent token request returned an empty session.')
    } catch (err: any) {
      const errorMessage =
        err?.message || 'Silent session renewal required interactive consent.'
      useRuntimeStore.getState().setIsRestoringSession(false, errorMessage)
      ObservabilityService.warn(
        'AUTH',
        `Boot-time silent session restoration requires interactive consent: ${errorMessage}`,
      )
      return {
        restored: false,
        requiresInteraction: true,
        userEmail: lastAuthUserEmail || undefined,
        errorMessage,
      }
    }
  }

  /**
   * Commits session completion upon successful initial onboarding completion.
   */
  public static markOnboardingComplete(options: {
    email?: string | null
    name?: string | null
    projectId: string
    bucketName: string
  }): void {
    const { email, name, projectId, bucketName } = options
    const persistentStore = usePersistentStore.getState()

    persistentStore.setHasCompletedOnboarding(true)
    if (email) persistentStore.setLastAuthUserEmail(email)
    if (name) persistentStore.setLastAuthUserName(name)
    persistentStore.setSavedProjectId(projectId)
    persistentStore.setSavedBucketName(bucketName)
    persistentStore.addRecentBucket(bucketName)

    ObservabilityService.info('AUTH', 'Onboarding completed; session hints recorded.', {
      email,
      projectId,
      bucketName,
    })
  }

  /**
   * Completely purges all volatile credentials and resets persistent session hints.
   */
  public static async purgeSession(): Promise<void> {
    const persistentStore = usePersistentStore.getState()

    // 1. Revoke and clear volatile memory
    await gisAuthService.signOut()

    // 2. Clear persistent session hints
    persistentStore.setHasCompletedOnboarding(false)
    persistentStore.setLastAuthUserEmail(null)
    persistentStore.setLastAuthUserName(null)

    ObservabilityService.info('AUTH', 'Session completely purged; hints reset.')
  }
}
