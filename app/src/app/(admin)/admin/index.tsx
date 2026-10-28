// /admin. A thin lazy wrapper: the page itself is a separate web chunk, fetched only after the gate in
// (admin)/_layout.web.tsx lets the user in.
import { lazy, Suspense } from 'react';

import { AdminLoading } from '../../../components/admin/AdminLoading';

const AdminHome = lazy(() => import('../../../components/admin/AdminHome'));

export default function AdminIndex() {
  return (
    <Suspense fallback={<AdminLoading testID="admin-loading" />}>
      <AdminHome />
    </Suspense>
  );
}
