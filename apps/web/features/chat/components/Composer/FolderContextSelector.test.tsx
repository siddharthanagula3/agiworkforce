import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FolderContextSelector } from './FolderContextSelector';

// Stub auth store
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1' } }),
}));

// Stub folder management service
vi.mock('@features/chat/services/folder-management-service', () => ({
  folderManagementService: {
    getUserFolders: vi.fn(),
  },
}));

// Stub Radix Popover
vi.mock('@shared/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="folder-popover">{children}</div>
  ),
}));

import { folderManagementService } from '@features/chat/services/folder-management-service';

describe('FolderContextSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when user has no folders', async () => {
    vi.mocked(folderManagementService.getUserFolders).mockResolvedValue([]);

    const { container } = render(
      <FolderContextSelector selectedFolderId={null} onChange={vi.fn()} />,
    );

    await waitFor(() => {
      // Component renders null when no folders exist
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders the folder button when folders exist', async () => {
    vi.mocked(folderManagementService.getUserFolders).mockResolvedValue([
      {
        id: 'f1',
        userId: 'user-1',
        name: 'My Project',
        color: 'blue',
        icon: 'folder',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    render(<FolderContextSelector selectedFolderId={null} onChange={vi.fn()} />);

    await waitFor(() => {
      // The trigger button should appear with label for folder selection
      expect(screen.getByRole('button', { name: /select project folder/i })).toBeInTheDocument();
    });
  });

  it('shows selected folder name when a folder is selected', async () => {
    vi.mocked(folderManagementService.getUserFolders).mockResolvedValue([
      {
        id: 'f1',
        userId: 'user-1',
        name: 'Work Stuff',
        color: 'green',
        icon: 'folder',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    render(<FolderContextSelector selectedFolderId="f1" onChange={vi.fn()} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /project: work stuff/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('lists all folders in the popover', async () => {
    vi.mocked(folderManagementService.getUserFolders).mockResolvedValue([
      {
        id: 'f1',
        userId: 'user-1',
        name: 'Alpha',
        color: 'blue',
        icon: 'folder',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'f2',
        userId: 'user-1',
        name: 'Beta',
        color: 'red',
        icon: 'folder',
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    render(<FolderContextSelector selectedFolderId={null} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  it('shows "No folder" option in the popover', async () => {
    vi.mocked(folderManagementService.getUserFolders).mockResolvedValue([
      {
        id: 'f1',
        userId: 'user-1',
        name: 'SomeFolder',
        color: 'gray',
        icon: 'folder',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    render(<FolderContextSelector selectedFolderId="f1" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No folder')).toBeInTheDocument();
    });
  });

  it('gracefully handles service errors without rendering', async () => {
    vi.mocked(folderManagementService.getUserFolders).mockRejectedValue(new Error('DB error'));

    const { container } = render(
      <FolderContextSelector selectedFolderId={null} onChange={vi.fn()} />,
    );

    await waitFor(() => {
      // On error, folders stay empty → component renders null
      expect(container.firstChild).toBeNull();
    });
  });

  it('disables the trigger button when disabled prop is true', async () => {
    vi.mocked(folderManagementService.getUserFolders).mockResolvedValue([
      {
        id: 'f1',
        userId: 'user-1',
        name: 'Work',
        color: 'blue',
        icon: 'folder',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    render(<FolderContextSelector selectedFolderId={null} onChange={vi.fn()} disabled />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /select project folder/i });
      expect(button).toBeDisabled();
    });
  });
});
