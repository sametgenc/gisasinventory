import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DataTable, type ColumnDef } from '../src/components/ui/DataTable'
import { ThemeProvider } from '../src/components/ThemeProvider'
import '../src/i18n'
import '../src/index.css'

interface Row { id: string; name: string }

const rows: Row[] = ['Alpha', 'Beta'].flatMap(group => Array.from({ length: 60 }, (_, index) => ({
    id: `${group}-${index + 1}`,
    name: `${group} ${String(index + 1).padStart(3, '0')}`,
})))
const columns: ColumnDef<Row>[] = [{ key: 'name', header: 'Name', cell: row => row.name, sortable: true, sortAccessor: row => row.name }]

export function Fixture() {
    const [search, setSearch] = useState('')
    const [remaining, setRemaining] = useState(rows.length)
    return <main className="mx-auto max-w-4xl p-4">
        <label className="mb-4 block">Search fixture<input value={search} onChange={event => setSearch(event.target.value)} className="ml-2 border p-1" /></label>
        <button type="button" onClick={() => setRemaining(count => Math.max(0, count - 10))} className="mb-4 border p-2">Remove ten records</button>
        <DataTable data={rows.slice(0, remaining).filter(row => row.name.includes(search))} columns={columns} pageSize={10} />
    </main>
}

createRoot(document.getElementById('root')!).render(<ThemeProvider><Fixture /></ThemeProvider>)
