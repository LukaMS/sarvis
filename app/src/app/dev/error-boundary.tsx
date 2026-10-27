// Dev-only screen that throws while rendering, to check RouteErrorBoundary. Production builds redirect home.
import { Redirect } from 'expo-router';

export { RouteErrorBoundary as ErrorBoundary } from '../../components/ui/RouteErrorBoundary';

export default function ErrorBoundaryTest() {
  if (!__DEV__) return <Redirect href="/" />;
  throw new Error('Deliberate render error from /dev/error-boundary');
}
