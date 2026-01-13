
/**
 * خدمة التحليلات (Analytics Service) - Mock
 * تم إيقاف PostHog بناءً على طلب المستخدم.
 */
export const analytics = {
  identify: (_userId: string, _traits: Record<string, any> = {}) => {
    // No-op
  },
  
  track: (_eventName: string, _properties: Record<string, any> = {}) => {
    // No-op
  },
  
  reset: () => {
    // No-op
  }
};
