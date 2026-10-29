import * as React from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { useStore } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle2, FolderOpen, Loader2 } from "lucide-react"

export interface RepoCheck {
  isRepo: boolean
  branches: string[]
  cloned: boolean
}

export function defaultBranch(branches: string[]): string {
  return (
    branches.find((b) => b === "main") ??
    branches.find((b) => b === "master") ??
    branches[0] ??
    ""
  )
}

/** Источник проекта: папка, либо ссылка на git-репозиторий и папка для клонирования. */
export function useProjectSource(initialFolder = "") {
  const prepareRepo = useStore((s) => s.prepareRepo)
  const { toast } = useToast()
  const [url, setUrlState] = React.useState("")
  const [folder, setFolderState] = React.useState(initialFolder)
  const [checked, setChecked] = React.useState<RepoCheck | null>(null)
  const [checking, setChecking] = React.useState(false)

  // любое изменение входных данных сбрасывает результат проверки
  const setUrl = (v: string) => {
    setUrlState(v)
    setChecked(null)
  }
  const setFolder = (v: string) => {
    setFolderState(v)
    setChecked(null)
  }

  async function browse() {
    const selected = await openDialog({ directory: true, multiple: false })
    if (selected) setFolder(selected as string)
  }

  async function check() {
    const dir = folder.trim()
    if (!dir) {
      toast({ title: "Укажите папку проекта", variant: "destructive" })
      return
    }
    const cloning = url.trim() !== ""
    setChecking(true)
    try {
      const result = await prepareRepo(url, dir)
      setChecked({ ...result, cloned: cloning })
      if (cloning) {
        toast({ title: "Репозиторий склонирован", description: `Веток: ${result.branches.length}` })
      } else if (result.isRepo) {
        toast({ title: "Git-репозиторий найден", description: `Веток: ${result.branches.length}` })
      } else {
        toast({
          title: "Не git-репозиторий",
          description: "Будет создан новый проект со служебными папками.",
        })
      }
    } catch (e) {
      setChecked(null)
      toast({ title: "Ошибка", description: String(e), variant: "destructive" })
    } finally {
      setChecking(false)
    }
  }

  return { url, setUrl, folder, setFolder, checked, checking, browse, check }
}

export type ProjectSource = ReturnType<typeof useProjectSource>

export function ProjectSourceFields({
  source,
  idPrefix,
}: {
  source: ProjectSource
  idPrefix: string
}) {
  const { url, setUrl, folder, setFolder, checked, checking, browse, check } = source
  const cloning = url.trim() !== ""

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-url`}>
          Ссылка на git-репозиторий <span className="text-muted-foreground">(необязательно)</span>
        </Label>
        <Input
          id={`${idPrefix}-url`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="git@github.com:org/ids-kb.git"
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-folder`}>
          {cloning ? "Папка для клонирования (должна быть пустой)" : "Путь к папке проекта"}
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-folder`}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="~/ids-kb"
            className="font-mono text-sm"
          />
          <Button variant="outline" size="sm" onClick={browse}>
            <FolderOpen className="size-4" />
            <span className="hidden sm:inline">Обзор</span>
          </Button>
          <Button variant="outline" size="sm" onClick={check} disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
            {cloning ? "Клонировать" : "Проверить"}
          </Button>
        </div>
      </div>
      {checked?.isRepo && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mr-1 inline size-3.5" />
          {checked.cloned ? "Репозиторий склонирован" : "Git-репозиторий"}, веток: {checked.branches.length}
        </p>
      )}
      {checked && !checked.isRepo && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Не git-репозиторий — будет создан новый проект
        </p>
      )}
    </div>
  )
}

export function BranchSelect({
  branches,
  value,
  onChange,
}: {
  branches: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label>Ветка</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
