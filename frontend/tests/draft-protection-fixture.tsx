import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { AssetFormModal } from '../src/components/assets/AssetFormModal'
import { AssetTypeFormModal } from '../src/components/assets/AssetTypeFormModal'
import { InventoryBatchModal } from '../src/components/assets/InventoryBatchModal'
import { AssetSharingModal } from '../src/components/assets/AssetSharingModal'
import { UsageRequestModal } from '../src/components/assets/UsageRequestModal'
import { WorkbookImportModal } from '../src/components/assets/WorkbookImportModal'
import { CatalogImportModal } from '../src/components/assets/CatalogImportModal'
import { TenantFormModal } from '../src/components/tenants/TenantFormModal'
import { UserFormModal } from '../src/components/users/UserFormModal'
import { CreateRequestDialog } from '../src/modules/platform-feedback/CreateRequestDialog'
import type { Asset, AssetType, SharedEquipment } from '../src/modules/assets/types'
import type { Tenant, TenantUser } from '../src/modules/tenants/types'
import { useDraftGuard } from '../src/hooks/useDraftGuard'
import { Modal } from '../src/components/ui/Modal'
import '../src/i18n'
import '../src/index.css'

const type: AssetType = { id: 'draft-type', name: 'Example equipment', description: '', tracking_mode: 'individual', created_at: '', updated_at: '', created_by: 1, schema: [{ key: 'serial', label: 'Serial', type: 'text', required: true }] }
const asset: Asset = { id: 'draft-asset', asset_type: type.id, asset_type_name: type.name, tenant: 1, tenant_name: 'Example yard', custom_data: { serial: 'EX-1' }, created_at: '', updated_at: '', created_by: 1, updated_by: 1 }
const equipment: SharedEquipment = { id: asset.id, tenant: 2, tenant_name: 'Other yard', asset_type_name: type.name, catalog_code: null, category_code: '', tracking_mode: 'individual', shared_at: null, sharing_title: '', sharing_quantity: 5, sharing_capacity: '', sharing_note: '', sharing_availability: 'available', sharing_availability_note: '', sharing_contact_name: '', sharing_contact_email: '', sharing_contact_phone: '' }

function LocalSwitch({ onClose }: { onClose: () => void }) {
    const [value, setValue] = useState('')
    const { requestClose, requestAction, confirmation } = useDraftGuard({ dirty: !!value, onClose })
    return <Modal isOpen title="Local method switch" onClose={requestClose}>
        {confirmation}
        <label>Draft value<input value={value} onChange={event => setValue(event.target.value)} /></label>
        <button onClick={() => requestAction(() => setValue(''))}>Change method</button>
    </Modal>
}

export function Fixture() {
    const form = new URLSearchParams(window.location.search).get('form') ?? 'batch'
    const [open, setOpen] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [tenant, setTenant] = useState<Tenant>({ id: 1, name: 'Initial yard', slug: 'initial', description: 'Initial description', address: '', phone: '', email: '', is_active: true, user_count: 1, created_at: '', updated_at: '' })
    const [user, setUser] = useState<TenantUser>({ id: 1, username: 'initial-user', email: 'initial@example.test', first_name: 'Initial', last_name: '', role: form === 'user-legacy' ? 'tenant_admin' : 'tenant_user', is_active: true, date_joined: '', last_login: null, tenant_name: form === 'user-assigned' ? 'Example yard' : null, tenant_slug: null })
    const close = () => setOpen(false)
    const save = async () => {
        setSaving(true)
        try { await fetch('/api/draft-save/', { method: 'POST' }); setSaved(true); close() }
        finally { setSaving(false) }
    }
    const common = { isOpen: open, onClose: close, isLoading: saving, onSave: save }
    return <main>
        <button onClick={() => setOpen(true)}>Reopen</button>
        <button data-testid="navigate-away" onClick={() => router.history.push('/assets')}>Navigate away</button>
        <button data-testid="refresh-props" onClick={() => { setTenant(current => ({ ...current, name: 'Server yard', description: 'Server description' })); setUser(current => ({ ...current, email: 'server@example.test', first_name: 'Server' })) }}>Refresh server data</button>
        {!open && <p role="status">Form closed</p>}
        {saved && <p role="status">Saved successfully</p>}
        {open && <>
            {form === 'batch' && <InventoryBatchModal isOpen onClose={close} assetTypes={[type]} tenants={[]} isSuperuser={false} initialTypeId={type.id} onCreated={() => setSaved(true)} />}
            {form === 'asset' && <AssetFormModal {...common} mode="create" assetTypes={[type]} tenants={[]} isSuperuser={false} initialTypeId={type.id} />}
            {form === 'type' && <AssetTypeFormModal {...common} />}
            {form === 'tenant' && <TenantFormModal {...common} tenant={null} />}
            {form === 'tenant-edit' && <TenantFormModal {...common} tenant={tenant} />}
            {form === 'user' && <UserFormModal {...common} mode="create" />}
            {['user-edit', 'user-assigned', 'user-legacy'].includes(form) && <UserFormModal {...common} mode="edit" user={user} />}
            {form === 'sharing' && <AssetSharingModal asset={asset} assetType={type} onClose={close} />}
            {form === 'usage' && <UsageRequestModal equipment={equipment} onClose={close} />}
            {form === 'workbook' && <WorkbookImportModal isOpen onClose={close} isGlobalAdmin={false} onSingleTypeImport={() => { close(); setSaved(true) }} />}
            {form === 'catalog' && <CatalogImportModal onClose={close} />}
            {form === 'feedback' && <CreateRequestDialog onClose={close} pagePath="/assets" />}
            {form === 'local-switch' && <LocalSwitch onClose={close} />}
        </>}
    </main>
}

const rootRoute = createRootRoute({ component: Outlet })
const fixtureRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tests/draft-protection.html', component: Fixture })
const destinationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/assets', component: () => <p>Destination screen</p> })
const requestsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/development-requests', component: () => <p>Request list</p> })
const router = createRouter({ routeTree: rootRoute.addChildren([fixtureRoute, destinationRoute, requestsRoute]) })
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
