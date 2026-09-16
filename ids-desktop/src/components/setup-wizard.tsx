"use client"

import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  FolderOpen,
  CheckCircle2,
} from "lucide-react"

const STEPS = ["Папка проекта", "Ветка", "Профиль"] as const

export function SetupWizard() {
  const completeSetup = useStore((s) => s.completeSetup)
  const { toast } = useToast()

  const [step, setStep] = React.useState(0)
  const [folder, setFolder] = React.useState("")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [branches, setBranches] = React.useState<string[]>([])
  const [branch, setBranch] = React.useState("")
  const [checking, setChecking] = React.useState(false)
  const [isRepo, setIsRepo] = React.useState(false)

  async function checkFolder() {
    if (!folder.trim()) {
      toast({ title: "Укажите путь к папке", variant: "destructive" })
      return
    }
    setChecking(true)
    try {
      const repo = await invoke<boolean>("is_git_repo", { folder })
      setIsRepo(repo)
      if (repo) {
        const brs = await invoke<string[]>("git_branches", { folder })
        setBranches(brs)
        if (brs.length > 0 && !branch) setBranch(brs[0])
        toast({ title: "Git-репозиторий найден", description: `Веток: ${brs.length}` })
      } else {
        setBranches([])
        toast({
          title: "Не git-репозиторий",
          description: "Будет создан новый проект со служебными папками.",
        })
      }
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" })
    }
    setChecking(false)
  }

  function validateStep(): string | null {
    switch (step) {
      case 0:
        if (!folder.trim()) return "Укажите путь к папке проекта"
        return null
      case 1:
        if (isRepo && !branch) return "Выберите ветку"
        return null
      case 2:
        if (!name.trim()) return "Укажите ФИО"
        if (!email.trim()) return "Укажите email"
        return null
      default:
        return null
    }
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

  async function finish() {
    try {
      await completeSetup(folder, name, email, branch || "main")
      toast({ title: "Проект синхронизирован", description: "Открываю рабочую область…" })
    } catch (e) {
      toast({ title: "Ошибка синхронизации", description: String(e), variant: "destructive" })
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-10">
      <img src="/logo.svg" alt="IDS" className="size-12 mb-4" />
      <h1 className="text-2xl font-semibold tracking-tight">IDS · Мастер настройки</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Шаг {step + 1} из {STEPS.length}: {STEPS[step]}
      </p>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="w-folder">Путь к папке проекта (git-репозиторий)</Label>
                <div className="flex gap-2">
                  <Input
                    id="w-folder"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="~/ids-kb"
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={checkFolder} disabled={checking}>
                    {checking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FolderOpen className="size-4" />
                    )}
                    Проверить
                  </Button>
                </div>
              </div>
              {isRepo && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="mr-1 inline size-3.5" />
                  Git-репозиторий, {branches.length} веток
                </p>
              )}
              {!isRepo && folder && !checking && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Не git-репозиторий — будет создан новый проект
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              {isRepo && branches.length > 0 ? (
                <div className="space-y-1">
                  <Label>Ветка</Label>
                  <Select value={branch} onValueChange={setBranch}>
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
                  <p className="text-xs text-muted-foreground">
                    Будет выполнено: git checkout {branch || "..."} && git pull --ff-only
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Папка не является git-репозиторием. Пропустите шаг — будет создан новый проект.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="w-name">ФИО</Label>
                <Input
                  id="w-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="w-email">Email</Label>
                <Input
                  id="w-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="iivanov@nota.tech"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Используется как автор локализаций: <code className="font-mono">ФИО &lt;email&gt;</code>
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
              <ArrowLeft className="size-4" /> Назад
            </Button>
            <Button size="sm" onClick={next}>
              {step === STEPS.length - 1 ? "Завершить" : "Далее"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/60" : "w-4 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
