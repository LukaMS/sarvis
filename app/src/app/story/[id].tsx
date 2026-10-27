// Story detail placeholder. The transparent header with a white back arrow sits over the cover band.
import { StackPlaceholder } from '../../components/navigation/PlaceholderScreen';

export { RouteErrorBoundary as ErrorBoundary } from '../../components/ui/RouteErrorBoundary';

export default function StoryScreen() {
  return <StackPlaceholder id="story" title="Story" cover />;
}
