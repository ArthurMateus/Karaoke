/** Development only: add ?robot to the URL and a robot sings instead of the microphone. */
export function robotMode(): boolean {
  return import.meta.env.DEV && new URLSearchParams(location.search).has('robot')
}
