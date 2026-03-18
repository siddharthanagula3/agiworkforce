'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Badge } from '@shared/ui/badge';
import {
  Brain,
  Search,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  AlertTriangle,
  Save,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface Memory {
  id: string;
  content: string;
  category: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf-token='))
      ?.split('=')[1] ?? ''
  );
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': getCsrfToken(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/memory?limit=100', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = (await res.json()) as { memories?: Memory[] };
      setMemories(data.memories ?? []);
    } catch {
      toast.error('Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMemories();
  }, [fetchMemories]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast.success('Memory deleted');
    } catch {
      toast.error('Failed to delete memory');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: editContent.trim(), updatedAt: new Date().toISOString() }
            : m,
        ),
      );
      setEditingId(null);
      toast.success('Memory updated');
    } catch {
      toast.error('Failed to update memory');
    }
  };

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          content: newContent.trim(),
          category: newCategory.trim() || undefined,
          source: 'web',
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = (await res.json()) as { memory: Memory };
      setMemories((prev) => [data.memory, ...prev]);
      setNewContent('');
      setNewCategory('');
      setShowAddForm(false);
      toast.success('Memory created');
    } catch {
      toast.error('Failed to create memory');
    }
  };

  const handleResetAll = async () => {
    try {
      for (const memory of memories) {
        await fetch(`/api/memory/${memory.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
      }
      setMemories([]);
      setShowResetConfirm(false);
      toast.success('All memories cleared');
    } catch {
      toast.error('Failed to clear memories');
    }
  };

  const filteredMemories = memories.filter((m) =>
    searchQuery
      ? m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.category?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      : true,
  );

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Memory</h1>
          <p className="mt-2 text-zinc-400">
            View and manage what the AI remembers about you and your preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Memory
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Reset confirmation banner */}
      {showResetConfirm && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center justify-between pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <div>
                <p className="font-medium text-red-400">Clear all memories?</p>
                <p className="text-sm text-zinc-400">
                  This will permanently delete {memories.length} memories. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void handleResetAll()}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Delete All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add memory form */}
      {showAddForm && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-lg">Add New Memory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="What should the AI remember?"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-primary/30"
              rows={3}
              maxLength={10000}
            />
            <div className="flex items-center gap-3">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category (optional)"
                className="max-w-[200px]"
              />
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleCreate()} disabled={!newContent.trim()}>
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories..."
          className="pl-10"
        />
      </div>

      {/* Memory list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : filteredMemories.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="mb-4 h-12 w-12 text-zinc-600" />
            <h3 className="mb-2 text-lg font-medium text-zinc-300">
              {searchQuery ? 'No matching memories' : 'No memories yet'}
            </h3>
            <p className="max-w-md text-sm text-zinc-500">
              {searchQuery
                ? 'Try a different search term'
                : 'The AI will automatically remember important details from your conversations. You can also add memories manually.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredMemories.map((memory) => (
            <Card key={memory.id} className="border-zinc-800 bg-zinc-900">
              <CardContent className="pt-4">
                {editingId === memory.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary/30"
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        <X className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => void handleUpdate(memory.id)}>
                        <Save className="mr-1 h-3 w-3" />
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <p className="whitespace-pre-wrap text-sm text-zinc-200">{memory.content}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        {memory.category && (
                          <Badge variant="outline" className="text-[10px]">
                            {memory.category}
                          </Badge>
                        )}
                        <span>{formatDate(memory.updatedAt)}</span>
                        <span className="text-zinc-600">via {memory.source}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingId(memory.id);
                          setEditContent(memory.content);
                        }}
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                        aria-label="Edit memory"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(memory.id)}
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        aria-label="Delete memory"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Footer count */}
      {!loading && memories.length > 0 && (
        <p className="text-center text-xs text-zinc-600">
          {filteredMemories.length} of {memories.length} memories
        </p>
      )}
    </div>
  );
}
