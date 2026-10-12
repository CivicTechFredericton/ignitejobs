/** Start the FerrisKey sign-in flow (run by the API) and come back to `returnTo` afterwards. */
export const signInHref = (returnTo: string) => `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
