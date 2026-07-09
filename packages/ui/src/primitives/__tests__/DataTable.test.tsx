import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, createSortableHeader } from '../DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: createSortableHeader('Name') },
];

describe('DataTable', () => {
  it('renders rows without crashing', () => {
    render(<DataTable columns={columns} data={[{ id: '1', name: 'First row' }]} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('First row')).toBeTruthy();
  });

  it('renders the empty state when there are no rows', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No results found.')).toBeTruthy();
  });
});
