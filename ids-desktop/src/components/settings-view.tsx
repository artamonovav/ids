"use client"

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
import { ArrowLeft, Plus, X, Save } from "lucide-react"
import {
  DICT_FILES,
  TEMPLATE_PATH,
  readDictionaries,
  readConfig,
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
  name,
  label,
  values,
  onChange,
}: {
  name: DictName
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
  const writeConfig = useStore((s) => s.writeConfig)
  const writeDictionary = useStore((s) => s.writeDictionary)
  const writeTemplateFile = useStore((s) => s.writeTemplateFile)
  const setView = useStore((s) => s.setView)
  const setOffline = useStore((s) => s.setOffline)
  const { toast } = useToast()

  const dictionaries: Dictionaries = React.useMemo(
    () => readDictionaries(repoFiles),
    [repoFiles]
  )
  const cfg = React.useMemo(() => readConfig(repoFiles), [repoFiles])

  const [profile, setProfile] = React.useState(cfg.profile)
  const [recentLimit, setRecentLimit] = React.useState(cfg.recentLimit)
  const [tplContent, setTplContent] = React.useState(
    () => repoFiles[TEMPLATE_PATH] ?? ""
  )

  // синхронизировать локальный state при загрузке repoFiles
  React.useEffect(() => {
    setProfile(readConfig(repoFiles).profile)
    setRecentLimit(readConfig(repoFiles).recentLimit)
    setTplContent(repoFiles[TEMPLATE_PATH] ?? "")
  }, [repoFiles])

  function handleSave() {
    writeConfig({ profile, recentLimit })
    writeTemplateFile(tplContent)
    toast({ title: "Настройки сохранены" })
  }

  function changeDict(name: DictName, values: string[]) {
    writeDictionary(name, values)
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
        <Button size="sm" onClick={handleSave}>
          <Save className="size-4" /> Сохранить
        </Button>
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
              onChange={(e) => setRecentLimit(Math.max(1, parseInt(e.target.value, 10) || 5))}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Хранится в <code className="font-mono">.tmp/config.yaml</code> (не синхронизируется).
          </p>
        </Section>

        {/* Папка проекта */}
        <Section title="Папка проекта" desc="Где хранятся локализации, справочники, шаблон.">
          <Input
            value={base}
            readOnly
            className="font-mono text-xs"
            placeholder="не указана"
          />
          <p className="text-[11px] text-muted-foreground">
            Чтобы сменить папку — пересоздайте проект (удалите <code className="font-mono">paths.json</code> в данных приложения).
          </p>
        </Section>

        {/* Справочники */}
        {DICT_META.map(({ name, label }) => (
          <Section key={name} title={`Справочник: ${label}`} path={DICT_FILES[name]}>
            <DictionaryEditor
              name={name}
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
