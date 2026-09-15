"use client"

import * as React from "react"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plug,
} from "lucide-react"
import type { AuthMethod, RepoConfig } from "@/lib/types"

const STEPS = ["Репозиторий", "Аутентификация", "Ветка", "Локальная папка", "Профиль"] as const

export function SetupWizard() {
  const completeSetup = useStore((s) => s.completeSetup)
  const { toast } = useToast()

  const [step, setStep] = React.useState(0)
  const [url, setUrl] = React.useState("git@kb.example.ru:spas/knowledge-base.git")
  const [authMethod, setAuthMethod] = React.useState<AuthMethod>("ssh")
  const [httpsUser, setHttpsUser] = React.useState("")
  const [httpsToken, setHttpsToken] = React.useState("")
  const [sshKeyPath, setSshKeyPath] = React.useState("~/.ssh/id_ed25519")
  const [sshPassphrase, setSshPassphrase] = React.useState("")
  const [branches, setBranches] = React.useState<string[]>([])
  const [branch, setBranch] = React.useState("")
  const [localPath, setLocalPath] = React.useState("~/ids")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [spaceCode, setSpaceCode] = React.useState("SPAS")
  const [connecting, setConnecting] = React.useState(false)
  const [connected, setConnected] = React.useState(false)

  function validateStep(): string | null {
    switch (step) {
      case 0:
        if (!url.trim()) return "Укажите адрес репозитория"
        return null
      case 1:
        if (authMethod === "https") {
          if (!httpsUser.trim()) return "Укажите логин"
          if (!httpsToken.trim()) return "Укажите токен"
        } else {
          if (!sshKeyPath.trim()) return "Укажите путь к SSH-ключу"
        }
        return null
      case 2:
        if (!connected) return "Сначала проверьте подключение"
        if (!branch) return "Выберите ветку"
        return null
      case 3:
        if (!localPath.trim()) return "Укажите локальную папку"
        return null
      case 4:
        if (!name.trim()) return "Укажите ФИО"
        if (!email.trim()) return "Укажите email"
        return null
      default:
        return null
    }
  }

  async function checkConnection() {
    setConnecting(true)
    setConnected(false)
    await new Promise((r) => setTimeout(r, 1200))
    const list = ["main", "develop", "release/lts-2024.1"]
    setBranches(list)
    setBranch("main")
    setConnected(true)
    setConnecting(false)
    toast({
      title: "Подключение установлено",
      description: `Загружено веток: ${list.length}`,
    })
  }

  function next() {
    const err = validateStep()
    if (err) {
      toast({ title: err, variant: "destructive" })
      return
    }
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish()
  }

  function finish() {
    const repo: RepoConfig = {
      url,
      authMethod,
      httpsUser,
      httpsToken,
      sshKeyPath,
      sshPassphrase,
      branch: branch || "main",
      branches: branches.length ? branches : ["main"],
      localPath,
      connected: true,
    }
    completeSetup({ profile: { name, email, spaceCode }, repo })
    toast({ title: "Настройка завершена", description: "Рабочая область готова." })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <img src="/logo.svg" alt="IDS" className="size-12" />
        <h1 className="text-2xl font-semibold tracking-tight">
          IDS · Мастер настройки
        </h1>
        <p className="text-sm text-muted-foreground">
          Шаг {step + 1} из {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{STEPS[step]}</CardTitle>
          <CardDescription>Заполните параметры подключения к Git-репозиторию базы знаний.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="w-url">Адрес Git-репозитория</Label>
              <Input
                id="w-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono text-sm"
                placeholder="git@host:org/repo.git"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Поддерживаются SSH и HTTPS.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Способ аутентификации</Label>
                <Select
                  value={authMethod}
                  onValueChange={(v) => setAuthMethod(v as AuthMethod)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssh">SSH (ключ)</SelectItem>
                    <SelectItem value="https">HTTPS (логин + токен)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {authMethod === "https" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="w-user">Логин</Label>
                    <Input
                      id="w-user"
                      value={httpsUser}
                      onChange={(e) => setHttpsUser(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-token">Токен / пароль</Label>
                    <Input
                      id="w-token"
                      type="password"
                      value={httpsToken}
                      onChange={(e) => setHttpsToken(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="w-key">Путь к SSH-ключу</Label>
                    <Input
                      id="w-key"
                      value={sshKeyPath}
                      onChange={(e) => setSshKeyPath(e.target.value)}
                      className="font-mono text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="w-pass">Passphrase (опционально)</Label>
                    <Input
                      id="w-pass"
                      type="password"
                      value={sshPassphrase}
                      onChange={(e) => setSshPassphrase(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkConnection}
                  disabled={connecting}
                >
                  {connecting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plug className="size-4" />
                  )}
                  Проверить подключение
                </Button>
                {connected && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    Подключено
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-branch">Ветка</Label>
                <Select
                  value={branch}
                  onValueChange={setBranch}
                  disabled={!connected}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={connected ? "Выберите ветку" : "Сначала проверьте подключение"}
                    />
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
            </div>
          )}

          {step === 3 && (
            <div className="space-y-1.5">
              <Label htmlFor="w-path">Локальная папка хранения проекта</Label>
              <Input
                id="w-path"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                className="font-mono text-sm"
                placeholder="~/ids"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Если папка пуста — будет выполнен clone репозитория.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-name">ФИО</Label>
                <Input
                  id="w-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-email">Email</Label>
                <Input
                  id="w-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="iivanov@nota.tech"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="w-space">Код пространства (трекер)</Label>
                <Input
                  id="w-space"
                  value={spaceCode}
                  onChange={(e) => setSpaceCode(e.target.value)}
                  placeholder="SPAS"
                />
                <p className="text-xs text-muted-foreground">Подставляется по умолчанию в номер нового дефекта.</p>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Используется как автор:{" "}
                <code className="font-mono">ФИО &lt;email&gt;</code>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="size-4" />
              Назад
            </Button>
            <Button size="sm" onClick={next}>
              {step === STEPS.length - 1 ? "Завершить" : "Далее"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex w-full items-center justify-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step
                ? "w-8 bg-primary"
                : i < step
                  ? "w-4 bg-primary/60"
                  : "w-4 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
