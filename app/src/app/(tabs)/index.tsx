// Impact (home) tab placeholder. Links reach the stack placeholders until Phase 8 adds real entry points.
import { PlaceholderLink, TabPlaceholder } from '../../components/navigation/PlaceholderScreen';

const STACK_LINKS = [
  { id: 'product', href: '/product/sample', label: 'Product Details' },
  { id: 'company', href: '/company/sample', label: 'Company Details' },
  { id: 'story', href: '/story/sample', label: 'Story' },
  { id: 'receipt', href: '/receipt/sample', label: 'Receipt Details' },
  { id: 'receipt-scan', href: '/receipt-scan', label: 'Scan Receipt' },
  { id: 'receipt-results', href: '/receipt-results', label: 'Receipt Results' },
  { id: 'stories', href: '/stories', label: 'Impact Stories' },
  { id: 'profile', href: '/profile', label: 'Profile' },
  { id: 'settings', href: '/settings', label: 'Settings' },
  { id: 'privacy', href: '/privacy', label: 'Privacy' },
  { id: 'help', href: '/help', label: 'Help & Support' },
  { id: 'about', href: '/about', label: 'About' },
];

export default function ImpactScreen() {
  return (
    <TabPlaceholder id="impact" title="Impact" showProfile scrim>
      {STACK_LINKS.map((link) => (
        <PlaceholderLink
          key={link.id}
          href={link.href}
          label={link.label}
          testID={`impact-link-${link.id}`}
        />
      ))}
    </TabPlaceholder>
  );
}
