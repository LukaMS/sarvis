// Company detail placeholder. The header is configured in the root layout.
import { StackPlaceholder } from '../../components/navigation/PlaceholderScreen';

export { RouteErrorBoundary as ErrorBoundary } from '../../components/ui/RouteErrorBoundary';

export default function CompanyScreen() {
  return <StackPlaceholder id="company" title="Company" />;
}
