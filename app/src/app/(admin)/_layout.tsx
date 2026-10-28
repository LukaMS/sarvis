// The admin portal is web-only (D-005). On native, any /admin link lands on the tabs instead. The web
// gate is in _layout.web.tsx; Metro picks that file on web and this one everywhere else.
import { Redirect } from 'expo-router';

export default function AdminLayoutNative() {
  return <Redirect href="/" />;
}
