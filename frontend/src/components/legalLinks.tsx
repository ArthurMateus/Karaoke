import { Link } from 'react-router'

/** The Terms and Privacy links inside a translated sentence (<terms>, <privacy>).
 *  They open in a new tab, so a half-filled form stays as it is. */
export const LEGAL_LINKS = {
  terms: <Link to="/terms" target="_blank" rel="noopener" />,
  privacy: <Link to="/privacy" target="_blank" rel="noopener" />,
}
