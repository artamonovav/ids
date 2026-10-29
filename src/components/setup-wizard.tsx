import * as React from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ArrowRight } from "lucide-react"
import {
  BranchSelect,
  ProjectSourceFields,
  defaultBranch,
  useProjectSource,
} from "@/components/project-source"

const STEPS = ["Папка проекта", "Ветка", "Профиль"] as const

export function SetupWizard() {
  const completeSetup = useStore((s) => s.completeSetup)
  const config = useStore((s) => s.config)
  const { toast } = useToast()
  const source = useProjectSource()

  const [step, setStep] = React.useState(0)
  const [name, setName] = React.useState(config.profile.name)
  const [email, setEmail] = React.useState(config.profile.email)
  const [branch, setBranch] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const checked = source.checked
  const isRepo = !!checked?.isRepo && checked.branches.length > 0

  React.useEffect(() => {
    setBranch(checked && isRepo ? defaultBranch(checked.branches) : "")
  }, [checked])

  function validateStep(): string | null {
    switch (step) {
      case 0:
        if (!source.folder.trim()) return "Укажите путь к папке проекта"
        if (!checked) return "Сначала проверьте папку"
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
    setSaving(true)
    try {
      await completeSetup(
        source.folder.trim(),
        name.trim(),
        email.trim(),
        isRepo ? branch : null,
      )
      toast({ title: "Проект открыт", description: "Открываю рабочую область…" })
    } catch (e) {
      toast({ title: "Ошибка открытия проекта", description: String(e), variant: "destructive" })
    }
    setSaving(false)
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
          {step === 0 && <ProjectSourceFields source={source} idPrefix="w" />}

          {step === 1 && (
            <div className="space-y-3">
              {isRepo ? (
                <>
                  <BranchSelect
                    branches={checked!.branches}
                    value={branch}
                    onChange={setBranch}
                  />
                  <p className="text-xs text-muted-foreground">
                    Будет выполнено: git checkout {branch || "..."} && git pull --ff-only
                  </p>
                </>
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
              disabled={step === 0 || saving}
            >
              <ArrowLeft className="size-4" /> Назад
            </Button>
            <Button size="sm" onClick={next} disabled={saving}>
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
