import * as React from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ArrowLeft, Plus, X, Save, GitBranch, RotateCcw } from "lucide-react"
import {
  BranchSelect,
  ProjectSourceFields,
  defaultBranch,
  useProjectSource,
} from "@/components/project-source"
import {
  DICT_FILES,
  TEMPLATE_PATH,
  readDictionaries,
} from "@/lib/repo"
import type { Dictionaries, DictName } from "@/lib/types"

const DICT_META: { name: DictName; label: string }[] = [
  { name: "type", label: "Тип" },
  { name: "client", label: "Клиент" },
  { name: "environment", label: "Окружение" },
  { name: "product", label: "Продукт" },
  { name: "scope", label: "Массовость" },
]

function Section({
  title,
  desc,
  path,
  children,
}: {
  title: string
  desc?: string
  path?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {desc && <CardDescription className="text-xs">{desc}</CardDescription>}
          </div>
          {path && (
            <code className="truncate text-[11px] text-muted-foreground" title={path}>
              {path}
            </code>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">{children}</CardContent>
    </Card>
  )
}

function DictionaryEditor({
  label,
  values,
  onChange,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
}) {
  const [input, setInput] = React.useState("")
  function add() {
    const v = input.trim()
    if (!v || values.includes(v)) { setInput(""); return }
    onChange([...values, v])
    setInput("")
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 py-0 text-xs">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="ml-0.5 text-muted-foreground hover:text-foreground"
              aria-label={`Удалить ${v}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">Список пуст.</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={`Добавить значение в «${label}»`}
          className="h-8 text-sm"
        />
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={add}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function SettingsView() {
  const base = useStore((s) => s.base)
  const repoFiles = useStore((s) => s.repoFiles)
  const settings = useStore((s) => s.settings)
  const config = useStore((s) => s.config)
  const writeConfig = useStore((s) => s.writeConfig)
  const writeDictionary = useStore((s) => s.writeDictionary)
  const writeTemplateFile = useStore((s) => s.writeTemplateFile)
  const setView = useStore((s) => s.setView)
  const setOffline = useStore((s) => s.setOffline)
  const applyProject = useStore((s) => s.applyProject)
  const resetSetup = useStore((s) => s.resetSetup)
  const { toast } = useToast()
  const source = useProjectSource(base)
  const [branch, setBranch] = React.useState("")
  const [switching, setSwitching] = React.useState(false)

  const dictionaries: Dictionaries = React.useMemo(
    () => readDictionaries(repoFiles),
    [repoFiles]
  )

  const [profile, setProfile] = React.useState(config.profile)
  const [recentLimit, setRecentLimit] = React.useState(config.recentLimit)
  const [tplContent, setTplContent] = React.useState(
    () => repoFiles[TEMPLATE_PATH] ?? ""
  )

  // синхронизировать локальный state при загрузке настроек и шаблона
  React.useEffect(() => {
    setProfile(config.profile)
    setRecentLimit(config.recentLimit)
  }, [config])

  React.useEffect(() => {
    setTplContent(repoFiles[TEMPLATE_PATH] ?? "")
  }, [repoFiles])

  const checked = source.checked
  const isRepo = !!checked?.isRepo && checked.branches.length > 0

  React.useEffect(() => {
    setBranch(checked && isRepo ? defaultBranch(checked.branches) : "")
  }, [checked])

  async function handleSave() {
    try {
      await writeConfig({ ...config, profile, recentLimit })
      await writeTemplateFile(tplContent)
      toast({ title: "Настройки сохранены" })
    } catch (e) {
      toast({ title: "Не удалось сохранить", description: String(e), variant: "destructive" })
    }
  }

  async function handleSwitchProject() {
    const folder = source.folder.trim()
    setSwitching(true)
    try {
      await applyProject(folder, isRepo ? branch : null)
      toast({ title: "Папка проекта изменена", description: folder })
    } catch (e) {
      toast({ title: "Не удалось открыть проект", description: String(e), variant: "destructive" })
    }
    setSwitching(false)
  }

  function changeDict(name: DictName, values: string[]) {
    writeDictionary(name, values)
  }

  async function handleReset() {
    try {
      await resetSetup()
      toast({ title: "Мастер настройки", description: "Укажите папку проекта." })
    } catch (e) {
      toast({ title: "Не удалось сбросить", description: String(e), variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setView("workspace")}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Настройки</h1>
            <p className="text-xs text-muted-foreground">Профиль, папка, справочники, шаблон.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RotateCcw className="size-4" /> Сброс
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Сбросить настройки?</AlertDialogTitle>
                <AlertDialogDescription>
                  Приложение закроет текущий проект и откроет мастер настройки.
                  Файлы на диске не удаляются. Профиль и остальные настройки сохранятся.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>
                  Сбросить и открыть мастер
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={handleSave}>
            <Save className="size-4" /> Сохранить
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Профиль */}
        <Section
          title="Профиль пользователя"
          desc="Используется как автор локализаций. Автор сериализуется как ФИО <email>."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="p-name" className="text-xs">ФИО</Label>
              <Input
                id="p-name"
                className="h-8 text-sm"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Иван Иванов"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-email" className="text-xs">Email</Label>
              <Input
                id="p-email"
                type="email"
                className="h-8 text-sm"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="iivanov@nota.tech"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-recent" className="text-xs">Локализаций в «Последние»</Label>
            <Input
              id="p-recent"
              type="number"
              min={1}
              max={100}
              className="h-8 w-24 text-sm"
              value={recentLimit}
              onChange={(e) => setRecentLimit(Math.max(1, parseInt(e.target.value, 10) || 3))}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Хранится в настройках пользователя ОС, не в папке проекта.
          </p>
        </Section>

        {/* Папка проекта */}
        <Section
          title="Папка проекта"
          desc="Текущая папка: локализации, справочники, шаблон. Можно сменить без перезапуска."
        >
          <div className="space-y-3">
            <ProjectSourceFields source={source} idPrefix="s" />
            {isRepo && (
              <BranchSelect branches={checked!.branches} value={branch} onChange={setBranch} />
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleSwitchProject}
              disabled={!checked || switching || source.checking}
            >
              <GitBranch className="size-4" />
              {switching ? "Открываю…" : "Открыть эту папку"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Файлы на диске не удаляются. Несохранённые изменения в открытой локализации будут потеряны.
            </p>
          </div>
        </Section>

        {/* Справочники */}
        {DICT_META.map(({ name, label }) => (
          <Section key={name} title={`Справочник: ${label}`} path={DICT_FILES[name]}>
            <DictionaryEditor
              label={label}
              values={dictionaries[name]}
              onChange={(v) => changeDict(name, v)}
            />
          </Section>
        ))}

        {/* Шаблон */}
        <Section
          title="Шаблон локализации"
          desc="Эталон нового документа. Читается при создании."
          path={TEMPLATE_PATH}
        >
          <Textarea
            value={tplContent}
            onChange={(e) => setTplContent(e.target.value)}
            rows={14}
            className="font-mono text-xs"
          />
        </Section>

        {/* Режим */}
        <Section title="Режим работы" desc="Автономный режим откладывает отправку.">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Автономный режим</p>
              <p className="text-[11px] text-muted-foreground">Сохранение локально с отложенной отправкой.</p>
            </div>
            <Switch checked={settings.offline} onCheckedChange={(v) => setOffline(v)} />
          </div>
        </Section>
      </div>

      <Separator />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave}>
          <Save className="size-4" /> Сохранить
        </Button>
      </div>
    </div>
  )
}
