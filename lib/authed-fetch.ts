/**
 * Fetch wrapper that redirects to login on 401 responses.
 * Use this for all client-side API calls to prevent infinite loading states.
 */
export async function authedFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options)
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/brain/login'
    // Return a never-resolving promise to prevent further processing while redirecting
    return new Promise(() => {})
  }
  return res
}
