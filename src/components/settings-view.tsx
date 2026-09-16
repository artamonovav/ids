"use client"

import * as React from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ArrowLeft,
  Plus,
  X,
  Save,
  Plug,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import {
  CONFIG_PATH,
  DICT_FILES,
  TEMPLATE_PATH,
  readDictionaries,
  readConfig,
} from "@/lib/repo"
import type { AuthMethod, Dictionaries, DictName, RepoConfig } from "@/lib/types"

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
    if (!v || values.includes(v)) {
      setInput("")
      return
    }
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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
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
  const settings = useStore((s) => s.settings)
  const repoFiles = useStore((s) => s.repoFiles)
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
  const initialConfig = React.useMemo(() => readConfig(repoFiles), [repoFiles])

  const [profile, setProfile] = React.useState(initialConfig.profile)
  const [repo, setRepo] = React.useState<RepoConfig>(initialConfig.repo)
  const [tplContent, setTplContent] = React.useState(
    () => repoFiles[TEMPLATE_PATH] ?? ""
  )
  const [connecting, setConnecting] = React.useState(false)
  const [connected, setConnected] = React.useState(repo.connected)

  async function checkConnection() {
    if (!repo.url.trim()) {
      toast({ title: "Укажите адрес репозитория", variant: "destructive" })
      return
    }
    setConnecting(true)
    await new Promise((r) => setTimeout(r, 1100))
    const branches = repo.branches.length > 0 ? repo.branches : ["main", "develop"]
    setRepo((r) => ({ ...r, branches, branch: r.branch || branches[0] }))
    setConnected(true)
    setConnecting(false)
    toast({
      title: "Подключение установлено",
      description: `Доступно веток: ${branches.length}`,
    })
  }

  function handleSave() {
    writeConfig({ profile, repo: { ...repo, connected } })
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
            <p className="text-xs text-muted-foreground">
              Профиль, репозиторий, справочники и шаблон.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave}>
          <Save className="size-4" />
          Сохранить
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Профиль + код пространства — локально, .tmp/config.yaml */}
        <Section
          title="Профиль пользователя"
          desc="Используется как автор локализаций. Автор сериализуется как ФИО <email>."
          path={CONFIG_PATH}
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
            <Label htmlFor="p-space" className="text-xs">Код пространства (трекер)</Label>
            <Input
              id="p-space"
              className="h-8 text-sm"
              value={profile.spaceCode}
              onChange={(e) => setProfile({ ...profile, spaceCode: e.target.value })}
              placeholder="SPAS"
            />
            <p className="text-[11px] text-muted-foreground">
              Подставляется по умолчанию в номер нового дефекта (поле свободное).
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Профиль и git-аутентификация хранятся локально в{" "}
            <code className="font-mono">.tmp/config.yaml</code> (в .gitignore, не
            синхронизируются).
          </p>
        </Section>

        {/* Репозиторий + аутентификация — локально, .tmp/config.yaml */}
        <Section title="Репозиторий" desc="Хранение базы знаний в Git." path={CONFIG_PATH}>
          <div className="space-y-2">
            <Label htmlFor="r-url" className="text-xs">Адрес репозитория</Label>
            <Input
              id="r-url"
              value={repo.url}
              onChange={(e) => setRepo({ ...repo, url: e.target.value })}
              placeholder="git@kb.example.ru:spas/knowledge-base.git"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Способ аутентификации</Label>
            <Select
              value={repo.authMethod}
              onValueChange={(v) => setRepo({ ...repo, authMethod: v as AuthMethod })}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ssh">SSH (ключ)</SelectItem>
                <SelectItem value="https">HTTPS (логин + токен)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {repo.authMethod === "https" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="r-user" className="text-xs">Логин</Label>
                <Input
                  id="r-user"
                  className="h-8 text-sm"
                  value={repo.httpsUser}
                  onChange={(e) => setRepo({ ...repo, httpsUser: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="r-token" className="text-xs">Токен / пароль</Label>
                <Input
                  id="r-token"
                  type="password"
                  className="h-8 text-sm"
                  value={repo.httpsToken}
                  onChange={(e) => setRepo({ ...repo, httpsToken: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="r-key" className="text-xs">Путь к SSH-ключу</Label>
                <Input
                  id="r-key"
                  value={repo.sshKeyPath}
                  onChange={(e) => setRepo({ ...repo, sshKeyPath: e.target.value })}
                  className="font-mono text-xs"
                  placeholder="~/.ssh/id_ed25519"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="r-pass" className="text-xs">Passphrase (опц.)</Label>
                <Input
                  id="r-pass"
                  type="password"
                  className="h-8 text-sm"
                  value={repo.sshPassphrase}
                  onChange={(e) => setRepo({ ...repo, sshPassphrase: e.target.value })}
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="r-branch" className="text-xs">Ветка</Label>
            <Select
              value={repo.branch}
              onValueChange={(v) => setRepo({ ...repo, branch: v })}
              disabled={!connected}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue placeholder={connected ? "Выберите ветку" : "Сначала проверьте подключение"} />
              </SelectTrigger>
              <SelectContent>
                {repo.branches.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-path" className="text-xs">Локальная папка</Label>
            <Input
              id="r-path"
              value={repo.localPath}
              onChange={(e) => setRepo({ ...repo, localPath: e.target.value })}
              className="font-mono text-xs"
              placeholder="~/ids"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="h-8" onClick={checkConnection} disabled={connecting}>
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plug className="size-4" />
              )}
              Проверить подключение
            </Button>
            {connected && (
              <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                Подключено
              </Badge>
            )}
          </div>
        </Section>

        {/* Справочники — база знаний, .dictionary/*.yaml */}
        {DICT_META.map(({ name, label }) => (
          <Section
            key={name}
            title={`Справочник: ${label}`}
            path={DICT_FILES[name]}
          >
            <DictionaryEditor
              name={name}
              label={label}
              values={dictionaries[name]}
              onChange={(v) => changeDict(name, v)}
            />
          </Section>
        ))}

        {/* Шаблон — база знаний, _template/localization.md */}
        <Section
          title="Шаблон локализации"
          desc="Эталон нового документа. Читается из репозитория при создании."
          path={TEMPLATE_PATH}
        >
          <Textarea
            value={tplContent}
            onChange={(e) => setTplContent(e.target.value)}
            rows={14}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Изменения применяются после «Сохранить». Frontmatter задаёт значения по
            умолчанию, тело — структуру новых документов.
          </p>
        </Section>

        {/* Режим — UI-состояние */}
        <Section title="Режим работы" desc="Автономный режим откладывает отправку до восстановления связи.">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Автономный режим</p>
              <p className="text-[11px] text-muted-foreground">
                Сохранение локально с отложенной отправкой.
              </p>
            </div>
            <Switch checked={settings.offline} onCheckedChange={(v) => setOffline(v)} />
          </div>
        </Section>
      </div>

      <Separator />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave}>
          <Save className="size-4" />
          Сохранить
        </Button>
      </div>
    </div>
  )
}
