import { useState, type FormEvent } from 'react';
import { SCOPE_CONFIG, type Scope, type Task, type TaskFolder } from '../../tasks/types/task.types';

interface FolderManagerProps {
  folders: TaskFolder[];
  tasks: Task[];
  selectedFolderId: 'all' | string;
  onSelectFolder: (folderId: 'all' | string) => void;
  onCreateFolder: (name: string, scope?: Scope) => void;
  onDeleteFolder: (folderId: string) => void;
}

export function FolderManager({
  folders,
  tasks,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
}: FolderManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderScope, setFolderScope] = useState<Scope>('work');

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = folderName.trim();
    if (!trimmed) return;
    onCreateFolder(trimmed, folderScope);
    setFolderName('');
    setIsCreating(false);
  }

  return (
    <section
      aria-label="Pastas de Tarefas"
      className="rounded-3xl border border-[#E5E4E0] bg-white p-4 shadow-[0_4px_20px_rgba(15,15,18,0.04)] sm:p-5 dark:border-[#27272A] dark:bg-[#141418]"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
            📁 Pastas
          </h2>
          <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
            Organize suas tarefas por pastas
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating((prev) => !prev)}
          className="cursor-pointer rounded-xl bg-[#FEE2E2] px-3 py-1.5 text-[12px] font-bold text-[#991B1B] transition-colors hover:bg-[#FECACA] active:scale-95 dark:bg-[#3B1219] dark:text-[#FCA5A5]"
        >
          {isCreating ? 'Cancelar' : '+ Nova pasta'}
        </button>
      </div>

      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="mb-3 flex flex-col gap-2.5 rounded-2xl border border-[#E5E4E0] bg-[#F8F7F4] p-3 dark:border-[#2E2E34] dark:bg-[#1C1C22]"
        >
          <input
            type="text"
            aria-label="Nome da nova pasta"
            placeholder="Nome da pasta (ex.: Pós-graduação)"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            className="min-h-[40px] w-full rounded-xl border border-[#D6D3CD] bg-white px-3 text-[15px] text-[#0F0F12] outline-none focus:border-[#991B1B] dark:border-[#2E2E34] dark:bg-[#141418] dark:text-[#F4F4F5]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(['work', 'personal', 'study'] as Scope[]).map((s) => {
                const cfg = SCOPE_CONFIG[s];
                const active = folderScope === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFolderScope(s)}
                    style={active ? { backgroundColor: cfg.color } : undefined}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                      active
                        ? 'text-white'
                        : 'border border-[#D6D3CD] bg-white text-[#52525B] dark:border-[#2E2E34] dark:bg-[#141418] dark:text-[#D4D4D8]'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <button
              type="submit"
              className="cursor-pointer rounded-xl bg-[#991B1B] px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#7F1D1D]"
            >
              Salvar pasta
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectFolder('all')}
          className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold transition-all ${
            selectedFolderId === 'all'
              ? 'bg-[#0F0F12] text-white shadow-xs dark:bg-[#991B1B]'
              : 'bg-[#F8F7F4] text-[#52525B] hover:bg-[#ECE9E2] dark:bg-[#1C1C22] dark:text-[#D4D4D8]'
          }`}
        >
          <span>Todas as pastas</span>
          <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
            {tasks.length}
          </span>
        </button>

        {folders.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          const count = tasks.filter((t) => t.folderId === folder.id).length;
          const scopeColor = folder.scope ? SCOPE_CONFIG[folder.scope].color : '#991B1B';

          return (
            <div
              key={folder.id}
              className={`inline-flex min-h-[36px] items-center rounded-xl border transition-all ${
                isSelected
                  ? 'border-transparent bg-[#991B1B] text-white shadow-xs'
                  : 'border-[#E5E4E0] bg-[#F8F7F4] text-[#0F0F12] hover:bg-[#ECE9E2] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectFolder(folder.id)}
                className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: isSelected ? '#FFFFFF' : scopeColor }}
                />
                <span>{folder.name}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-[#E5E4E0] text-[#52525B] dark:bg-[#27272A] dark:text-[#D4D4D8]'
                  }`}
                >
                  {count}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Excluir pasta ${folder.name}`}
                onClick={() => onDeleteFolder(folder.id)}
                className={`mr-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[13px] leading-none transition-colors ${
                  isSelected
                    ? 'text-white/80 hover:bg-white/20 hover:text-white'
                    : 'text-[#71717A] hover:bg-[#E5E4E0] hover:text-[#B91C1C] dark:hover:bg-[#27272A]'
                }`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
